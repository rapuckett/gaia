// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaPinMismatchError, GaiaUploadUnsupportedError } from '@/api/errors';
import { createUtf8Decoder } from '@/api/utf8';

import { GaiaTransport, type NativeSubscription } from '../../modules/gaia-transport';
import { isDeviceUnknown } from './deviceGate';
import type { FetchRequestInit, FetchResponseLike } from './fetch.types';
import { encodeBody } from './uploadBody';

let lastId = 0;
let deviceGone: ((pcId: string) => void) | null = null;

/** Who hears that a paired PC refused this phone's token: it was unpaired there, or the PC was reset. */
export function onDeviceGone(handler: ((pcId: string) => void) | null): void {
    deviceGone = handler;
}

let networkFailure: (() => void) | null = null;

/** Who hears that a request to the paired PC failed at the network level, so another of its addresses can be chosen. */
export function onNetworkFailure(handler: (() => void) | null): void {
    networkFailure = handler;
}

/** Tells the onNetworkFailure handler about a rejection that came from the network, not from the PC. */
export function reportIfNetworkFailure(err: unknown): never {
    if ((err as { code?: unknown } | null)?.code === 'network') networkFailure?.();
    throw err;
}

/**
 * Tells the onDeviceGone handler when the PC's device gate refused this phone's token (see isDeviceUnknown).
 * Any other 401 passes through untouched. The gate's refusal is small, so its body is read here and handed back
 * through the response again, for a caller that reads `text()` or `body` afterwards.
 */
export async function reportIfDeviceGone(pcId: string, res: FetchResponseLike): Promise<FetchResponseLike> {
    const challenge = res.headers.get('www-authenticate');
    if (res.status !== 401 || !/^bearer\b/i.test(challenge ?? '')) return res;
    const text = await res.text();
    if (isDeviceUnknown(res.status, challenge, text)) {
        console.warn(`The PC ${pcId} answered 401 device_unknown`);
        deviceGone?.(pcId);
    }
    const bytes = new TextEncoder().encode(text);
    return {
        ok: res.ok,
        status: res.status,
        headers: res.headers,
        body: new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes);
                controller.close();
            },
        }),
        text: () => Promise.resolve(text),
    };
}

/** A native rejection as an Error the app can act on, with the native `code`; a pin mismatch is GaiaPinMismatchError. */
export function transportError(err: unknown): Error {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'pin_mismatch') return new GaiaPinMismatchError({ cause: err });
    const message = err instanceof Error ? err.message : String(err);
    return Object.assign(new Error(message, { cause: err }), { code });
}

/** A request to a paired PC over TLS pinned to its certificate; the device token is added natively. */
export async function pinnedFetch(pcId: string, url: string, init: FetchRequestInit = {}): Promise<FetchResponseLike> {
    const { signal, body: sent } = init;
    const upload = sent !== undefined && typeof sent !== 'string' ? encodeBody(sent) : null;
    const { upload: sendUpload } = GaiaTransport;
    if (upload && !sendUpload) throw new GaiaUploadUnsupportedError();
    const id = `pinned-${++lastId}`;
    if (signal?.aborted) throw Object.assign(new Error('The request was canceled.'), { code: 'aborted' });
    const { onUploadProgress } = init;
    let progress: NativeSubscription | undefined;
    if (upload && onUploadProgress && GaiaTransport.addListener) {
        progress = GaiaTransport.addListener('onUploadProgress', (e) => {
            if (e.id === id) onUploadProgress(e.sent, e.total);
        });
    }
    const done = () => {
        signal?.removeEventListener('abort', abort);
        progress?.remove();
        progress = undefined;
    };
    const abort = () => {
        done();
        GaiaTransport.cancel(id);
    };
    signal?.addEventListener('abort', abort);

    let head;
    try {
        const method = init.method ?? 'GET';
        if (upload && sendUpload) {
            const headers = Object.fromEntries(Object.entries(init.headers ?? {}).filter(([name]) => name.toLowerCase() !== 'content-type'));
            if (upload.contentType) headers['Content-Type'] = upload.contentType;
            head = await sendUpload.call(GaiaTransport, id, pcId, method, url, headers, upload.segments);
        } else {
            head = await GaiaTransport.start(id, pcId, method, url, init.headers ?? {}, typeof sent === 'string' ? sent : null);
        }
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
