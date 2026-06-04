-- nodrix-collector — anonymous install/usage telemetry (Cloudflare D1).
-- Applied with: wrangler d1 execute nodrix-telemetry-stats --remote --file=./schema.sql
-- (and --local for the dev database used by `wrangler dev`).
--
-- One row per instance (dedup'd by random id). Holds ONLY anonymous metadata:
-- catalog enum names, exact counts, boolean flags. Never an IP, hostname,
-- email, name, or any variable value.
CREATE TABLE IF NOT EXISTS instances (
  instance_id TEXT PRIMARY KEY,
  first_seen  INTEGER NOT NULL,             -- epoch ms, set once on first ping
  last_seen   INTEGER NOT NULL,             -- epoch ms, updated every ping
  version     TEXT,
  commit_sha  TEXT,
  kinds       TEXT,                          -- JSON array of catalog enums, e.g. ["webhook","http"]
  counts      TEXT,                          -- JSON object, e.g. {"projects":3}
  flags       TEXT,                          -- JSON object, e.g. {"mcp":false}
  ping_count  INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_instances_last_seen  ON instances(last_seen);
CREATE INDEX IF NOT EXISTS idx_instances_first_seen ON instances(first_seen);
