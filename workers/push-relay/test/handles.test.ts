// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import { base64urlDecode, base64urlEncode, sha256 } from "../src/encoding";
import { APNS_TOKEN, APP_ID, call, FCM_TOKEN, makeEnv, register } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("POST /v1/handles", () => {
  it("returns a 16-byte handle and 32-byte secret, and stores only the secret's hash", async () => {
    const { env, t } = makeEnv();
    const { handle, secret } = await register(env);
    expect(base64urlDecode(handle)).toHaveLength(16);
    expect(base64urlDecode(secret)).toHaveLength(32);

    const [row] = t.query<Record<string, unknown>>("SELECT * FROM handles");
    expect(row).toMatchObject({ id: handle, platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" });
    expect(row.secret_hash).toBe(base64urlEncode(await sha256(secret)));
    expect(JSON.stringify(row)).not.toContain(secret);
  });

  it("refuses an app id outside ALLOWED_APP_IDS, and every app id when it is empty", async () => {
    const { env } = makeEnv({ ALLOWED_APP_IDS: "com.example.other, com.example.gaia " });
    const bad = await call(env, "POST", "/v1/handles", {
      body: { platform: "fcm", token: FCM_TOKEN, app_id: "com.evil.app", environment: "production" },
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error).toBe("app_not_allowed");
    await register(env); // the trimmed list still matches

    const empty = makeEnv({ ALLOWED_APP_IDS: "" }).env;
    const res = await call(empty, "POST", "/v1/handles", {
      body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox" },
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

  it("keeps at most MAX_HANDLES_PER_TOKEN handles per token, dropping the oldest", async () => {
    vi.useFakeTimers();
    const { env, t } = makeEnv({ MAX_HANDLES_PER_TOKEN: "3" });
    const made = [];
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(1_800_000_000_000 + i * 1000);
      made.push((await register(env)).handle);
    }
    const ids = t.query<{ id: string }>("SELECT id FROM handles ORDER BY created_at").map((r) => r.id);
    expect(ids).toEqual(made.slice(1));
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
});

describe("PUT /v1/handles/{handle}", () => {
  it("rotates the token and refreshes last_used_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    const { env, t } = makeEnv();
    const { handle, secret } = await register(env, { platform: "fcm", token: FCM_TOKEN });
    vi.setSystemTime(1_800_000_060_000);
    const res = await call(env, "PUT", `/v1/handles/${handle}`, { secret, body: { token: "fcm:rotated" } });
    expect(res.status).toBe(204);
    expect(t.query("SELECT token, last_used_at FROM handles")).toEqual([
      { token: "fcm:rotated", last_used_at: 1_800_000_060_000 },
    ]);
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
  it("drops handles idle for STALE_DAYS and ended rate windows, keeping the rest", async () => {
    vi.useFakeTimers();
    const day = 86_400_000;
    const start = Date.UTC(2026, 0, 1);
    const { env, t } = makeEnv({ STALE_DAYS: "30" });
    vi.setSystemTime(start);
    const old = await register(env, {}, "192.0.2.1");
    vi.setSystemTime(start + 20 * day);
    const fresh = await register(env, {}, "192.0.2.2");

    await worker.scheduled({ scheduledTime: start + 31 * day, cron: "", noRetry() {} } as never, env);
    expect(t.query<{ id: string }>("SELECT id FROM handles").map((r) => r.id)).toEqual([fresh.handle]);
    expect(t.query("SELECT * FROM rate_counters")).toEqual([]);
    expect(old.handle).not.toBe(fresh.handle);
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
