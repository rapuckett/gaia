// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import { normalizeBaseUrl } from '@/api/http';

export interface ConnectionConfig {
    baseUrl: string;
    /** For pairing, later; the MVP talks to a local GAIA without one. */
    token?: string | null;
}

interface ConnectionState {
    connection: ConnectionConfig | null;
    /** Throws GaiaConfigError for an address that isn't an http(s) URL; nothing is stored then. */
    setConnection(connection: ConnectionConfig): void;
    clearConnection(): void;
}

// The PC's address for development, inlined by Expo when Metro starts; GAIA's port changes at every launch.
const SEED_URL = process.env.EXPO_PUBLIC_GAIA_URL || null;

export const useConnectionStore = create<ConnectionState>((set) => ({
    connection: SEED_URL ? { baseUrl: normalizeBaseUrl(SEED_URL) } : null,
    setConnection: (connection) => set({ connection: { ...connection, baseUrl: normalizeBaseUrl(connection.baseUrl) } }),
    clearConnection: () => set({ connection: null }),
}));
