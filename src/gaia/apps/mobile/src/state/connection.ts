// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

export interface ConnectionConfig {
    baseUrl: string;
    token: string | null;
}

interface ConnectionState {
    connection: ConnectionConfig | null;
    setConnection(connection: ConnectionConfig): void;
    clearConnection(): void;
}

// In memory only: where the pairing is kept is still undecided.
export const useConnectionStore = create<ConnectionState>((set) => ({
    connection: null,
    setConnection: (connection) => set({ connection }),
    clearConnection: () => set({ connection: null }),
}));
