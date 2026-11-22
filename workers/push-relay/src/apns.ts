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
// more often than every 20.
const TOKEN_TTL_MS = 50 * 60_000;

interface CachedToken {
  p8: string;
  jwt: string;
  issuedAt: number;
}
const tokens = new Map<string, CachedToken>();

async function providerToken(p8: string, keyId: string, teamId: string): Promise<string> {
  const cacheKey = `${teamId}:${keyId}`;
  const now = Date.now();
  const cached = tokens.get(cacheKey);
  if (cached && cached.p8 === p8 && now - cached.issuedAt < TOKEN_TTL_MS) return cached.jwt;

  const key = await importPrivateKey(p8, "ES256", "APNS_KEY_P8");
  const jwt = await signJwt("ES256", key, { kid: keyId }, { iss: teamId, iat: Math.floor(now / 1000) });
  tokens.set(cacheKey, { p8, jwt, issuedAt: now });
  return jwt;
}

export function apnsPayload(d: Message): Record<string, unknown> {
  const aps = d.delivery === "alert" ? { alert: { "loc-key": ALERT_LOC_KEY }, "mutable-content": 1 } : { "content-available": 1 };
  return { aps, c: d.ciphertext, n: d.nonce };
}

/** Resolves the secrets up front, so a missing one fails before any quota is spent. */
export function apnsSender(env: Env): (row: HandleRow, d: Message) => Promise<SendOutcome> {
  const s = requireSecrets(env, "APNS_KEY_P8", "APNS_KEY_ID", "APNS_TEAM_ID");
  return async (row, d) => {
    const headers: Record<string, string> = {
      authorization: `bearer ${await providerToken(s.APNS_KEY_P8, s.APNS_KEY_ID.trim(), s.APNS_TEAM_ID.trim())}`,
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
    return { kind: "rejected", status: res.status, reason };
  };
}
