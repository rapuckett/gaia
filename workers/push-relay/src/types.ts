// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Bindings, vars and secrets. Every value is a string as Cloudflare delivers it. */
export interface Env {
  DB: D1Database;
  /** Workers rate-limiting binding: a per-location ceiling on every /v1/handles call. */
  HANDLES_LIMITER?: RateLimit;

  ALLOWED_APP_IDS?: string;
  MAX_HANDLES_PER_TOKEN?: string;
  SEND_PER_MINUTE?: string;
  SEND_PER_DAY?: string;
  SILENT_PER_MINUTE?: string;
  SILENT_PER_DAY?: string;
  REGISTER_PER_HOUR?: string;
  STALE_DAYS?: string;
  PENDING_HOURS?: string;
  MAX_BODY_BYTES?: string;

  APNS_KEY_P8?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  IP_HASH_SALT?: string;

  /** Local end-to-end tests only: a loopback APNs origin (e.g. `http://127.0.0.1:8443`) for both environments. */
  APNS_HOST_OVERRIDE?: string;
  /** Local end-to-end tests only: a loopback Google OAuth token URL. */
  FCM_TOKEN_URL_OVERRIDE?: string;
  /** Local end-to-end tests only: a loopback FCM base URL that `/v1/projects/...` is appended to. */
  FCM_API_BASE_OVERRIDE?: string;
}

export type Platform = "apns" | "fcm";
export type Environment = "sandbox" | "production";
export type DeliveryKind = "alert" | "silent";

/** A row of the `handles` table. */
export interface HandleRow {
  id: string;
  secret_hash: string;
  send_hash: string;
  platform: Platform;
  token: string;
  app_id: string;
  environment: Environment;
  created_at: number;
  last_used_at: number;
  confirmed_at: number | null;
}

/** What a provider needs to deliver one message. */
export interface Message {
  delivery: DeliveryKind;
  ciphertext: string;
  nonce: string;
  collapseId?: string;
}

/** A provider's verdict on one send. */
export type SendOutcome =
  | { kind: "delivered" }
  | { kind: "dead_token" }
  | { kind: "unavailable"; retryAfter?: number; status: number }
  | { kind: "rejected"; status: number; reason: string };
