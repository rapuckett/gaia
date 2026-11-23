// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { FetchLike, FetchResponseLike } from '@/platform/fetch.types';

/** The relay refused the handle's secret (or doesn't know the handle): register again. */
export class RelayUnauthorizedError extends Error {
    constructor() {
        super('The push relay no longer accepts this phone\'s registration for that PC.');
        this.name = 'RelayUnauthorizedError';
    }
}

/** No answer from the relay, or a 5xx / 429: it can't be reached right now. */
export class RelayUnreachableError extends Error {
    constructor(readonly status: number | null, cause?: unknown) {
        super(status === null ? 'The push relay could not be reached.' : `The push relay answered ${status}.`, { cause });
        this.name = 'RelayUnreachableError';
    }
}

/** Any other refusal (400 and the like): this build and the relay disagree on the contract. */
export class RelayRequestError extends Error {
    constructor(readonly status: number, readonly code: string | null) {
        super(`The push relay refused the request (${status}${code ? ` ${code}` : ''}). This build of the app may not match the relay.`);
        this.name = 'RelayRequestError';
    }
}

export interface RelayRegistration {
    platform: 'apns' | 'fcm';
    token: string;
    app_id: string;
    environment: 'sandbox' | 'production';
}

/** A registration as the relay issued it: `secret` stays on this phone, `sendToken` goes to the PC. */
export interface RelayHandle {
    handle: string;
    secret: string;
    sendToken: string;
}

/** What rotating the token and deleting the handle need: the handle and the phone's own secret. */
export type RelayCredential = Pick<RelayHandle, 'handle' | 'secret'>;

/** The push relay's phone-facing calls (the SRE contract, §1 of the push API). Never logs a token or secret. */
export interface RelayClient {
    register(body: RelayRegistration): Promise<RelayHandle>;
    updateToken(handle: RelayCredential, token: string): Promise<void>;
    remove(handle: RelayCredential): Promise<void>;
}

const HANDLE = /^[A-Za-z0-9_-]{16,128}$/;

async function call(fetch: FetchLike, url: string, init: Parameters<FetchLike>[1]): Promise<FetchResponseLike> {
    let res: FetchResponseLike;
    try {
        res = await fetch(url, init);
    } catch (error) {
        throw new RelayUnreachableError(null, error);
    }
    if (res.ok) return res;
    if (res.status === 401) throw new RelayUnauthorizedError();
    if (res.status === 429 || res.status >= 500) throw new RelayUnreachableError(res.status);
    const text = await res.text();
    let code: unknown = null;
    try {
        code = (JSON.parse(text) as { error?: unknown }).error;
    } catch {
        // A refusal without a JSON body still reports its status.
    }
    throw new RelayRequestError(res.status, typeof code === 'string' ? code : null);
}

export function createRelayClient(baseUrl: string, fetch: FetchLike): RelayClient {
    const handleUrl = (h: RelayCredential) => {
        if (!HANDLE.test(h.handle)) throw new RelayRequestError(0, 'bad_handle');
        return `${baseUrl}/v1/handles/${h.handle}`;
    };
    const auth = (h: RelayCredential) => ({ Authorization: `Bearer ${h.secret}` });
    return {
        async register(body) {
            const res = await call(fetch, `${baseUrl}/v1/handles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const answer = JSON.parse(await res.text()) as { handle?: unknown; secret?: unknown; send_token?: unknown };
            const { handle, secret, send_token: sendToken } = answer;
            if (typeof handle !== 'string' || !HANDLE.test(handle) || typeof secret !== 'string' || !secret || typeof sendToken !== 'string' || !sendToken) {
                throw new RelayRequestError(res.status, 'bad_answer');
            }
            return { handle, secret, sendToken };
        },
        async updateToken(handle, token) {
            await call(fetch, handleUrl(handle), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...auth(handle) },
                body: JSON.stringify({ token }),
            });
        },
        async remove(handle) {
            await call(fetch, handleUrl(handle), { method: 'DELETE', headers: auth(handle) });
        },
    };
}
