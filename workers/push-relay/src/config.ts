// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { HttpError } from "./http";
import type { Env } from "./types";

/** The documented defaults, used when a var is unset or empty. */
export const DEFAULT_LIMITS = {
  MAX_HANDLES_PER_TOKEN: 8,
  SEND_PER_MINUTE: 10,
  SEND_PER_DAY: 500,
  SILENT_PER_MINUTE: 2,
  SILENT_PER_DAY: 300,
  REGISTER_PER_HOUR: 20,
  STALE_DAYS: 180,
  PENDING_HOURS: 48,
  MAX_BODY_BYTES: 8192,
} as const;

export type LimitName = keyof typeof DEFAULT_LIMITS;

/** A positive integer var, or its default; anything else is a deploy error. */
export function limit(env: Env, name: LimitName): number {
  const raw = env[name]?.trim();
  if (!raw) return DEFAULT_LIMITS[name];
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new HttpError(500, "invalid_config", `${name} must be a positive integer, got "${raw}".`);
  }
  return Number(raw);
}

/** The app ids this relay serves; an empty list is a deploy error, not "allow none". */
export function allowedAppIds(env: Env): Set<string> {
  const ids = new Set(
    (env.ALLOWED_APP_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  if (!ids.size) {
    throw new HttpError(
      500,
      "missing_config",
      "ALLOWED_APP_IDS is empty; set it to the app ids this relay serves (see the push-relay README)."
    );
  }
  return ids;
}

type SecretName = "APNS_KEY_P8" | "APNS_KEY_ID" | "APNS_TEAM_ID" | "FCM_SERVICE_ACCOUNT_JSON" | "IP_HASH_SALT";

/** The named secrets, or a 500 naming every one that is missing. */
export function requireSecrets<K extends SecretName>(env: Env, ...names: K[]): Record<K, string> {
  const missing = names.filter((n) => !env[n]?.trim());
  if (missing.length) {
    throw new HttpError(
      500,
      "missing_config",
      `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set on this relay. ` +
        "Set with `wrangler secret put <NAME>` (see the push-relay README)."
    );
  }
  return Object.fromEntries(names.map((n) => [n, env[n] as string])) as Record<K, string>;
}

type OverrideName = "APNS_HOST_OVERRIDE" | "FCM_TOKEN_URL_OVERRIDE" | "FCM_API_BASE_OVERRIDE";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * A provider endpoint override for local end-to-end tests, or undefined when
 * unset or empty. Only loopback is honored: anything else is a 500, never the
 * real host and never the bad value, since these requests carry credentials.
 * A value without a scheme means https.
 */
export function loopbackOverride(env: Env, name: OverrideName, opts: { originOnly?: boolean } = {}): URL | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;
  const notLoopback = () =>
    new HttpError(
      500,
      "invalid_config",
      `${name} is loopback-only (127.0.0.1, localhost or [::1], with an optional port) and is for local ` +
        "end-to-end tests; unset it on a deployed relay (see the push-relay README)."
    );
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw notLoopback();
  }
  const web = url.protocol === "http:" || url.protocol === "https:";
  if (!web || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password) throw notLoopback();
  if (url.search || url.hash || (opts.originOnly && url.pathname !== "/")) {
    const form = opts.originOnly ? "host[:port] or an origin such as http://127.0.0.1:8443, with no path," : "a URL with no";
    throw new HttpError(500, "invalid_config", `${name} must be ${form} query or fragment (see the push-relay README).`);
  }
  return url;
}
