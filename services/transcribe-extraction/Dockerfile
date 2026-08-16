FROM python:3.12-slim

# yt-dlp's audio-extraction postprocessor shells out to ffmpeg — this is
# exactly the kind of subprocess Supabase Edge Functions can't do, and
# the whole reason this needs its own container.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

# Railway (and most PaaS providers) inject $PORT — bind to it rather than
# a hardcoded port so the platform can route traffic correctly.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
