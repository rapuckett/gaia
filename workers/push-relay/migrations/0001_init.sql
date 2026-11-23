-- A handle is one pairing's capability to push to one device token. The secret
-- is stored only as its SHA-256; the relay never holds a payload.
CREATE TABLE handles (
  id           TEXT PRIMARY KEY,                 -- 16 random bytes, base64url
  secret_hash  TEXT NOT NULL,                    -- SHA-256(secret), base64url
  platform     TEXT NOT NULL CHECK (platform IN ('apns', 'fcm')),
  token        TEXT NOT NULL,
  app_id       TEXT NOT NULL,
  environment  TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  created_at   INTEGER NOT NULL,                 -- unix ms
  last_used_at INTEGER NOT NULL                  -- unix ms of the last send or PUT
);

CREATE INDEX handles_by_token ON handles (platform, token, created_at);
CREATE INDEX handles_by_last_used ON handles (last_used_at);

-- Fixed-window counters. `subject` is a handle id or a salted hash of a client
-- IP, never a raw IP.
CREATE TABLE rate_counters (
  scope        TEXT NOT NULL,                    -- e.g. 'send_minute', 'register_hour'
  subject      TEXT NOT NULL,
  window_start INTEGER NOT NULL,                 -- unix ms
  expires_at   INTEGER NOT NULL,                 -- unix ms the window ends
  count        INTEGER NOT NULL,
  PRIMARY KEY (scope, subject, window_start)
);

CREATE INDEX rate_counters_by_expiry ON rate_counters (expires_at);
