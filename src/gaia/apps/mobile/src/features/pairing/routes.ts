// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

import { normalizeBaseUrl } from '@/api/http';
import { useConnectionStore, type ConnectionConfig } from '@/state/connection';

import type { RouteKind } from './homeNetwork';

/** How the phone reaches the paired PC right now: the kind of the address the route keeper chose. */
export function routeKindOf(connection: ConnectionConfig | null | undefined): RouteKind | null {
    if (!connection?.routes) return null;
    const chosen = normalizeBaseUrl(connection.baseUrl);
    return connection.routes.find((r) => normalizeBaseUrl(r.origin) === chosen)?.kind ?? null;
}

/** Whether the paired PC has a Tailscale address stored, so "turn on Tailscale" is advice that can work. */
export function hasTailnetRoute(connection: ConnectionConfig | null | undefined): boolean {
    return !!connection?.routes?.some((r) => r.kind === 'tailnet');
}

export function useActiveRouteKind(): RouteKind | null {
    return useConnectionStore((s) => routeKindOf(s.connection));
}

/** The dev gallery's scenes show a fake paired PC without connecting the whole app to it. */
export const ConnectionOverride = createContext<ConnectionConfig | null>(null);

export function useActiveConnection(): ConnectionConfig | null {
    const stored = useConnectionStore((s) => s.connection);
    return useContext(ConnectionOverride) ?? stored;
}
