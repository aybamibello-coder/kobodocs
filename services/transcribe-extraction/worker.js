// Cloudflare Worker entry point for the extraction service container.
// Containers are routed to via a Durable Object binding — this Worker's
// only job is to forward incoming requests to the running container
// instance. The actual logic lives in main.py (FastAPI + yt-dlp).
import { Container, getContainer } from "@cloudflare/containers";

export class ExtractionContainer extends Container {
  defaultPort = 8000;
  // Scales to zero after 5 minutes idle — this service only runs when
  // someone submits a social link, so most of the time it costs nothing
  // (Cloudflare's active-CPU pricing only bills while a request is
  // actually being processed).
  sleepAfter = "5m";
}

export default {
  async fetch(request, env) {
    const container = getContainer(env.EXTRACTION_CONTAINER);
    return container.fetch(request);
  },
};
