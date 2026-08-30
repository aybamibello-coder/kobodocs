"""
KoboDocs Transcribe — social link extraction service.

Small, standalone service that does ONE job: given a YouTube/TikTok/
Instagram/etc. URL, extract the audio with yt-dlp and upload it straight
into the transcription-media Supabase Storage bucket, in the same
{user_id}/{file_id}/original.<ext> path convention the normal file-upload
flow already uses. Returns the storage path + duration so the caller
(the transcribe-start edge function) can continue exactly like a normal
uploaded file from that point on.

This has to run as its own always-on service (not a Supabase Edge
Function) because it needs to spawn yt-dlp + ffmpeg as real subprocesses,
which Deno Deploy's edge runtime does not allow.

Auth: a single shared-secret bearer token (EXTRACTION_SHARED_SECRET),
checked on every request — this service is only ever called
server-to-server by transcribe-start, never directly by a browser.

FIX (Aug 2026): a real customer hit "unable to obtain file audio codec
with ffprobe" on a TikTok link (vt.tiktok.com short link) — yt-dlp
reported success but the resulting file wasn't valid audio. This is a
known, common failure mode for sites like TikTok that actively resist
automated downloads (throttled/partial responses, blocked requests that
still return a 200 with an HTML page, etc.), not a missing-ffmpeg issue
(ffmpeg is installed — see Dockerfile). Added: real post-download
validation via ffprobe before declaring success, one automatic retry
with a different format selector if the first attempt produced an
invalid file, and a clear, actionable error (pointing at the "Upload
file" tab as a fallback) if it still fails after that.
"""

import os
import subprocess
import tempfile
import uuid
from pathlib import Path

import httpx
import yt_dlp
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

app = FastAPI(title="KoboDocs Transcribe Extraction Service")

SHARED_SECRET = os.environ["EXTRACTION_SHARED_SECRET"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Duration cap independent of any plan limit — a hard ceiling so a
# malicious or mistaken link (e.g. a 10-hour livestream) can't tie up
# this service's disk/CPU indefinitely. transcribe-start still enforces
# the caller's actual plan limit on top of this.
MAX_DURATION_SECONDS = 6 * 60 * 60  # 6 hours

FRIENDLY_EXTRACTION_ERROR = (
    "Could not get usable audio from that link — the site may be blocking "
    "automated downloads for this content. Try downloading the video "
    "yourself (save it to your device) and using the \"Upload file\" tab "
    "instead."
)


class ExtractRequest(BaseModel):
    url: str
    user_id: str
    file_id: str


def verify_secret(authorization: str | None):
    if not authorization or authorization != f"Bearer {SHARED_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


def find_output_file(tmpdir: str) -> Path | None:
    candidates = list(Path(tmpdir).glob("audio.*"))
    return candidates[0] if candidates else None


def has_valid_audio_stream(path: Path) -> bool:
    """Runs ffprobe directly (not through yt-dlp) to confirm the file has
    a real, readable audio stream with nonzero duration — this is exactly
    the check that was missing before, which let a broken/empty download
    slip through as if it had succeeded."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1",
                str(path),
            ],
            capture_output=True, text=True, timeout=30,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False
    output = result.stdout
    if "codec_type=audio" not in output:
        return False
    for line in output.splitlines():
        if line.startswith("duration="):
            try:
                if float(line.split("=", 1)[1]) <= 0:
                    return False
            except ValueError:
                return False
    return result.returncode == 0


def run_extraction(url: str, tmpdir: str, format_selector: str) -> dict:
    """One attempt at downloading + extracting audio. Raises
    yt_dlp.utils.DownloadError on failure; returns yt-dlp's info dict on
    a download that at least completed (still needs ffprobe validation
    by the caller — yt-dlp reporting success doesn't guarantee the file
    is actually valid, which is exactly what caused the original bug)."""
    out_template = str(Path(tmpdir) / "audio.%(ext)s")
    ydl_opts = {
        "format": format_selector,
        "outtmpl": out_template,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "128",
        }],
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "max_filesize": 500 * 1024 * 1024,  # 500MB raw download safety cap
        "retries": 3,
        "fragment_retries": 3,
        "socket_timeout": 30,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=True)


@app.post("/extract")
async def extract(req: ExtractRequest, authorization: str | None = Header(None)):
    verify_secret(authorization)

    with tempfile.TemporaryDirectory() as tmpdir:
        info = None
        last_error: str | None = None

        # Try the normal best-audio selector first, then fall back to a
        # broader "best" selector on retry -- some sources (TikTok
        # especially) intermittently serve a broken/partial response for
        # the preferred format but succeed on a different one.
        for attempt, format_selector in enumerate(["bestaudio/best", "best"]):
            # Clear any partial output from a previous attempt before retrying.
            for leftover in Path(tmpdir).glob("audio.*"):
                leftover.unlink(missing_ok=True)

            try:
                info = run_extraction(req.url, tmpdir, format_selector)
            except yt_dlp.utils.DownloadError as e:
                last_error = str(e)
                continue

            output_path = find_output_file(tmpdir)
            if output_path and has_valid_audio_stream(output_path):
                break  # success
            last_error = "downloaded file had no valid audio stream"
            info = None  # don't treat this attempt as successful

        if info is None:
            raise HTTPException(status_code=422, detail=FRIENDLY_EXTRACTION_ERROR)

        duration = info.get("duration")
        if duration and duration > MAX_DURATION_SECONDS:
            raise HTTPException(status_code=422, detail=f"That link is longer than the {MAX_DURATION_SECONDS // 3600}-hour limit for link transcription.")

        title = info.get("title") or "audio"

        mp3_path = find_output_file(tmpdir)
        if not mp3_path:
            raise HTTPException(status_code=500, detail="Extraction produced no output file.")

        storage_path = f"{req.user_id}/{req.file_id}/original.mp3"
        upload_url = f"{SUPABASE_URL}/storage/v1/object/transcription-media/{storage_path}"

        with open(mp3_path, "rb") as f:
            audio_bytes = f.read()

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                upload_url,
                headers={
                    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey": SUPABASE_SERVICE_ROLE_KEY,
                    "Content-Type": "audio/mpeg",
                },
                content=audio_bytes,
            )
        if resp.status_code >= 300:
            raise HTTPException(status_code=502, detail=f"Could not store extracted audio: {resp.text}")

        return {
            "storage_path": storage_path,
            "duration_seconds": duration,
            "title": title,
            "file_size_bytes": len(audio_bytes),
        }


@app.get("/health")
async def health():
    return {"status": "ok"}
