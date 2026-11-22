// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import { clientSubject } from "../src/clientip";
import { base64urlDecode, base64urlEncode, sha256 } from "../src/encoding";
import { APNS_TOKEN, APP_ID, call, confirm, fakeLimiter, FCM_TOKEN, makeEnv, register } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("POST /v1/handles", () => {
  it("returns a 16-byte handle, a 32-byte secret and send token, and stores only their hashes", async () => {
    const { env, t } = makeEnv();
    const { handle, secret, send_token } = await register(env);
    expect(base64urlDecode(handle)).toHaveLength(16);
    expect(base64urlDecode(secret)).toHaveLength(32);
    expect(base64urlDecode(send_token)).toHaveLength(32);
    expect(send_token).not.toBe(secret);

    const [row] = t.query<Record<string, unknown>>("SELECT * FROM handles");
    expect(row).toMatchObject({ id: handle, platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" });
    expect(row.secret_hash).toBe(base64urlEncode(await sha256(secret)));
    expect(row.send_hash).toBe(base64urlEncode(await sha256(send_token)));
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(JSON.stringify(row)).not.toContain(send_token);
  });

  it("refuses an app id outside ALLOWED_APP_IDS", async () => {
    const { env } = makeEnv({ ALLOWED_APP_IDS: "com.example.other, com.example.gaia " });
    const bad = await call(env, "POST", "/v1/handles", {
      body: { platform: "fcm", token: FCM_TOKEN, app_id: "com.evil.app", environment: "production" },
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error).toBe("app_not_allowed");
    await register(env); // the trimmed list still matches
  });

  it("gives 500 naming ALLOWED_APP_IDS when it is empty, before counting the registration", async () => {
    const { env, t } = makeEnv({ ALLOWED_APP_IDS: " , " });
    const res = await call(env, "POST", "/v1/handles", {
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as any;
    expect(body.error).toBe("missing_config");
    expect(body.message).toContain("ALLOWED_APP_IDS");
    expect(t.query("SELECT * FROM rate_counters")).toEqual([]);
  });

  it("stores APNs tokens lowercased, so case variants are one device", async () => {
    const { env, t } = makeEnv({ MAX_HANDLES_PER_TOKEN: "1" });
    await register(env, { token: APNS_TOKEN.toUpperCase() });
    expect(t.query("SELECT token FROM handles")).toEqual([{ token: APNS_TOKEN }]);
    const res = await call(env, "POST", "/v1/handles", {
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" },
    });
    expect(res.status).toBe(409);
  });

  it("caps FCM tokens at 512 characters", async () => {
    const { env } = makeEnv();
    await register(env, { platform: "fcm", token: "a".repeat(512) });
    const res = await call(env, "POST", "/v1/handles", {
      body: { platform: "fcm", token: "a".repeat(513), app_id: APP_ID, environment: "sandbox" },
    });
    expect(res.status).toBe(400);
  });

  it.each([
    [{ platform: "webpush" }, "invalid_platform"],
    [{ environment: "staging" }, "invalid_environment"],
    [{ token: "not hex" }, "invalid_token"],
    [{ platform: "fcm", token: "has spaces in it" }, "invalid_token"],
    [{ kind: "approval" }, "unknown_field"],
  ])("refuses %j with 400 %s", async (patch, code) => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/v1/handles", {
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox", ...patch },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe(code);
  });

  it("refuses a registration past MAX_HANDLES_PER_TOKEN with 409 and evicts nothing", async () => {
    const { env, t } = makeEnv({ MAX_HANDLES_PER_TOKEN: "3" });
    const made = [];
    for (let i = 0; i < 3; i++) made.push((await register(env)).handle);
    const res = await call(env, "POST", "/v1/handles", {
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("too_many_handles");
    expect(t.query<{ id: string }>("SELECT id FROM handles").map((r) => r.id).sort()).toEqual(made.sort());
  });

  it("counts an IPv6 /64 as one client, and IPv4 by full address", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 22, 10, 0));
    const { env } = makeEnv({ REGISTER_PER_HOUR: "2" });
    await register(env, {}, "2001:db8:1:2::1");
    await register(env, {}, "2001:DB8:1:2:ffff:0:0:9");
    const res = await call(env, "POST", "/v1/handles", {
      ip: "2001:db8:1:2:abcd::",
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" },
    });
    expect(res.status).toBe(429);
    await register(env, {}, "2001:db8:1:3::1");

    expect(clientSubject("2001:0db8:0001:0002:0:0:0:1")).toBe("2001:db8:1:2::/64");
    expect(clientSubject("::ffff:192.0.2.5")).toBe("192.0.2.5");
    expect(clientSubject("192.0.2.5")).toBe("192.0.2.5");
    expect(() => clientSubject("not-an-ip")).toThrow();
  });

  it("limits registrations per client IP and stores no raw IP", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 22, 10, 15));
    const { env, t } = makeEnv({ REGISTER_PER_HOUR: "2" });
    await register(env, {}, "198.51.100.9");
    await register(env, {}, "198.51.100.9");
    const res = await call(env, "POST", "/v1/handles", {
      ip: "198.51.100.9",
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(45 * 60));
    expect(((await res.json()) as any).retry_after).toBe(45 * 60);

    await register(env, {}, "198.51.100.10"); // another IP has its own budget
    expect(JSON.stringify(t.query("SELECT * FROM rate_counters"))).not.toContain("198.51.100");
  });

  it("refuses to register without IP_HASH_SALT, naming the variable", async () => {
    const { env } = makeEnv({ IP_HASH_SALT: undefined });
    const res = await call(env, "POST", "/v1/handles", {
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" },
    });
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).message).toContain("IP_HASH_SALT");
  });

  it("refuses a body over MAX_BODY_BYTES with 413, by Content-Length and by bytes read", async () => {
    const { env } = makeEnv({ MAX_BODY_BYTES: "100" });
    const big = JSON.stringify({ platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox", x: "y".repeat(200) });
    const declared = await call(env, "POST", "/v1/handles", { body: big });
    expect(declared.status).toBe(413);

    // A streamed body carries no Content-Length, so only the read cap stops it.
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new Request("https://relay.example/v1/handles", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.7" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    expect((await worker.fetch(req, env)).status).toBe(413);
  });
});

describe("handle auth", () => {
  it("gives an unknown handle and a wrong secret the same 401", async () => {
    const { env } = makeEnv();
    const { handle, secret } = await register(env);
    const unknown = await call(env, "DELETE", `/v1/handles/${"A".repeat(22)}`, { secret });
    const wrong = await call(env, "DELETE", `/v1/handles/${handle}`, { secret: "B".repeat(43) });
    const none = await call(env, "DELETE", `/v1/handles/${handle}`);
    const malformed = await call(env, "DELETE", "/v1/handles/x", { secret });
    const bodies = await Promise.all([unknown, wrong, none, malformed].map((r) => r.text()));
    expect([unknown, wrong, none, malformed].map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(new Set(bodies)).toEqual(new Set(['{"error":"unauthorized"}']));
  });

  it("puts every /v1/handles call under the global ceiling, and refuses them all without the binding", async () => {
    const { env } = makeEnv({ HANDLES_LIMITER: fakeLimiter(1) });
    const h = await register(env);
    const over = await call(env, "DELETE", `/v1/handles/${h.handle}`, { secret: h.secret });
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBe("60");
    expect((await call(env, "GET", "/v1/health")).status).toBe(200);

    const unbound = makeEnv({ HANDLES_LIMITER: undefined }).env;
    const res = await call(unbound, "POST", "/v1/handles", { body: {} });
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).message).toContain("HANDLES_LIMITER");
  });

  it("refuses the send token for PUT and DELETE, leaving the handle as it was", async () => {
    const { env, t } = makeEnv();
    const h = await register(env);
    const put = await call(env, "PUT", `/v1/handles/${h.handle}`, { secret: h.send_token, body: { token: "b2".repeat(32) } });
    const del = await call(env, "DELETE", `/v1/handles/${h.handle}`, { secret: h.send_token });
    expect([put.status, del.status]).toEqual([401, 401]);
    expect(await del.text()).toBe('{"error":"unauthorized"}');
    expect(t.query("SELECT token FROM handles")).toEqual([{ token: APNS_TOKEN }]);
  });
});

describe("PUT /v1/handles/{handle}", () => {
  it("rotates the token, confirms the handle and refreshes last_used_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { env, t } = makeEnv();
    const { handle, secret } = await register(env, { platform: "fcm", token: FCM_TOKEN });
    vi.setSystemTime(1_800_000_060_000);
    const res = await call(env, "PUT", `/v1/handles/${handle}`, { secret, body: { token: "fcm:rotated" } });
    expect(res.status).toBe(204);
    expect(t.query("SELECT token, last_used_at, confirmed_at FROM handles")).toEqual([
      { token: "fcm:rotated", last_used_at: 1_800_000_060_000, confirmed_at: 1_800_000_060_000 },
    ]);
  });

  it("refuses a PUT onto a token at MAX_HANDLES_PER_TOKEN with 409, leaving the handle intact", async () => {
    const { env, t } = makeEnv({ MAX_HANDLES_PER_TOKEN: "2" });
    const other = "b2".repeat(32);
    await register(env, { token: other });
    await register(env, { token: other });
    const h = await register(env);
    const res = await call(env, "PUT", `/v1/handles/${h.handle}`, { secret: h.secret, body: { token: other } });
    expect(res.status).toBe(409);
    expect(t.query("SELECT token, confirmed_at FROM handles WHERE id = ?", h.handle)).toEqual([
      { token: APNS_TOKEN, confirmed_at: null },
    ]);
    // Re-PUTting the token it already has always works, even at the cap.
    await confirm(env, h, APNS_TOKEN);
  });

  it("validates the new token against the handle's platform", async () => {
    const { env } = makeEnv();
    const { handle, secret } = await register(env);
    const res = await call(env, "PUT", `/v1/handles/${handle}`, { secret, body: { token: FCM_TOKEN } });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /v1/handles/{handle}", () => {
  it("deletes the handle, after which its secret no longer works", async () => {
    const { env, t } = makeEnv();
    const { handle, secret } = await register(env);
    expect((await call(env, "DELETE", `/v1/handles/${handle}`, { secret })).status).toBe(204);
    expect(t.query("SELECT id FROM handles")).toEqual([]);
    expect((await call(env, "DELETE", `/v1/handles/${handle}`, { secret })).status).toBe(401);
  });
});

describe("daily cleanup", () => {
  it("drops handles with no PUT for STALE_DAYS, unconfirmed ones past PENDING_HOURS, and ended rate windows", async () => {
    vi.useFakeTimers();
    const hour = 3_600_000;
    const day = 24 * hour;
    const start = Date.UTC(2026, 0, 1);
    const { env, t } = makeEnv({ STALE_DAYS: "30", PENDING_HOURS: "48" });

    vi.setSystemTime(start);
    const stale = await register(env, {}, "192.0.2.1");
    await confirm(env, stale, APNS_TOKEN);
    vi.setSystemTime(start + 20 * day);
    const kept = await register(env, {}, "192.0.2.2");
    await confirm(env, kept, APNS_TOKEN);
    vi.setSystemTime(start + 28 * day + 12 * hour);
    const pending = await register(env, {}, "192.0.2.3");
    vi.setSystemTime(start + 30 * day + 12 * hour);
    const young = await register(env, {}, "192.0.2.4");

    await worker.scheduled({ scheduledTime: start + 31 * day, cron: "", noRetry() {} } as never, env);
    expect(t.query<{ id: string }>("SELECT id FROM handles").map((r) => r.id).sort()).toEqual([kept.handle, young.handle].sort());
    expect(t.query("SELECT * FROM rate_counters")).toEqual([]);
    expect([stale.handle, pending.handle]).not.toContain(kept.handle);
  });

  it("deletes in batches until nothing matches", async () => {
    const { env, t } = makeEnv();
    for (let i = 0; i < 1203; i++) {
      t.query(
        "INSERT INTO handles (id, secret_hash, send_hash, platform, token, app_id, environment, created_at, last_used_at, confirmed_at) VALUES (?, '', '', 'fcm', ?, ?, 'sandbox', 0, 0, 0)",
        `h${i}`,
        `t${i}`,
        APP_ID
      );
    }
    await worker.scheduled({ scheduledTime: Date.UTC(2026, 0, 1), cron: "", noRetry() {} } as never, env);
    expect(t.query("SELECT COUNT(*) AS n FROM handles")).toEqual([{ n: 0 }]);
  });
});

describe("routing", () => {
  it("serves /v1/health without auth", async () => {
    const { env } = makeEnv();
    const res = await call(env, "GET", "/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("gives 404 for unknown paths and 405 for wrong methods", async () => {
    const { env } = makeEnv();
    expect((await call(env, "GET", "/v2/nope")).status).toBe(404);
    expect((await call(env, "GET", "/v1/handles")).status).toBe(405);
  });
});
