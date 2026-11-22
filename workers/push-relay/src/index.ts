// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * GAIA push relay.
 *
 *   GET    /v1/health                 liveness, no auth
 */

import { errorResponse, HttpError, json } from "./http";
import type { Env } from "./types";

async function route(request: Request, _env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/v1/health") {
    if (request.method !== "GET") throw new HttpError(405, "method_not_allowed");
    return json({ ok: true });
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
} satisfies ExportedHandler<Env>;
