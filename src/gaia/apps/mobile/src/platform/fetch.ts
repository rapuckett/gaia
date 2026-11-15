// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fetch as expoFetch } from 'expo/fetch';

import { useConnectionStore } from '@/state/connection';

import type { FetchLike } from './fetch.types';
import { pinnedFetch, reportIfDeviceGone } from './pinnedFetch';

// Scheme and authority, lowercased; enough to tell the paired PC's address from any other.
function originOf(url: string): string | null {
    return /^https?:\/\/[^/?#]+/i.exec(url)?.[0].toLowerCase() ?? null;
}

// The paired PC only over its pinned connection; anything else (the simulator's dev backend) as before.
export const platformFetch: FetchLike = (url, init) => {
    const connection = useConnectionStore.getState().connection;
    if (connection?.pinned && connection.pcId && originOf(url) === originOf(connection.baseUrl)) {
        const { pcId } = connection;
        return pinnedFetch(pcId, url, init).then((res) => reportIfDeviceGone(pcId, res));
    }
    return expoFetch(url, init);
};
