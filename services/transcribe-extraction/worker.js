// Cloudflare Worker entry point for the extraction service container.
// Containers are routed to via a Durable Object binding — this Worker's
// only job is to forward incoming requests to the running container
// instance, after passing the required secrets in as envVars (the
// container process reads these the same way it would read any other
// os.environ value — Worker secrets aren't otherwise visible inside the
// container). The actual logic lives in main.py (FastAPI + yt-dlp).
import { Container, getContainer } from "@cloudflare/containers";

export class ExtractionContainer extends Container {
  defaultPort = 8000;
  // Scales to zero after 5 minutes idle — this service only runs when
  // someone submits a social link, so most of the time it costs nothing
  // (Cloudflare's active-CPU pricing only bills while a request is
  // actually being processed).
  sleepAfter = "5m";

  constructor(ctx, env) {
    super(ctx, env);
    // env is only available here, at construction time — not as a class
    // field — so envVars gets built dynamically rather than hardcoded.
    this.envVars = {
      EXTRACTION_SHARED_SECRET: env.EXTRACTION_SHARED_SECRET,
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
}

export default {
  async fetch(request, env) {
    const container = getContainer(env.EXTRACTION_CONTAINER);
    return container.fetch(request);
  },
};
