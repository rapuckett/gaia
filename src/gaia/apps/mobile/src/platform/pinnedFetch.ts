// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createUtf8Decoder } from '@/api/utf8';
import { PairingError } from '@/features/pairing/pairing.types';

import { GaiaTransport } from '../../modules/gaia-transport';
import type { FetchRequestInit, FetchResponseLike } from './fetch.types';

let lastId = 0;

/** A native rejection as an Error the app can act on; pin_mismatch becomes a PairingError. */
export function transportError(err: unknown): Error {
    const code = (err as { code?: unknown } | null)?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'pin_mismatch') return new PairingError('pin_mismatch', message);
    return Object.assign(new Error(message), { code });
}

/** A request to a paired PC over TLS pinned to its certificate; the device token is added natively. */
export async function pinnedFetch(pcId: string, url: string, init: FetchRequestInit = {}): Promise<FetchResponseLike> {
    const id = `pinned-${++lastId}`;
    const { signal } = init;
    if (signal?.aborted) throw Object.assign(new Error('The request was canceled.'), { code: 'aborted' });
    const abort = () => GaiaTransport.cancel(id);
    signal?.addEventListener('abort', abort);
    const done = () => signal?.removeEventListener('abort', abort);

    let head;
    try {
        head = await GaiaTransport.start(id, pcId, init.method ?? 'GET', url, init.headers ?? {}, init.body ?? null);
    } catch (err) {
        done();
        throw transportError(err);
    }

    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const chunk = await GaiaTransport.read(id);
                if (chunk === null) {
                    done();
                    controller.close();
                } else {
                    controller.enqueue(chunk);
                }
            } catch (err) {
                done();
                controller.error(transportError(err));
            }
        },
        cancel() {
            done();
            GaiaTransport.cancel(id);
        },
    });

    return {
        ok: head.status >= 200 && head.status < 300,
        status: head.status,
        headers: { get: (name) => head.headers[name.toLowerCase()] ?? null },
        body,
        async text() {
            const decoder = createUtf8Decoder();
            const reader = body.getReader();
            let out = '';
            for (;;) {
                const { done: end, value } = await reader.read();
                if (end) break;
                out += decoder.push(value);
            }
            return out + decoder.end();
        },
    };
}
