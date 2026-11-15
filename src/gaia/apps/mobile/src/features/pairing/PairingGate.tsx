// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import { useConnectionStore } from '@/state/connection';

import { PairingFlow } from './PairingFlow';

/**
 * The first-launch gate: with no PC connected the person sees the welcome and pairing screens, not the app.
 * A development build started with EXPO_PUBLIC_GAIA_URL already has a connection, so it skips this and
 * reaches GAIA over plain HTTP as before.
 */
export function PairingGate({ children }: { children: ReactNode }) {
    const connected = useConnectionStore((s) => s.connection !== null);
    return connected ? <>{children}</> : <PairingFlow />;
}
