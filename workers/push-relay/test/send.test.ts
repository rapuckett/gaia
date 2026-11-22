// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { base64urlDecode, base64urlEncode } from "../src/encoding";
import type { Env } from "../src/types";
import { APNS_TOKEN, APP_ID, call, FCM_TOKEN, makeEnv, register } from "./helpers";

const CIPHERTEXT = base64urlEncode(new Uint8Array(48).fill(7));
const NONCE = base64urlEncode(new Uint8Array(12).fill(1));
const ALERT = { delivery: "alert", ciphertext: CIPHERTEXT, nonce: NONCE };

function toPem(der: ArrayBuffer): string {
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64").replace(/.{64}/g, "$&\n")}\n-----END PRIVATE KEY-----\n`;
}

let apnsKeys: CryptoKeyPair;
let fcmKeys: CryptoKeyPair;
let apnsPem: string;
let fcmPem: string;

beforeAll(async () => {
  apnsKeys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  apnsPem = toPem((await crypto.subtle.exportKey("pkcs8", apnsKeys.privateKey)) as ArrayBuffer);
  fcmKeys = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  fcmPem = toPem((await crypto.subtle.exportKey("pkcs8", fcmKeys.privateKey)) as ArrayBuffer);
});

/** Decode a JWT and check its signature against `key`. */
async function verifyJwt(jwt: string, key: CryptoKey, alg: Parameters<typeof crypto.subtle.verify>[0]) {
  const [h, c, s] = jwt.split(".");
  const ok = await crypto.subtle.verify(alg, key, base64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  const dec = (x: string) => JSON.parse(new TextDecoder().decode(base64urlDecode(x)));
  return { ok, header: dec(h), claims: dec(c) };
}

interface Seen {
  url: string;
  headers: Headers;
  body: string;
}
let seen: Seen[];
let reply: (url: string) => Response;

beforeEach(() => {
  seen = [];
  reply = () => new Response(null, { status: 200 });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    seen.push({ url, headers: new Headers(init.headers), body: String(init.body) });
    return reply(url);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Each test gets its own APNs key id and service account, so the module-scope
// token caches never carry across tests.
let n = 0;
function apnsEnv(overrides: Partial<Env> = {}) {
  n++;
  return makeEnv({ APNS_KEY_P8: apnsPem, APNS_KEY_ID: `KEY${n}`, APNS_TEAM_ID: "TEAM123456", ...overrides });
}
function fcmEnv(overrides: Partial<Env> = {}) {
  n++;
  const sa = { project_id: "example-project", client_email: `relay${n}@example.iam.gserviceaccount.com`, private_key: fcmPem, private_key_id: "kid1" };
  return makeEnv({ FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(sa), ...overrides });
}
const oauthReply = (url: string) =>
  url === "https://oauth2.googleapis.com/token"
    ? Response.json({ access_token: "ya29.test-access", expires_in: 3599, token_type: "Bearer" })
    : new Response("{}", { status: 200 });

const send = (env: Env, h: { handle: string; send_token: string }, body: unknown = ALERT) =>
  call(env, "POST", `/v1/handles/${h.handle}/send`, { secret: h.send_token, body });

describe("APNs", () => {
  it("sends an alert to the sandbox host with a verifiable ES256 provider token", async () => {
    const { env } = apnsEnv();
    const h = await register(env, { environment: "sandbox" });
    const res = await send(env, h, { ...ALERT, collapse_id: "Zm9vYmFyYmF6cXV4cXV1eA" });
    expect(res.status).toBe(202);

    const [req] = seen;
    expect(req.url).toBe(`https://api.sandbox.push.apple.com/3/device/${APNS_TOKEN}`);
    expect(req.headers.get("apns-topic")).toBe(APP_ID);
    expect(req.headers.get("apns-push-type")).toBe("alert");
    expect(req.headers.get("apns-priority")).toBe("10");
    expect(req.headers.get("apns-collapse-id")).toBe("Zm9vYmFyYmF6cXV4cXV1eA");
    expect(JSON.parse(req.body)).toEqual({
      aps: { alert: { "loc-key": "PUSH_GENERIC" }, "mutable-content": 1 },
      c: CIPHERTEXT,
      n: NONCE,
    });

    const auth = req.headers.get("authorization")!;
    expect(auth.startsWith("bearer ")).toBe(true);
    const jwt = await verifyJwt(auth.slice(7), apnsKeys.publicKey, { name: "ECDSA", hash: "SHA-256" });
    expect(jwt.ok).toBe(true);
    expect(jwt.header).toEqual({ alg: "ES256", kid: env.APNS_KEY_ID });
    expect(jwt.claims.iss).toBe("TEAM123456");
    expect(Math.abs(jwt.claims.iat - Date.now() / 1000)).toBeLessThan(5);
  });

  it("sends a silent push as a priority-5 background push to the production host", async () => {
    const { env } = apnsEnv();
    const h = await register(env, { environment: "production" });
    expect((await send(env, h, { ...ALERT, delivery: "silent" })).status).toBe(202);

    const [req] = seen;
    expect(req.url).toBe(`https://api.push.apple.com/3/device/${APNS_TOKEN}`);
    expect(req.headers.get("apns-push-type")).toBe("background");
    expect(req.headers.get("apns-priority")).toBe("5");
    expect(req.headers.has("apns-collapse-id")).toBe(false);
    expect(JSON.parse(req.body)).toEqual({ aps: { "content-available": 1 }, c: CIPHERTEXT, n: NONCE });
  });

  it("shares the provider token through D1 for 40 minutes, then mints a new one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
    const { env, t } = apnsEnv({ SEND_PER_MINUTE: "100" });
    const h = await register(env);
    await send(env, h);
    const stored = () => t.query<{ token: string }>("SELECT token FROM apns_provider_tokens")[0]?.token;
    expect(`bearer ${stored()}`).toBe(seen[0].headers.get("authorization"));
    vi.setSystemTime(1_800_000_000_000 + 39 * 60_000);
    await send(env, h);
    vi.setSystemTime(1_800_000_000_000 + 41 * 60_000);
    await send(env, h);
    const [a, b, c] = seen.map((s) => s.headers.get("authorization"));
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(`bearer ${stored()}`).toBe(c);
  });

  it("uses a fresh token another isolate already stored instead of minting its own", async () => {
    const { env, t } = apnsEnv();
    t.query(
      "INSERT INTO apns_provider_tokens (key_id, team_id, issued_at, token) VALUES (?, 'TEAM123456', ?, 'shared.jwt.value')",
      env.APNS_KEY_ID!,
      Date.now() - 5 * 60_000
    );
    const h = await register(env);
    await send(env, h);
    expect(seen[0].headers.get("authorization")).toBe("bearer shared.jwt.value");
  });

  it.each(["InvalidProviderToken", "ExpiredProviderToken"])(
    "drops the shared provider token when APNs answers 403 %s",
    async (reason) => {
      const { env, t } = apnsEnv();
      const h = await register(env);
      reply = () => Response.json({ reason }, { status: 403 });
      expect((await send(env, h)).status).toBe(502);
      expect(t.query("SELECT * FROM apns_provider_tokens")).toEqual([]);

      reply = () => new Response(null, { status: 200 });
      expect((await send(env, h)).status).toBe(202);
      expect(seen[1].headers.get("authorization")).not.toBe(seen[0].headers.get("authorization"));
    }
  );

  it.each([
    [410, { reason: "Unregistered" }],
    [400, { reason: "BadDeviceToken" }],
  ])("deletes the handle and gives 410 when APNs answers %i %j", async (status, body) => {
    const { env, t } = apnsEnv();
    const h = await register(env);
    reply = () => Response.json(body, { status });
    const res = await send(env, h);
    expect(res.status).toBe(410);
    expect(t.query("SELECT id FROM handles")).toEqual([]);
  });

  it("gives 502 with retry_after for APNs 5xx and 429, without retrying, and keeps the handle", async () => {
    const { env, t } = apnsEnv();
    const h = await register(env);
    reply = () => Response.json({ reason: "ServiceUnavailable" }, { status: 503, headers: { "retry-after": "30" } });
    const res = await send(env, h);
    expect(res.status).toBe(502);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toEqual({ error: "upstream_unavailable", retry_after: 30 });
    expect(seen).toHaveLength(1);

    reply = () => Response.json({ reason: "TooManyRequests" }, { status: 429 });
    expect(((await (await send(env, h)).json()) as any).error).toBe("upstream_unavailable");
    expect(t.query("SELECT id FROM handles")).toHaveLength(1);
  });

  it("gives 502 naming Apple's reason for other refusals, and keeps the handle", async () => {
    const { env, t } = apnsEnv();
    const h = await register(env);
    reply = () => Response.json({ reason: "InvalidProviderToken" }, { status: 403 });
    const res = await send(env, h);
    expect(res.status).toBe(502);
    const body = (await res.json()) as any;
    expect(body.error).toBe("upstream_rejected");
    expect(body.message).toContain("InvalidProviderToken");
    expect(t.query("SELECT id FROM handles")).toHaveLength(1);
  });

  it("gives 500 naming each missing APNs secret, before calling APNs or spending quota", async () => {
    const { env, t } = makeEnv({ APNS_KEY_P8: apnsPem });
    const h = await register(env);
    const res = await send(env, h);
    expect(res.status).toBe(500);
    const msg = ((await res.json()) as any).message;
    expect(msg).toContain("APNS_KEY_ID");
    expect(msg).toContain("APNS_TEAM_ID");
    expect(msg).not.toContain("APNS_KEY_P8");
    expect(seen).toEqual([]);
    expect(t.query("SELECT * FROM rate_counters WHERE scope LIKE 'send%'")).toEqual([]);
  });
});

describe("FCM", () => {
  it("mints an OAuth token from the service account and sends a high-priority data-only alert", async () => {
    const { env } = fcmEnv();
    const h = await register(env, { platform: "fcm", token: FCM_TOKEN, environment: "production" });
    reply = oauthReply;
    expect((await send(env, h, { ...ALERT, collapse_id: "abc_-123" })).status).toBe(202);

    const [oauth, msg] = seen;
    expect(oauth.url).toBe("https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(oauth.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const jwt = await verifyJwt(form.get("assertion")!, fcmKeys.publicKey, { name: "RSASSA-PKCS1-v1_5" });
    expect(jwt.ok).toBe(true);
    expect(jwt.header).toEqual({ alg: "RS256", typ: "JWT", kid: "kid1" });
    expect(jwt.claims).toMatchObject({
      iss: JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON!).client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect(jwt.claims.exp - jwt.claims.iat).toBe(3600);

    expect(msg.url).toBe("https://fcm.googleapis.com/v1/projects/example-project/messages:send");
    expect(msg.headers.get("authorization")).toBe("Bearer ya29.test-access");
    expect(JSON.parse(msg.body)).toEqual({
      message: {
        token: FCM_TOKEN,
        data: { c: CIPHERTEXT, n: NONCE },
        android: { priority: "HIGH", restricted_package_name: APP_ID, collapse_key: "abc_-123" },
      },
    });
  });

  it("sends a silent push at NORMAL priority and reuses the cached access token", async () => {
    const { env } = fcmEnv();
    const h = await register(env, { platform: "fcm", token: FCM_TOKEN });
    reply = oauthReply;
    await send(env, h);
    await send(env, h, { ...ALERT, delivery: "silent" });
    expect(seen.map((s) => new URL(s.url).host)).toEqual(["oauth2.googleapis.com", "fcm.googleapis.com", "fcm.googleapis.com"]);
    expect(JSON.parse(seen[2].body).message).toEqual({
      token: FCM_TOKEN,
      data: { c: CIPHERTEXT, n: NONCE },
      android: { priority: "NORMAL", restricted_package_name: APP_ID },
    });
  });

  it.each([
    [404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }],
    [400, { error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "UNREGISTERED" }] } }],
  ])("deletes the handle and gives 410 when FCM answers %i %j", async (status, body) => {
    const { env, t } = fcmEnv();
    const h = await register(env, { platform: "fcm", token: FCM_TOKEN });
    reply = (url) => (url.includes("oauth2") ? oauthReply(url) : Response.json(body, { status }));
    expect((await send(env, h)).status).toBe(410);
    expect(t.query("SELECT id FROM handles")).toEqual([]);
  });

  it("keeps the handle and gives 502 naming the reason for a 404 that is not UNREGISTERED", async () => {
    const { env, t } = fcmEnv();
    const h = await register(env, { platform: "fcm", token: FCM_TOKEN });
    reply = (url) => (url.includes("oauth2") ? oauthReply(url) : Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 }));
    const res = await send(env, h);
    expect(res.status).toBe(502);
    const body = (await res.json()) as any;
    expect(body.error).toBe("upstream_rejected");
    expect(body.message).toContain("NOT_FOUND");
    expect(t.query("SELECT id FROM handles")).toHaveLength(1);
  });

  it("gives 502 for FCM UNAVAILABLE without retrying", async () => {
    const { env } = fcmEnv();
    const h = await register(env, { platform: "fcm", token: FCM_TOKEN });
    reply = (url) =>
      url.includes("oauth2") ? oauthReply(url) : Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 });
    const res = await send(env, h);
    expect(res.status).toBe(502);
    expect(((await res.json()) as any).error).toBe("upstream_unavailable");
    expect(seen.filter((s) => s.url.includes("fcm.googleapis.com"))).toHaveLength(1);
  });

  it("gives 500 naming FCM_SERVICE_ACCOUNT_JSON when it is missing", async () => {
    const { env } = makeEnv();
    const h = await register(env, { platform: "fcm", token: FCM_TOKEN });
    const res = await send(env, h);
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).message).toContain("FCM_SERVICE_ACCOUNT_JSON");
    expect(seen).toEqual([]);
  });
});

