// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * GAIA push relay.
 *
 *   POST   /v1/handles                register a device token, returns {handle, secret, send_token}
 *   PUT    /v1/handles/{handle}       rotate the token                (Bearer secret)
 *   DELETE /v1/handles/{handle}       delete the handle               (Bearer secret)
 *   POST   /v1/handles/{handle}/send  push an encrypted blob          (Bearer send_token)
 *   GET    /v1/health                 liveness, no auth
 *
 * Every /v1/handles call first passes a per-location ceiling (HANDLES_LIMITER).
 * A daily cron drops stale and unconfirmed handles and ended rate windows.
 */

import { cleanup, deleteHandle, registerHandle, rotateToken } from "./handles";
import { errorResponse, HttpError, json } from "./http";
import { sendToHandle } from "./send";
import type { Env } from "./types";

const methodNotAllowed = () => new HttpError(405, "method_not_allowed");
// The binding reports no reset time; 60 s is the longest period it supports.
const CEILING_RETRY_AFTER = 60;

async function globalCeiling(env: Env): Promise<void> {
  if (!env.HANDLES_LIMITER) {
    throw new HttpError(
      500,
      "missing_config",
      "HANDLES_LIMITER is not bound; add the [[ratelimits]] binding (see the push-relay README)."
    );
  }
  const { success } = await env.HANDLES_LIMITER.limit({ key: "handles" });
  if (!success) {
    throw new HttpError(429, "rate_limited", undefined, {
      extra: { retry_after: CEILING_RETRY_AFTER },
      headers: { "retry-after": String(CEILING_RETRY_AFTER) },
    });
  }
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const { method } = request;

  if (pathname === "/v1/health") {
    if (method !== "GET") throw methodNotAllowed();
    return json({ ok: true });
  }
  if (pathname === "/v1/handles" || pathname.startsWith("/v1/handles/")) await globalCeiling(env);

  if (pathname === "/v1/handles") {
    if (method !== "POST") throw methodNotAllowed();
    return registerHandle(request, env);
  }
  const m = /^\/v1\/handles\/([^/]+)$/.exec(pathname);
  if (m) {
    if (method === "PUT") return rotateToken(request, env, m[1]);
    if (method === "DELETE") return deleteHandle(request, env, m[1]);
    throw methodNotAllowed();
  }
  const send = /^\/v1\/handles\/([^/]+)\/send$/.exec(pathname);
  if (send) {
    if (method !== "POST") throw methodNotAllowed();
    return sendToHandle(request, env, send[1]);
  }
  throw new HttpError(404, "not_found");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err);
      console.error("unhandled", err instanceof Error ? err.name : typeof err);
      return json({ error: "internal" }, 500);
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const removed = await cleanup(env, controller.scheduledTime);
    console.log(`cleanup stale=${removed.stale} pending=${removed.pending} counters=${removed.counters}`);
  },
} satisfies ExportedHandler<Env>;
