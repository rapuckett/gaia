// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fetch as expoFetch } from 'expo/fetch';

import { currentPairedPc, usePairedPcsStore } from '@/state/pairedPcs';

import type { FetchLike } from './fetch.types';
import { pinnedFetch } from './pinnedFetch';

// Scheme and authority, lowercased; enough to tell the paired PC's address from any other.
function originOf(url: string): string | null {
    return /^https?:\/\/[^/?#]+/i.exec(url)?.[0].toLowerCase() ?? null;
}

// The paired PC only over its pinned connection; anything else (the simulator's dev backend) as before.
export const platformFetch: FetchLike = (url, init) => {
    const pc = currentPairedPc(usePairedPcsStore.getState());
    if (pc && originOf(url) === originOf(pc.origin)) return pinnedFetch(pc.pcId, url, init);
    return expoFetch(url, init);
};
