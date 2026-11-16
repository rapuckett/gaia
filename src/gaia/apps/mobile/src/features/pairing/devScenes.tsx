// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { GaiaNetworkError } from '@/api/errors';
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
}

export const PAIRING_SCENES: Record<string, PairingScene> = {
    'route-home': { name: 'Studio PC', chosen: HOME },
    'route-tailnet': { name: 'Studio PC', chosen: TAILNET },
    'route-tailnet-long-name': { name: LONG_NAME, chosen: TAILNET },
    'unreachable-away': { name: 'Studio PC', chosen: TAILNET, banner: true },
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
            name: scene.name,
            connection: connectionOf(scene),
        };
        setPairingService({ list: async () => [pc] } as never);
        const fake = createFakeClient();
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
                                <PairedPcsScreen onAdd={() => undefined} />
                            </ScreenBannerProvider>
                        )}
                    </ConnectionOverride.Provider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
