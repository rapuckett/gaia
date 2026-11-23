-- A handle is confirmed by its first authenticated PUT; the cron deletes
-- handles left unconfirmed past PENDING_HOURS. Handles from before this were
-- already in use, so they count as confirmed. From here on last_used_at moves
-- only on a PUT, never on a send.
ALTER TABLE handles ADD COLUMN confirmed_at INTEGER;
UPDATE handles SET confirmed_at = created_at;
CREATE INDEX handles_by_pending ON handles (confirmed_at, created_at);

-- The APNs provider token, shared by every isolate so Apple sees one token per
-- key, refreshed at most every 40 minutes.
CREATE TABLE apns_provider_tokens (
  key_id    TEXT PRIMARY KEY,
  team_id   TEXT NOT NULL,
  issued_at INTEGER NOT NULL,   -- unix ms
  token     TEXT NOT NULL
);
