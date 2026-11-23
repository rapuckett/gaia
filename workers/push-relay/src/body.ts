// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { limit } from "./config";
import { HttpError } from "./http";
import type { Env } from "./types";

/**
 * The request body as a JSON object, read no further than MAX_BODY_BYTES
 * whatever Content-Length claims, and refused with 413 past it.
 */
export async function readJsonObject(request: Request, env: Env): Promise<Record<string, unknown>> {
  const max = limit(env, "MAX_BODY_BYTES");
  const tooLarge = () => new HttpError(413, "body_too_large", `The request body is over ${max} bytes.`);

  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > max) throw tooLarge();

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json", "The request body must be a JSON object.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "invalid_json", "The request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

/** Refuse fields outside the contract, so a caller's mistake is loud. */
export function onlyFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length) {
    throw new HttpError(400, "unknown_field", `Unknown field(s): ${extra.join(", ")}. Allowed: ${allowed.join(", ")}.`);
  }
}
