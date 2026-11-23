// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { UI_HEADERS } from '@/api/constants';
import { GaiaApiError, parseErrorDetail } from '@/api/errors';
import type { FetchLike } from '@/platform/fetch.types';

/** This device's own push record on a paired PC (Parity's `device_self` route, §2 of the push API). */
export const PUSH_SELF_ROUTE = '/api/devices/me/push';

/** What the PC keeps to push to this phone: the send-only relay credential, never the phone's relay secret. */
export interface PcPushRecord {
    relay_url: string;
    handle: string;
    send_token: string;
    key: string;
    platform: 'apns' | 'fcm';
}

export interface PcPushStatus {
    enabled: boolean;
    relay_host?: string | null;
}

export interface PcPushClient {
    put(record: PcPushRecord): Promise<void>;
    get(): Promise<PcPushStatus>;
    remove(): Promise<void>;
}

/** `fetch` is the PC's pinned transport; `origin` is the address it answers at. The record's credentials go only in the PUT body. */
export function createPcPushClient(origin: string, fetch: FetchLike): PcPushClient {
    const url = `${origin}${PUSH_SELF_ROUTE}`;
    async function send(method: string, body?: string): Promise<string> {
        const headers: Record<string, string> = { ...UI_HEADERS, ...(body ? { 'Content-Type': 'application/json' } : {}) };
        const res = await fetch(url, { method, headers, body });
        const text = await res.text();
        // A DELETE of a record the PC already dropped is done.
        if (!res.ok && !(method === 'DELETE' && res.status === 404)) throw new GaiaApiError(res.status, parseErrorDetail(text));
        return text;
    }
    return {
        async put(record) {
            await send('PUT', JSON.stringify(record));
        },
        async get() {
            const status = JSON.parse(await send('GET')) as Partial<PcPushStatus>;
            if (typeof status.enabled !== 'boolean') throw new GaiaApiError(200, `${PUSH_SELF_ROUTE} answered without "enabled".`);
            return { enabled: status.enabled, relay_host: status.relay_host ?? null };
        },
        async remove() {
            await send('DELETE');
        },
    };
}
