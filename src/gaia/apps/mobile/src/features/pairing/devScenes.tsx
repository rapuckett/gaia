// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import type { DeviceChange } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ConnectionBanner } from '@/features/banners/ConnectionBanner';
import type { ConnectionConfig } from '@/state/connection';
import { Screen, ScreenBannerProvider, Stack, UIProvider } from '@/ui';

import type { RouteOrigin } from './homeNetwork';
import { PairedPcsScreen } from './PairedPcsScreen';
import { setPairingService } from './registry';
import { ConnectionOverride } from './routes';
import type { PairedPc } from './service';

const HOME: RouteOrigin = { kind: 'home', origin: 'https://192.168.1.20:4243' };
const TAILNET: RouteOrigin = {
    kind: 'tailnet',
    origin: 'https://100.101.102.103:4243',
};
const LONG_NAME = 'The big workstation in the upstairs office next to the printer and the router';

export interface PairingScene {
    name: string;
    chosen: RouteOrigin;
    banner?: boolean;
    /** A second paired PC with the same name, on the same host at another port. */
    twin?: boolean;
    /** What the PC answers for "Changes made from this phone"; the list starts open. */
    changes?: DeviceChange[] | Error | 'loading';
    /** Also open the sheet with the full list. */
    changesAll?: boolean;
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const CHANGES: DeviceChange[] = [
    { id: 'c1', kind: 'providerKeySet', params: { provider: 'Anthropic' }, at: ago(4) },
    { id: 'c2', kind: 'localOnlyOff', params: {}, at: ago(95) },
    { id: 'c3', kind: 'skillAddedCode', params: { name: 'git-helper' }, at: ago(60 * 30) },
    { id: 'c4', kind: 'connectorGrant', params: { agent: 'GAIA', connector: 'Gmail' }, at: ago(60 * 24 * 3) },
];
const WAVE1: DeviceChange[] = [
    { id: 'w1', kind: 'connectorGrant', params: { agent: 'GAIA', connector: 'Gmail', granted: false }, at: ago(3) },
    { id: 'w2', kind: 'connectorActivation', params: { agent: 'GAIA', connector: 'Google Calendar', active: true }, at: ago(8) },
    { id: 'w3', kind: 'connectorEnable', params: { connector: 'GitHub' }, at: ago(14) },
    { id: 'w4', kind: 'connectorDisable', params: { connector: 'GitHub' }, at: ago(20) },
    { id: 'w5', kind: 'discordControl', params: { action: 'takeOver' }, at: ago(30) },
    { id: 'w6', kind: 'memoryCommit', params: { source: 'discovery', count: 12 }, at: ago(45) },
    { id: 'w7', kind: 'memoryCommit', params: { source: 'inference', count: 1 }, at: ago(50) },
    { id: 'w8', kind: 'serverTarget', params: { mode: 'gaia' }, at: ago(70) },
    { id: 'w9', kind: 'deviceRemoved', params: { device: 'Pixel 9 Pro' }, at: ago(90) },
    { id: 'w10', kind: 'pairingClosed', params: {}, at: ago(120) },
    { id: 'w11', kind: 'profileScanOn', params: {}, at: ago(150) },
    { id: 'w12', kind: 'profileScanOff', params: {}, at: ago(180) },
];
const WAVE6: DeviceChange[] = [
    { id: 'x1', kind: 'permissionsDefault', params: { mode: 'ask' }, at: ago(3) },
    { id: 'x2', kind: 'permissionsDefault', params: { mode: 'full_access' }, at: ago(9) },
    { id: 'x3', kind: 'localOnlyOn', params: {}, at: ago(20) },
    { id: 'x4', kind: 'agentInstalled', params: {}, at: ago(40) },
];
const MANY: DeviceChange[] = Array.from({ length: 35 }, (_, i) => ({ ...CHANGES[i % CHANGES.length]!, id: `m${i}`, at: ago(10 + i * 90) }));

export const PAIRING_SCENES: Record<string, PairingScene> = {
    'route-home': { name: 'Studio PC', chosen: HOME },
    'route-tailnet': { name: 'Studio PC', chosen: TAILNET },
    'route-tailnet-long-name': { name: LONG_NAME, chosen: TAILNET },
    'two-pcs-same-host': { name: 'air', chosen: HOME, twin: true },
    'unreachable-away': { name: 'Studio PC', chosen: TAILNET, banner: true },
    'changes-loading': { name: 'Studio PC', chosen: HOME, changes: 'loading' },
    'changes-empty': { name: 'Studio PC', chosen: HOME, changes: [] },
    'changes-few': { name: 'Studio PC', chosen: HOME, changes: CHANGES },
    'changes-many': { name: 'Studio PC', chosen: HOME, changes: MANY },
    'changes-all': { name: 'Studio PC', chosen: HOME, changes: MANY, changesAll: true },
    'changes-wave1': { name: 'Studio PC', chosen: HOME, changes: WAVE1 },
    'changes-wave6': { name: 'Studio PC', chosen: HOME, changes: WAVE6 },
    'changes-error': { name: 'Studio PC', chosen: HOME, changes: new GaiaApiError(500, 'The PC could not read its audit log.') },
    'changes-unknown-kind': {
        name: 'Studio PC',
        chosen: HOME,
        changes: [{ id: 'u1', kind: 'cameraEnabled', params: {}, at: ago(12) }, ...CHANGES.slice(0, 2)],
    },
};

function connectionOf(scene: PairingScene): ConnectionConfig {
    const routes = [HOME, TAILNET];
    return {
        baseUrl: scene.chosen.origin,
        pcId: 'scene-pc',
        pinned: true,
        origins: routes.map((r) => r.origin),
        routes,
    };
}

/** The real Your PCs screen, or the connection banner, on a fake paired PC whose chosen address is the scene's. */
export function PairingSceneView({ scene }: { scene: PairingScene }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        const pc: PairedPc = {
            id: 'scene-pc',
            deviceId: 'scene-device',
            name: scene.name,
            connection: connectionOf(scene),
            pairedAt: scene.twin ? '2026-11-10T09:15:00' : undefined,
        };
        const twinOrigin = 'https://192.168.1.20:4245';
        const twin: PairedPc = {
            id: 'scene-pc-2',
            name: scene.name,
            connection: { baseUrl: twinOrigin, pcId: 'scene-pc-2', pinned: true, origins: [twinOrigin], routes: [{ kind: 'home', origin: twinOrigin }] },
            pairedAt: '2026-11-10T18:40:00',
        };
        setPairingService({ list: async () => (scene.twin ? [pc, twin] : [pc]) } as never);
        const fake = createFakeClient({ deviceChanges: scene.changes });
        return scene.banner
            ? {
                  ...fake,
                  getSystemStatus: async () => {
                      throw new GaiaNetworkError(scene.chosen.origin, new Error('no answer'));
                  },
              }
            : fake;
    });
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ConnectionOverride.Provider value={connectionOf(scene)}>
                        {scene.banner ? (
                            <ScreenBannerProvider banner={null}>
                                <Screen scroll>
                                    <Stack padding="lg">
                                        <ConnectionBanner />
                                    </Stack>
                                </Screen>
                            </ScreenBannerProvider>
                        ) : (
                            <ScreenBannerProvider banner={null}>
                                <PairedPcsScreen onAdd={() => undefined} changesInitial={scene.changesAll ? 'all' : scene.changes ? 'open' : undefined} />
                            </ScreenBannerProvider>
                        )}
                    </ConnectionOverride.Provider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
