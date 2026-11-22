// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Direct APNs over the token-based provider API. Workers' fetch reaches APNs
 * over HTTP/2 only when deployed: Cloudflare's proxy upgrades the subrequest,
 * and local workerd cannot.
 */

import { requireSecrets } from "./config";
import { importPrivateKey, signJwt } from "./jwt";
import type { Env, HandleRow, Message, SendOutcome } from "./types";
import { post, retryAfterSeconds, safeReason } from "./upstream";

export const ALERT_LOC_KEY = "PUSH_GENERIC";

const HOSTS = { sandbox: "api.sandbox.push.apple.com", production: "api.push.apple.com" } as const;
// Apple rejects a provider token older than 60 minutes and refuses refreshes
// more often than every 20; 40 leaves room on both sides.
const TOKEN_TTL_MS = 40 * 60_000;
const STALE_TOKEN_REASONS = new Set(["InvalidProviderToken", "ExpiredProviderToken"]);

interface TokenRow {
  team_id: string;
  issued_at: number;
  token: string;
}
// Per-isolate copy of the shared D1 row, keyed by key id.
const memory = new Map<string, TokenRow>();

const SELECT_TOKEN = "SELECT team_id, issued_at, token FROM apns_provider_tokens WHERE key_id = ?";

/** One provider token per key for every isolate, kept in D1 and minted only when the shared one is due. */
async function providerToken(db: D1Database, p8: string, keyId: string, teamId: string): Promise<string> {
  const now = Date.now();
  const usable = (t: TokenRow | null | undefined): t is TokenRow =>
    !!t && t.team_id === teamId && now - t.issued_at < TOKEN_TTL_MS;

  const cached = memory.get(keyId);
  if (usable(cached)) return cached.token;

  let row = await db.prepare(SELECT_TOKEN).bind(keyId).first<TokenRow>();
  if (!usable(row)) {
    const key = await importPrivateKey(p8, "ES256", "APNS_KEY_P8");
    const jwt = await signJwt("ES256", key, { kid: keyId }, { iss: teamId, iat: Math.floor(now / 1000) });
    // Replace only a row that is itself due, so racing isolates settle on one token.
    await db
      .prepare(
        `INSERT INTO apns_provider_tokens (key_id, team_id, issued_at, token) VALUES (?, ?, ?, ?)
         ON CONFLICT (key_id) DO UPDATE SET team_id = excluded.team_id, issued_at = excluded.issued_at, token = excluded.token
         WHERE apns_provider_tokens.issued_at < ? OR apns_provider_tokens.team_id <> excluded.team_id`
      )
      .bind(keyId, teamId, now, jwt, now - TOKEN_TTL_MS)
      .run();
    row = await db.prepare(SELECT_TOKEN).bind(keyId).first<TokenRow>();
    if (!row) throw new Error("apns_provider_tokens row missing right after its upsert");
  }
  memory.set(keyId, row);
  return row.token;
}

async function forgetProviderToken(db: D1Database, keyId: string, token: string): Promise<void> {
  if (memory.get(keyId)?.token === token) memory.delete(keyId);
  await db.prepare("DELETE FROM apns_provider_tokens WHERE key_id = ? AND token = ?").bind(keyId, token).run();
}

export function apnsPayload(d: Message): Record<string, unknown> {
  const aps = d.delivery === "alert" ? { alert: { "loc-key": ALERT_LOC_KEY }, "mutable-content": 1 } : { "content-available": 1 };
  return { aps, c: d.ciphertext, n: d.nonce };
}

/** Resolves the secrets up front, so a missing one fails before any quota is spent. */
export function apnsSender(env: Env): (row: HandleRow, d: Message) => Promise<SendOutcome> {
  const s = requireSecrets(env, "APNS_KEY_P8", "APNS_KEY_ID", "APNS_TEAM_ID");
  const keyId = s.APNS_KEY_ID.trim();
  return async (row, d) => {
    const jwt = await providerToken(env.DB, s.APNS_KEY_P8, keyId, s.APNS_TEAM_ID.trim());
    const headers: Record<string, string> = {
      authorization: `bearer ${jwt}`,
      "apns-topic": row.app_id,
      "apns-push-type": d.delivery === "alert" ? "alert" : "background",
      "apns-priority": d.delivery === "alert" ? "10" : "5",
      "content-type": "application/json",
    };
    if (d.collapseId) headers["apns-collapse-id"] = d.collapseId;

    const res = await post(`https://${HOSTS[row.environment]}/3/device/${encodeURIComponent(row.token)}`, {
      headers,
      body: JSON.stringify(apnsPayload(d)),
    });
    if (!(res instanceof Response)) return res;
    if (res.status === 200) return { kind: "delivered" };

    const reason = safeReason(((await res.json().catch(() => ({}))) as { reason?: unknown }).reason);
    if (res.status === 410 || (res.status === 400 && reason === "BadDeviceToken")) return { kind: "dead_token" };
    if (res.status === 429 || res.status >= 500) {
      return { kind: "unavailable", status: res.status, retryAfter: retryAfterSeconds(res) };
    }
    if (res.status === 403 && STALE_TOKEN_REASONS.has(reason)) await forgetProviderToken(env.DB, keyId, jwt);
    return { kind: "rejected", status: res.status, reason };
  };
}