describe("send validation and limits", () => {
  it.each([
    [{ ...ALERT, delivery: undefined }, "invalid_delivery"],
    [{ ...ALERT, delivery: "loud" }, "invalid_delivery"],
    [{ ...ALERT, kind: "approval" }, "unknown_field"],
    [{ ...ALERT, badge: 3 }, "unknown_field"],
    [{ ...ALERT, ciphertext: "A".repeat(3001) }, "invalid_ciphertext"],
    [{ ...ALERT, ciphertext: "not+base64url" }, "invalid_ciphertext"],
    [{ ...ALERT, nonce: base64urlEncode(new Uint8Array(16)) }, "invalid_nonce"],
    [{ ...ALERT, collapse_id: "x".repeat(65) }, "invalid_collapse_id"],
  ])("refuses %j with 400 %s, without calling a provider", async (body, code) => {
    const { env } = apnsEnv();
    const h = await register(env);
    const res = await send(env, h, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe(code);
    expect(seen).toEqual([]);
  });

  it("accepts the largest allowed ciphertext and collapse id", async () => {
    const { env } = apnsEnv();
    const h = await register(env);
    expect((await send(env, h, { ...ALERT, ciphertext: "A".repeat(3000), collapse_id: "x".repeat(64) })).status).toBe(202);
  });

  it("refuses a send body over MAX_BODY_BYTES with 413", async () => {
    const { env } = apnsEnv({ MAX_BODY_BYTES: "256" });
    const h = await register(env);
    const res = await send(env, h, { ...ALERT, ciphertext: "A".repeat(300) });
    expect(res.status).toBe(413);
    expect(seen).toEqual([]);
  });

  it("does not refresh last_used_at, so only the phone's PUTs keep a handle alive", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_800_000_000_000);
    const { env, t } = apnsEnv();
    const h = await register(env);
    vi.setSystemTime(1_800_000_000_000 + 3_600_000);
    expect((await send(env, h)).status).toBe(202);
    expect(t.query("SELECT last_used_at FROM handles")).toEqual([{ last_used_at: 1_800_000_000_000 }]);
  });

  it("deletes the handle and gives 410 when its app id is no longer allowed", async () => {
    const { env, t } = apnsEnv({ ALLOWED_APP_IDS: `${APP_ID},com.example.next` });
    const h = await register(env);
    env.ALLOWED_APP_IDS = "com.example.next";
    const res = await send(env, h);
    expect(res.status).toBe(410);
    expect(t.query("SELECT id FROM handles")).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("gives 401, not 410, for a wrong send token or the handle's secret", async () => {
    const { env } = apnsEnv();
    const h = await register(env);
    reply = () => Response.json({ reason: "Unregistered" }, { status: 410 });
    const wrong = await send(env, { ...h, send_token: "C".repeat(43) });
    const managing = await send(env, { ...h, send_token: h.secret });
    expect([wrong.status, managing.status]).toEqual([401, 401]);
    expect(await managing.text()).toBe('{"error":"unauthorized"}');
    expect(seen).toEqual([]);
  });

  it("counts silent pushes in their own budget, apart from alerts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 22, 12, 0, 20));
    const { env } = apnsEnv({ SEND_PER_MINUTE: "2", SILENT_PER_MINUTE: "1" });
    const h = await register(env);
    const silent = { ...ALERT, delivery: "silent" };

    expect((await send(env, h)).status).toBe(202);
    expect((await send(env, h, silent)).status).toBe(202);
    const silentOver = await send(env, h, silent);
    expect(silentOver.status).toBe(429);
    expect(silentOver.headers.get("retry-after")).toBe("40");
    expect((await send(env, h)).status).toBe(202);
    expect((await send(env, h)).status).toBe(429);

    vi.setSystemTime(Date.UTC(2026, 10, 22, 12, 1, 0));
    expect((await send(env, h, silent)).status).toBe(202);
  });

  it("enforces the per-day budget with Retry-After to the next UTC day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 22, 23, 0, 0));
    const { env } = apnsEnv({ SEND_PER_DAY: "1" });
    const h = await register(env);
    await send(env, h);
    const res = await send(env, h);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
  });
});
