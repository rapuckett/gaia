-- A separate send capability: the phone keeps the secret (rotate, delete) and
-- gives only the send token to the PC. Rows from before this have an empty
-- hash, which matches no token, so they cannot send until re-registered.
ALTER TABLE handles ADD COLUMN send_hash TEXT NOT NULL DEFAULT '';
