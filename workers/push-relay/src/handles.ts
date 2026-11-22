// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Register, rotate and delete handles, and authenticate a handle's caller. */

import { readJsonObject, onlyFields } from "./body";
import { allowedAppIds, limit, requireSecrets } from "./config";
import { base64urlDecode, base64urlEncode, hmacSha256, randomBase64url, sha256, timingSafeEqual } from "./encoding";
import { HttpError, json, unauthorized } from "./http";
import { HOUR, hit } from "./ratelimit";
import type { Env, Environment, HandleRow, Platform } from "./types";

const HANDLE_ID = /^[A-Za-z0-9_-]{22}$/;
// APNs tokens are hex (32 bytes today; Apple says the length may grow).
const APNS_TOKEN = /^(?:[0-9a-fA-F]{2}){16,200}$/;
const FCM_TOKEN = /^[A-Za-z0-9_:-]{1,4096}$/;
// Hashed in place of a real secret when the handle is unknown, so both 401
// paths do the same work.
const DUMMY_HASH = new Uint8Array(32);

export function shortId(id: string): string {
  return id.slice(0, 6);
}

function validToken(platform: Platform, token: unknown): string {
  const ok = typeof token === "string" && (platform === "apns" ? APNS_TOKEN : FCM_TOKEN).test(token);
  if (!ok) {
    throw new HttpError(
      400,
      "invalid_token",
      platform === "apns" ? "token must be the APNs device token in hex." : "token must be an FCM registration token."
    );
  }
  return token as string;
}

/** Keep the newest MAX_HANDLES_PER_TOKEN handles for a token; drop the rest. */
async function enforceTokenCap(env: Env, platform: Platform, token: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM handles WHERE platform = ? AND token = ? AND id NOT IN (
       SELECT id FROM handles WHERE platform = ? AND token = ?
       ORDER BY created_at DESC, rowid DESC LIMIT ?)`
  )
    .bind(platform, token, platform, token, limit(env, "MAX_HANDLES_PER_TOKEN"))
    .run();
}

export async function registerHandle(request: Request, env: Env): Promise<Response> {
  const { IP_HASH_SALT } = requireSecrets(env, "IP_HASH_SALT");
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) {
    throw new HttpError(500, "no_client_ip", "CF-Connecting-IP is missing; the relay must run behind Cloudflare.");
  }
  const body = await readJsonObject(request, env);
  const ipHash = base64urlEncode(await hmacSha256(IP_HASH_SALT, ip));
  await hit(env.DB, ipHash, [{ scope: "register_hour", limit: limit(env, "REGISTER_PER_HOUR"), size: HOUR }]);

  onlyFields(body, ["platform", "token", "app_id", "environment"]);
  const { platform, app_id, environment } = body;
  if (platform !== "apns" && platform !== "fcm") {
    throw new HttpError(400, "invalid_platform", 'platform must be "apns" or "fcm".');
  }
  if (environment !== "sandbox" && environment !== "production") {
    throw new HttpError(400, "invalid_environment", 'environment must be "sandbox" or "production".');
  }
  const token = validToken(platform, body.token);
  if (typeof app_id !== "string" || !allowedAppIds(env).has(app_id)) {
    throw new HttpError(400, "app_not_allowed", "app_id is not one this relay serves.");
  }

  const handle = randomBase64url(16);
  const secret = randomBase64url(32);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO handles (id, secret_hash, platform, token, app_id, environment, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(handle, base64urlEncode(await sha256(secret)), platform, token, app_id, environment as Environment, now, now)
    .run();
  await enforceTokenCap(env, platform, token);
  return json({ handle, secret }, 201);
}

/** The handle row if `Authorization: Bearer <secret>` matches it; otherwise one indistinguishable 401. */
export async function authenticate(request: Request, env: Env, id: string): Promise<HandleRow> {
  const match = /^Bearer ([A-Za-z0-9_-]{1,128})$/.exec(request.headers.get("authorization") ?? "");
  const presented = await sha256(match ? match[1] : "");
  const row = HANDLE_ID.test(id)
    ? await env.DB.prepare("SELECT * FROM handles WHERE id = ?").bind(id).first<HandleRow>()
    : null;
  const stored = row ? base64urlDecode(row.secret_hash) : DUMMY_HASH;
  if (!timingSafeEqual(presented, stored) || !row || !match) throw unauthorized();
  return row;
}

export async function rotateToken(request: Request, env: Env, id: string): Promise<Response> {
  const row = await authenticate(request, env, id);
  const body = await readJsonObject(request, env);
  onlyFields(body, ["token"]);
  const token = validToken(row.platform, body.token);
  await env.DB.prepare("UPDATE handles SET token = ?, last_used_at = ? WHERE id = ?").bind(token, Date.now(), id).run();
  await enforceTokenCap(env, row.platform, token);
  return new Response(null, { status: 204 });
}

export async function deleteHandle(request: Request, env: Env, id: string): Promise<Response> {
  await authenticate(request, env, id);
  await env.DB.prepare("DELETE FROM handles WHERE id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}

/** Daily cleanup: handles idle for STALE_DAYS, and rate windows that have ended. */
export async function cleanup(env: Env, now = Date.now()): Promise<{ handles: number; counters: number }> {
  const cutoff = now - limit(env, "STALE_DAYS") * 24 * HOUR;
  const [h, c] = await env.DB.batch([
    env.DB.prepare("DELETE FROM handles WHERE last_used_at < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM rate_counters WHERE expires_at <= ?").bind(now),
  ]);
  return { handles: h.meta.changes ?? 0, counters: c.meta.changes ?? 0 };
}
