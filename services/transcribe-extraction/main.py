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
"""

import os
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


class ExtractRequest(BaseModel):
    url: str
    user_id: str
    file_id: str


def verify_secret(authorization: str | None):
    if not authorization or authorization != f"Bearer {SHARED_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.post("/extract")
async def extract(req: ExtractRequest, authorization: str | None = Header(None)):
    verify_secret(authorization)

    with tempfile.TemporaryDirectory() as tmpdir:
        out_template = str(Path(tmpdir) / "audio.%(ext)s")

        ydl_opts = {
            "format": "bestaudio/best",
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
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(req.url, download=True)
        except yt_dlp.utils.DownloadError as e:
            raise HTTPException(status_code=422, detail=f"Could not extract audio from that link: {e}")

        duration = info.get("duration")
        if duration and duration > MAX_DURATION_SECONDS:
            raise HTTPException(status_code=422, detail=f"That link is longer than the {MAX_DURATION_SECONDS // 3600}-hour limit for link transcription.")

        title = info.get("title") or "audio"

        mp3_path = Path(tmpdir) / "audio.mp3"
        if not mp3_path.exists():
            # Fallback in case the postprocessor produced a different filename
            candidates = list(Path(tmpdir).glob("audio.*"))
            if not candidates:
                raise HTTPException(status_code=500, detail="Extraction produced no output file.")
            mp3_path = candidates[0]

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
