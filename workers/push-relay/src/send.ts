// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * POST /v1/handles/{handle}/send. The body is opaque to the relay: an
 * end-to-end encrypted blob, its nonce, and an opaque collapse id. `mode`
 * only picks a visible alert or a silent background push.
 */

import { apnsSender } from "./apns";
import { onlyFields, readJsonObject } from "./body";
import { limit } from "./config";
import { BASE64URL } from "./encoding";
import { fcmSender } from "./fcm";
import { authenticate, shortId } from "./handles";
import { HttpError, json } from "./http";
import { DAY, MINUTE, hit, type Window } from "./ratelimit";
import type { Delivery, Env } from "./types";

const MAX_CIPHERTEXT_CHARS = 3000;
// 12 bytes in unpadded base64url.
const NONCE = /^[A-Za-z0-9_-]{16}$/;
// Printable ASCII only, so it is always a valid header value.
const COLLAPSE_ID = /^[\x21-\x7e]{1,64}$/;

function parseDelivery(body: Record<string, unknown>): Delivery {
  onlyFields(body, ["mode", "ciphertext", "nonce", "collapse_id"]);
  const { mode, ciphertext, nonce, collapse_id } = body;
  if (mode !== "alert" && mode !== "silent") {
    throw new HttpError(400, "invalid_mode", 'mode must be "alert" or "silent".');
  }
  if (typeof ciphertext !== "string" || !BASE64URL.test(ciphertext) || ciphertext.length > MAX_CIPHERTEXT_CHARS) {
    throw new HttpError(400, "invalid_ciphertext", `ciphertext must be base64url, at most ${MAX_CIPHERTEXT_CHARS} characters.`);
  }
  if (typeof nonce !== "string" || !NONCE.test(nonce)) {
    throw new HttpError(400, "invalid_nonce", "nonce must be exactly 12 bytes, base64url.");
  }
  if (collapse_id !== undefined && (typeof collapse_id !== "string" || !COLLAPSE_ID.test(collapse_id))) {
    throw new HttpError(400, "invalid_collapse_id", "collapse_id must be 1 to 64 printable ASCII characters.");
  }
  return { mode, ciphertext, nonce, collapseId: collapse_id };
}

function windows(env: Env, mode: Delivery["mode"]): Window[] {
  return mode === "alert"
    ? [
        { scope: "send_minute", limit: limit(env, "SEND_PER_MINUTE"), size: MINUTE },
        { scope: "send_day", limit: limit(env, "SEND_PER_DAY"), size: DAY },
      ]
    : [
        { scope: "silent_minute", limit: limit(env, "SILENT_PER_MINUTE"), size: MINUTE },
        { scope: "silent_day", limit: limit(env, "SILENT_PER_DAY"), size: DAY },
      ];
}

export async function sendToHandle(request: Request, env: Env, id: string): Promise<Response> {
  const row = await authenticate(request, env, id);
  const delivery = parseDelivery(await readJsonObject(request, env));
  const send = row.platform === "apns" ? apnsSender(env) : fcmSender(env);
  await hit(env.DB, row.id, windows(env, delivery.mode));
  await env.DB.prepare("UPDATE handles SET last_used_at = ? WHERE id = ?").bind(Date.now(), row.id).run();

  const outcome = await send(row, delivery);
  if (outcome.kind === "delivered") return new Response(null, { status: 202 });

  if (outcome.kind === "dead_token") {
    await env.DB.prepare("DELETE FROM handles WHERE id = ?").bind(row.id).run();
    console.log(`send h=${shortId(row.id)} upstream=gone -> 410`);
    return json({ error: "gone" }, 410);
  }
  console.log(`send h=${shortId(row.id)} upstream=${outcome.status} -> 502`);
  if (outcome.kind === "unavailable") {
    const retry = outcome.retryAfter;
    throw new HttpError(502, "upstream_unavailable", undefined, {
      extra: retry === undefined ? {} : { retry_after: retry },
      headers: retry === undefined ? {} : { "retry-after": String(retry) },
    });
  }
  throw new HttpError(
    502,
    "upstream_rejected",
    `${row.platform === "apns" ? "APNs" : "FCM"} refused the push (status ${outcome.status}, ${outcome.reason}).`
  );
}
