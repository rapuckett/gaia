// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';
import { create } from 'zustand';

import { normalizeBaseUrl } from '@/api/http';
import { galleryBuild } from '@/features/dev/devGallery';
import type { RouteOrigin } from '@/features/pairing/homeNetwork';

export interface ConnectionConfig {
    baseUrl: string;
    /** A bearer token sent from JavaScript; a paired PC's token never is (it stays in the Keychain). */
    token?: string | null;
    /** The paired PC, for a connection that goes over TLS pinned to its certificate. */
    pcId?: string;
    pinned?: true;
    /** Every address the paired PC answers at, `baseUrl` among them; requests to any of them stay pinned. */
    origins?: string[];
    /** The same addresses with how each is reached (home, Tailscale, relay). */
    routes?: RouteOrigin[];
}

interface ConnectionState {
    connection: ConnectionConfig | null;
    /** False while the paired PC saved on this phone is being read at launch; nothing should decide "not paired" until then. */
    restored: boolean;
    /** The PC that said this phone is no longer paired with it, for a one-line note on the pairing screen. */
    removedFrom: string | null;
    /** Throws GaiaConfigError for an address that isn't an http(s) URL; nothing is stored then. */
    setConnection(connection: ConnectionConfig): void;
    clearConnection(): void;
    beginRestore(): void;
    finishRestore(connection: ConnectionConfig | null): void;
    /** The PC refused this phone's token (it was unpaired there): back to pairing, with a note naming it. */
    connectionRemoved(pcName: string): void;
}

// The PC's address for development, inlined by Expo when Metro starts; GAIA's port changes at every launch.
// A production phone build ignores it: it reaches a PC only by pairing, over pinned TLS. A gallery build of the
// development app (galleryBuild) takes it too, for device checks without Metro.
export function seedUrl(env: string | undefined, dev: boolean, os: string): string | null {
    return env && (dev || os === 'web') ? env : null;
}
const SEED_URL = seedUrl(process.env.EXPO_PUBLIC_GAIA_URL, __DEV__ || galleryBuild(), Platform.OS);

export const useConnectionStore = create<ConnectionState>((set) => ({
    connection: SEED_URL ? { baseUrl: normalizeBaseUrl(SEED_URL) } : null,
    restored: true,
    removedFrom: null,
    setConnection: (connection) =>
        set({ connection: { ...connection, baseUrl: normalizeBaseUrl(connection.baseUrl) }, removedFrom: null }),
    clearConnection: () => set({ connection: null }),
    beginRestore: () => set({ restored: false }),
    finishRestore: (connection) =>
        set((state) => ({
            restored: true,
            // Pairing that finished while this was reading wins.
            connection: state.connection ?? (connection ? { ...connection, baseUrl: normalizeBaseUrl(connection.baseUrl) } : null),
        })),
    connectionRemoved: (pcName) => set({ connection: null, removedFrom: pcName }),
}));
