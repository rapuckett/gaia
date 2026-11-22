// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Bindings, vars and secrets. Every value is a string as Cloudflare delivers it. */
export interface Env {
  DB: D1Database;

  ALLOWED_APP_IDS?: string;
  MAX_HANDLES_PER_TOKEN?: string;
  SEND_PER_MINUTE?: string;
  SEND_PER_DAY?: string;
  SILENT_PER_MINUTE?: string;
  SILENT_PER_DAY?: string;
  REGISTER_PER_HOUR?: string;
  STALE_DAYS?: string;
  MAX_BODY_BYTES?: string;

  APNS_KEY_P8?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  IP_HASH_SALT?: string;
}

export type Platform = "apns" | "fcm";
export type Environment = "sandbox" | "production";
export type Mode = "alert" | "silent";

/** A row of the `handles` table. */
export interface HandleRow {
  id: string;
  secret_hash: string;
  platform: Platform;
  token: string;
  app_id: string;
  environment: Environment;
  created_at: number;
  last_used_at: number;
}

/** What a provider needs to deliver one message. */
export interface Delivery {
  mode: Mode;
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
