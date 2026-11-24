// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { ENDPOINTS, UI_HEADERS } from '@/api/constants';
import { GaiaPinMismatchError } from '@/api/errors';
import { onNetworkFailure, pinnedFetch } from '@/platform/pinnedFetch';
import { useConnectionStore } from '@/state/connection';

import type { RouteOrigin } from './homeNetwork';
import { chooseOrigin, type NetworkClass, type ProbeResult } from './originChooser';

const UNREACHABLE = new Set(['network', 'aborted', 'unreachable']);

/** A pinned `GET /api/health` at `origin`, given up after `timeoutMs`. The certificate is checked before any byte is sent. */
export async function probeOrigin(pcId: string, origin: string, timeoutMs: number, signal: AbortSignal): Promise<ProbeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort);
    try {
        const res = await pinnedFetch(pcId, `${origin}${ENDPOINTS.health}`, {
            headers: { ...UI_HEADERS },
            signal: controller.signal,
        });
        void res.body?.cancel();
        return { status: res.status };
    } catch (err) {
        if (err instanceof GaiaPinMismatchError) return { failure: 'pin_mismatch' };
        if (UNREACHABLE.has(String((err as { code?: unknown }).code))) return { failure: 'unreachable' };
        throw err;
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
    }
}

export interface RouteKeeperDeps {
    service: {
        origins(pcId: string): Promise<RouteOrigin[]>;
        chose(pcId: string, origin: string): Promise<void>;
        refreshRoutes(pcId: string, origin: string): Promise<RouteOrigin[]>;
        deviceGone(pcId: string): Promise<void>;
    };
    probe(pcId: string, origin: string, timeoutMs: number, signal: AbortSignal): Promise<ProbeResult>;
    networkClass?(): Promise<NetworkClass>;
}

async function currentNetworkClass(): Promise<NetworkClass> {
    const { type } = await Network.getNetworkStateAsync();
    return type === Network.NetworkStateType.CELLULAR ? 'cellular' : 'local';
}

export type RechooseReason = 'connected' | 'foreground' | 'network-change' | 'network-failure' | 'routes-changed';

/**
 * Keeps the paired PC's connection on the address that answers best from this network: chosen afresh on
 * launch, pairing, foreground, a network change and a network-level failure, and each time a fresh route
 * list is fetched from the PC.
 */
export function createRouteKeeper(deps: RouteKeeperDeps) {
    const networkClass = deps.networkClass ?? currentNetworkClass;
    // Addresses whose certificate didn't match on this network.
    let bad = new Set<string>();
    let running: { controller: AbortController; done: Promise<void> } | null = null;

    async function choose(pcId: string, reason: RechooseReason, signal: AbortSignal): Promise<void> {
        const origins = await deps.service.origins(pcId);
        if (origins.length === 0 || signal.aborted) return;
        const choice = await chooseOrigin(origins, {
            network: await networkClass(),
            bad,
            probe: (o, ms, s) => deps.probe(pcId, o, ms, s),
            signal,
        });
        if (signal.aborted || useConnectionStore.getState().connection?.pcId !== pcId) return;
        if (choice.state === 'gone') return deps.service.deviceGone(pcId);
        // Pointing the app at a mismatched address makes its next request show the hard-fail screen.
        if (choice.state === 'pin_mismatch') return deps.service.chose(pcId, choice.origin);
        if (choice.state === 'unreachable') return;
        await deps.service.chose(pcId, choice.origin);
        const routes = await deps.service.refreshRoutes(pcId, choice.origin);
        if (reason !== 'routes-changed' && !routes.some((r) => r.origin === choice.origin) && !signal.aborted) {
            await choose(pcId, 'routes-changed', signal);
        }
    }

    function rechoose(reason: RechooseReason): Promise<void> {
        const connection = useConnectionStore.getState().connection;
        if (!connection?.pinned || !connection.pcId) return Promise.resolve();
        // Many requests fail together when the network drops; one choice answers them all.
        if (reason === 'network-failure' && running) return running.done;
        running?.controller.abort();
        const controller = new AbortController();
        const pcId = connection.pcId;
        const done = choose(pcId, reason, controller.signal)
            .catch((err: unknown) => console.error(`Could not choose an address for the paired PC ${pcId} (${reason})`, err))
            .finally(() => {
                if (running?.controller === controller) running = null;
            });
        running = { controller, done };
        return done;
    }

    function networkChanged(): Promise<void> {
        bad = new Set();
        return rechoose('network-change');
    }

    return { rechoose, networkChanged };
}

/** Wires a route keeper to the app: the connected PC changing, foreground, network changes and network failures. */
export function startRouteKeeper(deps: RouteKeeperDeps) {
    const keeper = createRouteKeeper(deps);
    useConnectionStore.subscribe((state, prev) => {
        if (state.connection?.pinned && state.connection.pcId !== prev.connection?.pcId) void keeper.rechoose('connected');
    });
    let appState = AppState.currentState;
    AppState.addEventListener('change', (next) => {
        if (next === 'active' && appState !== 'active') void keeper.rechoose('foreground');
        appState = next;
    });
    Network.addNetworkStateListener(() => void keeper.networkChanged());
    onNetworkFailure(() => void keeper.rechoose('network-failure'));
    return keeper;
}
