// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

import { GaiaTransportMissingError } from '@/api/errors';
import { useConnectionStore } from '@/state/connection';

import type { FetchLike, FetchRequestInit } from './fetch.types';
import { originOf } from './pcUrl';
import { pinnedFetch, reportIfDeviceGone, reportIfNetworkFailure } from './pinnedFetch';
import { encodeBody } from './uploadBody';

export { isPcUrl } from './pcUrl';

type ExpoInit = NonNullable<Parameters<typeof expoFetch>[1]>;

// expo/fetch percent-encodes a part's filename, so an Arabic name reached the PC as %D8%B5…; send the pinned transport's bytes.
async function plainInit(init: FetchRequestInit | undefined): Promise<ExpoInit | undefined> {
    if (!(init?.body instanceof FormData)) return init as ExpoInit | undefined;
    const { contentType, segments } = encodeBody(init.body);
    const utf8 = new TextEncoder();
    const parts = await Promise.all(segments.map((s) => ('text' in s ? utf8.encode(s.text) : new File(s.file).bytes())));
    const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        body.set(p, at);
        at += p.length;
    }
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).filter(([name]) => name.toLowerCase() !== 'content-type'));
    return { ...init, body, headers: { ...headers, 'Content-Type': contentType as string } } as ExpoInit;
}

// The paired PC, at any of its addresses, only over its pinned connection. Only a dev build may use the plain fetch (the simulator's dev backend).
export const platformFetch: FetchLike = (url, init) => {
    const connection = useConnectionStore.getState().connection;
    const origin = originOf(url);
    if (connection?.pinned && connection.pcId && [connection.baseUrl, ...(connection.origins ?? [])].some((o) => originOf(o) === origin)) {
        const { pcId } = connection;
        return pinnedFetch(pcId, url, init).then((res) => reportIfDeviceGone(pcId, res), reportIfNetworkFailure);
    }
    if (!__DEV__) return Promise.reject(new GaiaTransportMissingError());
    return plainInit(init).then((plain) => expoFetch(url, plain));
};
