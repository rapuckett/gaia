// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { SendOutcome } from "./types";

/** Seconds from a numeric Retry-After header; an HTTP-date or junk gives none. */
export function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  return raw && /^[0-9]{1,6}$/.test(raw) ? Number(raw) : undefined;
}

/** A fetch whose network failure is an `unavailable` outcome rather than a throw. */
export async function post(url: string, init: RequestInit): Promise<Response | SendOutcome> {
  try {
    return await fetch(url, { ...init, method: "POST", redirect: "manual" });
  } catch {
    return { kind: "unavailable", status: 0 };
  }
}

/** Only short identifier-like reasons go into a response; anything else is withheld. */
export function safeReason(reason: unknown): string {
  return typeof reason === "string" && /^[A-Za-z_]{1,64}$/.test(reason) ? reason : "unknown";
}
