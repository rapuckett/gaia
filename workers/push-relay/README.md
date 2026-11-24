# GAIA push relay

A Cloudflare Worker with D1 that lets GAIA on a PC wake its paired phones
through Apple Push Notification service (APNs) and Firebase Cloud Messaging
(FCM). Whoever publishes the phone app runs one. The PC never holds Apple or
Google keys, and the relay never sees what a notification says.

- **The phone** registers its APNs or FCM token here, once per paired PC, and
  gets back a *handle*, a *secret* and a *send token*. It keeps the secret,
  which rotates or deletes the handle, and hands only the handle and send token
  to that PC over the paired connection. A PC can therefore push to its own
  handle but never point it at another device.
- **The PC** posts an end-to-end encrypted blob to the handle. The relay looks up
  the token and forwards the blob to APNs or FCM unread. The phone decrypts it
  with a key agreed at pairing, in its notification service extension (iOS) or
  messaging service (Android).
- **What the Worker stores:** handle id, SHA-256 of the secret and of the send
  token, platform, token, app id, APNs environment, three timestamps, and the
  current APNs provider token. It stores no payloads and no raw IPs, and its own
  log lines carry only status codes and handle-id prefixes. Cloudflare still
  keeps its own platform request logs and analytics for the account.

Moving the app to another publisher means a new app build pointing at a new
relay. GAIA on the PC needs no change.

This directory is isolated infra: it does not import any `src/gaia` code.

## API

All bodies are JSON. Errors are `{error, message?}`.

| Call | Auth | Body | Success |
|---|---|---|---|
| `POST /v1/handles` | none, limited per client IP | `{platform: "apns"\|"fcm", token, app_id, environment: "sandbox"\|"production"}` | `201 {handle, secret, send_token}` |
| `PUT /v1/handles/{handle}` | `Bearer <secret>` | `{token}` | `204` |
| `DELETE /v1/handles/{handle}` | `Bearer <secret>` | none | `204` |
| `POST /v1/handles/{handle}/send` | `Bearer <send_token>` | `{delivery: "alert"\|"silent", ciphertext, nonce, collapse_id?}` | `202` |
| `GET /v1/health` | none | none | `200 {ok: true}` |

**Handles**

- `handle` is 16 random bytes; `secret` and `send_token` are 32 random bytes
  each. All three are base64url.
- `PUT` and `DELETE` accept only the secret, and `send` accepts only the send
  token.
- `app_id` must be in `ALLOWED_APP_IDS`, or the call gets `400 app_not_allowed`.
  On APNs it is the topic (the iOS bundle id). On FCM it is the Android package
  name, sent as `restricted_package_name`.
- `environment` picks `api.sandbox.push.apple.com` or `api.push.apple.com`. FCM
  ignores it.
- APNs tokens are stored lowercased, so case variants of one device are one
  token. FCM tokens are at most 512 characters.
- A token holds at most `MAX_HANDLES_PER_TOKEN` handles. A register or `PUT` past
  that gets `409 too_many_handles` and changes nothing; the phone deletes one of
  its own handles first.
- `PUT` replaces the token after the OS rotates it, and is the only call that
  keeps a handle alive. The phone PUTs right after registering, which confirms
  the handle, and again on each start.
- The daily cron deletes a handle never confirmed within `PENDING_HOURS`, and
  one with no `PUT` for `STALE_DAYS`. Sends don't count, so a PC the phone has
  stopped trusting cannot keep a handle alive.
- At each send the handle's `app_id` is checked against `ALLOWED_APP_IDS` again.
  A handle whose app is no longer served is deleted and gets `410`.

**Sending**

- `ciphertext` is base64url, at most 3,000 characters. `nonce` is exactly 12
  bytes, base64url. `collapse_id` is opaque, 1 to 64 printable ASCII characters.
  It is passed through as `apns-collapse-id` or FCM's `collapse_key`.
- `delivery: "alert"`:
  - APNs gets `apns-push-type: alert`, priority 10, and
    `{aps: {alert: {"loc-key": "PUSH_GENERIC"}, "mutable-content": 1}, c, n}`.
    The app's `Localizable.strings` holds the generic `PUSH_GENERIC` text, so a
    phone that cannot decrypt still shows a localized notice.
  - FCM gets a data-only message `{c, n}` at priority `HIGH`.
