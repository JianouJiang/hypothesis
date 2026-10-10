declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CFD_INGEST_TOKEN?: string;
  }
}
