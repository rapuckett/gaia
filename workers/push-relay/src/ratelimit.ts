// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { HttpError } from "./http";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface Window {
  scope: string;
  limit: number;
  size: number;
}

/**
 * Count one hit on `subject` in every window, then refuse with 429 if any
 * window is over its limit. Retry-After is the wait until the longest of the
 * exceeded windows resets.
 */
export async function hit(db: D1Database, subject: string, windows: Window[], now = Date.now()): Promise<void> {
  const stmts = windows.map((w) => {
    const start = Math.floor(now / w.size) * w.size;
    return db
      .prepare(
        `INSERT INTO rate_counters (scope, subject, window_start, expires_at, count) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (scope, subject, window_start) DO UPDATE SET count = count + 1
         RETURNING count, expires_at`
      )
      .bind(w.scope, subject, start, start + w.size);
  });
  const results = await db.batch<{ count: number; expires_at: number }>(stmts);

  let retryAfterMs = 0;
  results.forEach((r, i) => {
    const row = r.results[0];
    if (row && row.count > windows[i].limit) retryAfterMs = Math.max(retryAfterMs, row.expires_at - now);
  });
  if (retryAfterMs > 0) {
    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    throw new HttpError(429, "rate_limited", undefined, {
      extra: { retry_after: seconds },
      headers: { "retry-after": String(seconds) },
    });
  }
}