- `delivery: "silent"`:
  - APNs gets `apns-push-type: background`, priority 5, and
    `{aps: {"content-available": 1}, c, n}`.
  - FCM gets the same data-only message at priority `NORMAL`.
- `c` is the ciphertext and `n` the nonce, both unchanged.

**Status codes**

| Status | When |
|---|---|
| `400` | A malformed body, an unknown field, a bad `delivery`, a size limit broken, or an app id that is not allowed |
| `401 {error: "unauthorized"}` | An unknown handle, a wrong credential, the other kind of credential and a missing `Authorization` header all look the same |
| `410 {error: "gone"}` | The token is dead (APNs 410 or 400 `BadDeviceToken`; FCM `UNREGISTERED`), or the handle's app is no longer allowed. The handle is deleted, and the caller should drop it. This status is sent only to a caller with the right send token. |
| `409 {error: "too_many_handles"}` | The device token already has `MAX_HANDLES_PER_TOKEN` handles |
| `413` | The body is over `MAX_BODY_BYTES`, by Content-Length or by bytes read |
| `429 {error: "rate_limited", retry_after}` | A rate limit is hit. The `Retry-After` header is set. |
| `500 {error: "missing_config" \| "invalid_config", message}` | A secret, `ALLOWED_APP_IDS` or the `HANDLES_LIMITER` binding needed for the call is unset or malformed, or a test-only provider override is not loopback. The message names it. |
| `502 {error: "upstream_unavailable", retry_after?}` | APNs answers 5xx or 429, FCM is unavailable, or the network fails. The relay does not retry; the caller may. |
| `502 {error: "upstream_rejected", message}` | APNs or FCM refused the push for another reason, which the message names (e.g. `InvalidProviderToken`) |

**Rate limits:**

- **Per handle and per IP** are fixed windows counted in D1. Alerts count against
  `SEND_PER_MINUTE` and `SEND_PER_DAY` per handle, and silent pushes against
  their own `SILENT_PER_MINUTE` and `SILENT_PER_DAY`. Registrations count against
  `REGISTER_PER_HOUR` per client, keyed by an HMAC under `IP_HASH_SALT` of the
  IPv4 address or the IPv6 /64.
