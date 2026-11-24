// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** FCM HTTP v1, authorized by an OAuth2 token minted from a service account. */

import { loopbackOverride, requireSecrets } from "./config";
import { HttpError } from "./http";
import { importPrivateKey, signJwt } from "./jwt";
import type { Env, HandleRow, Message, SendOutcome } from "./types";
import { post, retryAfterSeconds, safeReason } from "./upstream";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://fcm.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
// Refresh a minute early so a token never expires mid-request.
const EXPIRY_MARGIN_MS = 60_000;

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

interface CachedToken {
  privateKey: string;
  accessToken: string;
  expiresAt: number;
}
const tokens = new Map<string, CachedToken>();

function parseServiceAccount(raw: string): ServiceAccount {
  let sa: Partial<ServiceAccount>;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new HttpError(500, "invalid_config", "FCM_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  const missing = (["project_id", "client_email", "private_key"] as const).filter((k) => typeof sa[k] !== "string" || !sa[k]);
  if (missing.length) {
    throw new HttpError(500, "invalid_config", `FCM_SERVICE_ACCOUNT_JSON has no ${missing.join(", ")}.`);
  }
  return sa as ServiceAccount;
}

async function accessToken(sa: ServiceAccount, tokenUrl: string): Promise<string> {
  const now = Date.now();
  // Keyed by token URL too, so a token from a test endpoint is never sent to FCM.
  const cacheKey = `${tokenUrl} ${sa.client_email}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.privateKey === sa.private_key && now < cached.expiresAt - EXPIRY_MARGIN_MS) {
    return cached.accessToken;
  }

  const key = await importPrivateKey(sa.private_key, "RS256", "FCM_SERVICE_ACCOUNT_JSON private_key");
  const iat = Math.floor(now / 1000);
  const header: Record<string, string> = { typ: "JWT" };
  if (sa.private_key_id) header.kid = sa.private_key_id;
  const assertion = await signJwt("RS256", key, header, {
    iss: sa.client_email,
    scope: SCOPE,
    // Bound to the endpoint it is sent to, so an assertion given to a test endpoint is useless at Google.
    aud: tokenUrl,
    iat,
    exp: iat + 3600,
  });

  const res = await post(tokenUrl, {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  if (!(res instanceof Response) || res.status === 429 || res.status >= 500) {
    const retryAfter = res instanceof Response ? retryAfterSeconds(res) : undefined;
    throw new HttpError(502, "upstream_unavailable", "Google OAuth is unavailable.", {
      extra: retryAfter === undefined ? {} : { retry_after: retryAfter },
    });
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
  if (res.status !== 200 || typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new HttpError(
      500,
      "fcm_auth_failed",
      `Google OAuth refused FCM_SERVICE_ACCOUNT_JSON (status ${res.status}, ${safeReason(body.error)}).`
    );
  }
  tokens.set(cacheKey, { privateKey: sa.private_key, accessToken: body.access_token, expiresAt: now + body.expires_in * 1000 });
  return body.access_token;
}

export function fcmMessage(row: HandleRow, d: Message): Record<string, unknown> {
  const android: Record<string, string> = {
    priority: d.delivery === "alert" ? "HIGH" : "NORMAL",
    restricted_package_name: row.app_id,
  };
  if (d.collapseId) android.collapse_key = d.collapseId;
  return { message: { token: row.token, data: { c: d.ciphertext, n: d.nonce }, android } };
}

interface FcmError {
  error?: { status?: string; details?: { errorCode?: string }[] };
}

/** Resolves the secret and overrides up front, so a bad one fails before any quota is spent. */
export function fcmSender(env: Env): (row: HandleRow, d: Message) => Promise<SendOutcome> {
  const sa = parseServiceAccount(requireSecrets(env, "FCM_SERVICE_ACCOUNT_JSON").FCM_SERVICE_ACCOUNT_JSON);
  const tokenUrl = loopbackOverride(env, "FCM_TOKEN_URL_OVERRIDE")?.href ?? TOKEN_URL;
  const base = loopbackOverride(env, "FCM_API_BASE_OVERRIDE");
  const apiBase = base ? `${base.origin}${base.pathname.replace(/\/+$/, "")}` : API_BASE;
  return async (row, d) => {
    const res = await post(`${apiBase}/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      headers: { authorization: `Bearer ${await accessToken(sa, tokenUrl)}`, "content-type": "application/json" },
      body: JSON.stringify(fcmMessage(row, d)),
    });
    if (!(res instanceof Response)) return res;
    if (res.status === 200) return { kind: "delivered" };

    const err = ((await res.json().catch(() => ({}))) as FcmError).error ?? {};
    const code = err.details?.find((x) => x.errorCode)?.errorCode ?? err.status;
    if (code === "UNREGISTERED") return { kind: "dead_token" };
    if (res.status === 429 || res.status >= 500 || code === "UNAVAILABLE") {
      return { kind: "unavailable", status: res.status, retryAfter: retryAfterSeconds(res) };
    }
    return { kind: "rejected", status: res.status, reason: safeReason(code) };
  };
}
