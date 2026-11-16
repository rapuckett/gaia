// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fetch as expoFetch } from 'expo/fetch';

import { GaiaTransportMissingError } from '@/api/errors';
import { useConnectionStore } from '@/state/connection';

import type { FetchLike } from './fetch.types';
import { originOf } from './pcUrl';
import { pinnedFetch, reportIfDeviceGone, reportIfNetworkFailure } from './pinnedFetch';

export { isPcUrl } from './pcUrl';

// The paired PC, at any of its addresses, only over its pinned connection. Only a dev build may use the plain fetch (the simulator's dev backend).
export const platformFetch: FetchLike = (url, init) => {
    const connection = useConnectionStore.getState().connection;
    const origin = originOf(url);
    if (connection?.pinned && connection.pcId && [connection.baseUrl, ...(connection.origins ?? [])].some((o) => originOf(o) === origin)) {
        const { pcId } = connection;
        return pinnedFetch(pcId, url, init).then((res) => reportIfDeviceGone(pcId, res), reportIfNetworkFailure);
    }
    if (!__DEV__) return Promise.reject(new GaiaTransportMissingError());
    return expoFetch(url, init);
};
