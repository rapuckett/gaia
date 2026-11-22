// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import worker from "../src/index";
import type { Env } from "../src/types";
import { memoryD1, type TestDb } from "./d1";

export const APP_ID = "com.example.gaia";
export const APNS_TOKEN = "a1".repeat(32);
export const FCM_TOKEN = "fcm-token:APA91b_example-registration-token";

export function makeEnv(overrides: Partial<Env> = {}): { env: Env; t: TestDb } {
  const t = memoryD1();
  return { t, env: { DB: t.db, ALLOWED_APP_IDS: APP_ID, IP_HASH_SALT: "test-salt", ...overrides } };
}

export function call(
  env: Env,
  method: string,
  path: string,
  opts: { body?: unknown; secret?: string; ip?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
  const headers: Record<string, string> = { "cf-connecting-ip": opts.ip ?? "203.0.113.7", ...opts.headers };
  if (opts.secret !== undefined) headers.authorization = `Bearer ${opts.secret}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  return worker.fetch(new Request(`https://relay.example${path}`, { method, headers, body }), env, {} as never);
}

export async function register(
  env: Env,
  body: Record<string, unknown> = {},
  ip?: string
): Promise<{ handle: string; secret: string }> {
  const res = await call(env, "POST", "/v1/handles", {
    ip,
    body: { platform: "apns", token: APNS_TOKEN, app_id: APP_ID, environment: "sandbox", ...body },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { handle: string; secret: string };
}
