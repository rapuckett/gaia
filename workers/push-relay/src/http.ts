// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Every failure is an {@link HttpError}, translated to `{error, message?}` at
 * the request boundary.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;
  readonly headers: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message?: string,
    opts: { extra?: Record<string, unknown>; headers?: Record<string, string> } = {}
  ) {
    super(message ?? code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = opts.extra ?? {};
    this.headers = opts.headers ?? {};
    // An empty message keeps the body to `{error}`, e.g. the 401 that must
    // look the same for an unknown handle and a wrong secret.
    if (message === undefined) this.message = "";
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(err: HttpError): Response {
  const body: Record<string, unknown> = { error: err.code, ...err.extra };
  if (err.message) body.message = err.message;
  return json(body, err.status, err.headers);
}

export const unauthorized = () => new HttpError(401, "unauthorized");
