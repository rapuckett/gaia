// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import type { ConnectorRow } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ConnectorsScreen } from '@/features/connectors';
import { CONNECTOR_SCENES, ConnectorsGallery, type ConnectorScene } from '@/features/connectors/ConnectorsGallery';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { KeyedScene } from '@/features/dev/KeyedScene';
import { ScreenBannerProvider, UIProvider } from '@/ui';

const row = (id: string, display_name: string, over: Partial<ConnectorRow> = {}) =>
    ({ id, display_name, type: 'mcp_server', description: '', configured: true, configurable: true, enabled: true, account_id: null, activations: {}, ...over }) as unknown as ConnectorRow;

const CONNECTORS = [
    row('slack', 'Slack'),
    row('github', 'GitHub Enterprise Cloud Organization Workspace Integration for the Engineering Platform Team', { type: 'oauth_pkce', account_id: 'engineering-platform@example.com' }),
    row('notion', 'Notion', { enabled: false }),
];

/** The Connectors screen on a fake PC, with a short row and one long enough to wrap. */
export default function ConnectorsGalleryRoute() {
    const { state } = useLocalSearchParams<{ state?: string }>();
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => createFakeClient({ connectors: CONNECTORS }));
    if (!devGalleryEnabled()) return <Redirect href="/" />;
    if ((CONNECTOR_SCENES as readonly string[]).includes(state ?? '')) return <KeyedScene sceneKey={state as string} scene={ConnectorsGallery} props={{ state: state as ConnectorScene }} />;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <ConnectorsScreen />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