- **A global ceiling** covers every `/v1/handles` call, through the `HANDLES_LIMITER`
  [rate-limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
  in `wrangler.toml` (default 1,000 calls per 60 s). Cloudflare counts it per
  location and approximately. It answers `429` with `Retry-After: 60`.

**Logs:** the Worker's own log lines carry status codes and the first six
characters of a handle id, never tokens, secrets, send tokens, ciphertext,
collapse ids or IPs. `wrangler.toml` turns Workers Logs off (`[observability]`),
so those lines are not kept unless you turn it on.

## Configuration

Every value comes from the environment. `wrangler.toml` holds no account id,
database id, route or domain. Its `HANDLES_LIMITER` `namespace_id` is any
positive integer unique within your account, not an account id.

**Vars** (in `wrangler.toml`; override per deploy):

| Name | Default | Meaning |
|---|---|---|
| `ALLOWED_APP_IDS` | empty | Comma-separated app ids this relay serves. Required: empty fails registration and every send with a `500`. |
| `MAX_HANDLES_PER_TOKEN` | `8` | Handles allowed per device token |
| `SEND_PER_MINUTE` / `SEND_PER_DAY` | `10` / `500` | Alert budget per handle |
| `SILENT_PER_MINUTE` / `SILENT_PER_DAY` | `2` / `300` | Silent-push budget per handle |
| `REGISTER_PER_HOUR` | `20` | Registrations per client IP |
| `STALE_DAYS` | `180` | Days without a `PUT` before the cron deletes a handle |
| `PENDING_HOURS` | `48` | Hours a handle may stay unconfirmed before the cron deletes it |
| `MAX_BODY_BYTES` | `8192` | Largest request body read |

**Secrets** (`wrangler secret put <NAME>`, value on stdin):

| Name | Needed for | Value |
|---|---|---|
| `APNS_KEY_P8` | iOS sends | The APNs auth key `.p8` file's contents (PEM PKCS#8) |
| `APNS_KEY_ID` | iOS sends | That key's 10-character key id |
| `APNS_TEAM_ID` | iOS sends | The Apple developer team id |
| `FCM_SERVICE_ACCOUNT_JSON` | Android sends | A Firebase service account's JSON key, with the Firebase Cloud Messaging API enabled |
| `IP_HASH_SALT` | registration | A long random string, e.g. `openssl rand -base64 32` |

A send to a platform whose secrets are unset fails with a 500 that names them.
The relay never falls back to another provider. A relay serving only one
platform needs only that platform's secrets.

**Test-only provider overrides** (local end-to-end runs against a fake APNs or
FCM; set them in `.dev.vars` or with `--var` on `wrangler dev`, never in
`wrangler.toml` or on a deploy):

| Name | Form | Replaces |
|---|---|---|
| `APNS_HOST_OVERRIDE` | `host[:port]` (means `https://`) or an origin, e.g. `http://127.0.0.1:8443`; no path | `https://api.sandbox.push.apple.com` and `https://api.push.apple.com`, for both environments |
| `FCM_TOKEN_URL_OVERRIDE` | A URL, e.g. `http://127.0.0.1:9000/token` | `https://oauth2.googleapis.com/token`, also used as the OAuth assertion's `aud` |
| `FCM_API_BASE_OVERRIDE` | A base URL, e.g. `http://127.0.0.1:9000`; `/v1/projects/...` is appended | `https://fcm.googleapis.com` |

These requests carry the APNs provider token, the signed OAuth assertion and the
FCM access token, so each override is honored only when its host is `127.0.0.1`,
`localhost` or `[::1]` (`http:` or `https:`, any port). Any other value,
including userinfo, a query or a fragment, fails the send with
`500 invalid_config` naming the var, before any provider call or quota is spent;
the relay never falls back to the real host. Unset or empty means the real
hosts.

## Self-hosting

You need a Cloudflare account with Workers and D1, an Apple developer account
for iOS, and a Firebase project for Android.

1. **Install:** `npm install` in this directory.
2. **Create the database:** run `npx wrangler d1 create <name>`. It prints a
   `database_id`. Add it to the `[[d1_databases]]` block of a copy of
   `wrangler.toml` kept outside the repo, or have your deploy script write one.
3. **Apply the schema:** `npx wrangler d1 migrations apply DB --remote -c <your wrangler.toml>`.
4. **Set the secrets** from files or variables on stdin, never as arguments:
   ```bash
   npx wrangler secret put APNS_KEY_P8 -c <your wrangler.toml> < AuthKey_XXXXXXXXXX.p8
   printf %s "$APNS_KEY_ID" | npx wrangler secret put APNS_KEY_ID -c <your wrangler.toml>
   # likewise APNS_TEAM_ID, FCM_SERVICE_ACCOUNT_JSON (< key.json), IP_HASH_SALT
   ```
5. **Set `ALLOWED_APP_IDS`** to your iOS bundle id and Android package name, in
   your copy of `wrangler.toml` or with `--var` on deploy.
6. **Deploy:** `npx wrangler deploy -c <your wrangler.toml>`. Add a route or
   custom domain in your copy if you don't want the `workers.dev` URL.
7. **Point the app at it** by building the phone app with
   `GAIA_PUSH_RELAY_URL=https://<your relay>`.

Check it with `curl https://<your relay>/v1/health`.

**APNs needs HTTP/2.** A deployed Worker reaches APNs because Cloudflare's
proxy upgrades the subrequest. Local `wrangler dev` (workerd) has no HTTP/2
client, so APNs sends fail locally with a lost connection. Test iOS delivery
against a deployed sandbox relay.

## Development

```bash
npm install
npm run typecheck
npm test               # vitest in Node 22.13+, against D1 on node:sqlite with the real migrations
npm run migrate:local  # then `npm run dev`, with secrets in .dev.vars
```

The tests stub `fetch`. They check each outgoing call's host, headers and body,
and verify the APNs and OAuth JWTs against keys generated in the test. They
never call Apple, Google or Cloudflare. An end-to-end run against a local fake
provider points the relay at it with the test-only overrides under
[Configuration](#configuration).
