// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * GAIA push relay.
 *
 *   POST   /v1/handles                register a device token, returns {handle, secret}
 *   PUT    /v1/handles/{handle}       rotate the token                (Bearer secret)
 *   DELETE /v1/handles/{handle}       delete the handle               (Bearer secret)
 *   POST   /v1/handles/{handle}/send  push an encrypted blob          (Bearer secret)
 *   GET    /v1/health                 liveness, no auth
 *
 * A daily cron drops idle handles and ended rate windows.
 */

import { cleanup, deleteHandle, registerHandle, rotateToken } from "./handles";
import { errorResponse, HttpError, json } from "./http";
import { sendToHandle } from "./send";
import type { Env } from "./types";

const methodNotAllowed = () => new HttpError(405, "method_not_allowed");

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const { method } = request;

  if (pathname === "/v1/health") {
    if (method !== "GET") throw methodNotAllowed();
    return json({ ok: true });
  }
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
    console.log(`cleanup handles=${removed.handles} counters=${removed.counters}`);
  },
} satisfies ExportedHandler<Env>;
