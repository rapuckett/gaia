// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Register, rotate and delete handles, and authenticate a handle's caller.
 * The secret manages a handle and the send token only sends with it, so the
 * PC, which holds just the send token, cannot move a handle to another device.
 */

import { readJsonObject, onlyFields } from "./body";
import { clientSubject } from "./clientip";
import { allowedAppIds, limit, requireSecrets } from "./config";
import { base64urlDecode, base64urlEncode, hmacSha256, randomBase64url, sha256, timingSafeEqual } from "./encoding";
import { HttpError, json, unauthorized } from "./http";
import { HOUR, hit } from "./ratelimit";
import type { Env, Environment, HandleRow, Platform } from "./types";

const HANDLE_ID = /^[A-Za-z0-9_-]{22}$/;
// APNs tokens are hex (32 bytes today; Apple says the length may grow).
const APNS_TOKEN = /^(?:[0-9a-fA-F]{2}){16,200}$/;
const FCM_TOKEN = /^[A-Za-z0-9_:-]{1,512}$/;
// Hashed in place of a real secret when the handle is unknown, so both 401
// paths do the same work.
const DUMMY_HASH = new Uint8Array(32);
const CLEANUP_BATCH = 500;

export function shortId(id: string): string {
  return id.slice(0, 6);
}

/** The token in its stored form: APNs hex is case-folded so one device is one token. */
function validToken(platform: Platform, token: unknown): string {
  const ok = typeof token === "string" && (platform === "apns" ? APNS_TOKEN : FCM_TOKEN).test(token);
  if (!ok) {
    throw new HttpError(
      400,
      "invalid_token",
      platform === "apns"
        ? "token must be the APNs device token in hex."
        : "token must be an FCM registration token, at most 512 characters."
    );
  }
  return platform === "apns" ? (token as string).toLowerCase() : (token as string);
}

function tooManyHandles(env: Env): HttpError {
  return new HttpError(
    409,
    "too_many_handles",
    `This device token already has ${limit(env, "MAX_HANDLES_PER_TOKEN")} handles; delete one first.`
  );
}

export async function registerHandle(request: Request, env: Env): Promise<Response> {
  const { IP_HASH_SALT } = requireSecrets(env, "IP_HASH_SALT");
  const allowed = allowedAppIds(env);
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) {
    throw new HttpError(500, "no_client_ip", "CF-Connecting-IP is missing; the relay must run behind Cloudflare.");
  }
  const body = await readJsonObject(request, env);
  const ipHash = base64urlEncode(await hmacSha256(IP_HASH_SALT, clientSubject(ip)));
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
  if (typeof app_id !== "string" || !allowed.has(app_id)) {
    throw new HttpError(400, "app_not_allowed", "app_id is not one this relay serves.");
  }

  const handle = randomBase64url(16);
  const secret = randomBase64url(32);
  const sendToken = randomBase64url(32);
  const now = Date.now();
  // One statement, so two racing registrations cannot both pass the cap.
  const inserted = await env.DB.prepare(
    `INSERT INTO handles (id, secret_hash, send_hash, platform, token, app_id, environment, created_at, last_used_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM handles WHERE platform = ? AND token = ?) < ?`
  )
    .bind(
      handle,
      base64urlEncode(await sha256(secret)),
      base64urlEncode(await sha256(sendToken)),
      platform,
      token,
      app_id,
      environment as Environment,
      now,
      now,
      platform,
      token,
      limit(env, "MAX_HANDLES_PER_TOKEN")
    )
    .run();
  if (!inserted.meta.changes) throw tooManyHandles(env);
  return json({ handle, secret, send_token: sendToken }, 201);
}

export type Credential = "secret" | "send_token";

/**
 * The handle row if `Authorization: Bearer <credential>` matches the given kind;
 * otherwise one indistinguishable 401, whatever was wrong.
 */
export async function authenticate(request: Request, env: Env, id: string, kind: Credential): Promise<HandleRow> {
  const match = /^Bearer ([A-Za-z0-9_-]{1,128})$/.exec(request.headers.get("authorization") ?? "");
  const presented = await sha256(match ? match[1] : "");
  const row = HANDLE_ID.test(id)
    ? await env.DB.prepare("SELECT * FROM handles WHERE id = ?").bind(id).first<HandleRow>()
    : null;
  const stored = row ? base64urlDecode(kind === "secret" ? row.secret_hash : row.send_hash) : DUMMY_HASH;
  if (!timingSafeEqual(presented, stored) || !row || !match) throw unauthorized();
  return row;
}

/** Rotate the token. The only call that confirms a handle or keeps it from going stale. */
export async function rotateToken(request: Request, env: Env, id: string): Promise<Response> {
  const row = await authenticate(request, env, id, "secret");
  const body = await readJsonObject(request, env);
  onlyFields(body, ["token"]);
  const token = validToken(row.platform, body.token);
  const now = Date.now();
  const updated = await env.DB.prepare(
    `UPDATE handles SET token = ?, last_used_at = ?, confirmed_at = COALESCE(confirmed_at, ?)
     WHERE id = ? AND (token = ? OR (SELECT COUNT(*) FROM handles WHERE platform = ? AND token = ?) < ?)`
  )
    .bind(token, now, now, id, token, row.platform, token, limit(env, "MAX_HANDLES_PER_TOKEN"))
    .run();
  if (!updated.meta.changes) throw tooManyHandles(env);
  return new Response(null, { status: 204 });
}

export async function deleteHandle(request: Request, env: Env, id: string): Promise<Response> {
  await authenticate(request, env, id, "secret");
  await env.DB.prepare("DELETE FROM handles WHERE id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}

/** Delete matching rows CLEANUP_BATCH at a time, so no one statement runs long. */
async function deleteInBatches(db: D1Database, table: string, where: string, ...args: number[]): Promise<number> {
  let total = 0;
  for (;;) {
    const r = await db
      .prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${CLEANUP_BATCH})`)
      .bind(...args)
      .run();
    const n = r.meta.changes ?? 0;
    total += n;
    if (n < CLEANUP_BATCH) return total;
  }
}

/**
 * Daily cleanup: handles with no PUT for STALE_DAYS, handles never confirmed
 * within PENDING_HOURS, and rate windows that have ended.
 */
export async function cleanup(
  env: Env,
  now = Date.now()
): Promise<{ stale: number; pending: number; counters: number }> {
  const staleCutoff = now - limit(env, "STALE_DAYS") * 24 * HOUR;
  const pendingCutoff = now - limit(env, "PENDING_HOURS") * HOUR;
  return {
    stale: await deleteInBatches(env.DB, "handles", "last_used_at < ?", staleCutoff),
    pending: await deleteInBatches(env.DB, "handles", "confirmed_at IS NULL AND created_at < ?", pendingCutoff),
    counters: await deleteInBatches(env.DB, "rate_counters", "expires_at <= ?", now),
  };
}
