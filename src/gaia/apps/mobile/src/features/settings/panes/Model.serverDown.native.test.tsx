// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { SETTINGS_SCENES, settingsSceneClient } from '@/features/settings/devScenes';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import Model from './Model';

jest.mock('./model/ModelList', () => ({ ModelList: () => null }));
jest.mock('./model/CloudSpending', () => ({ CloudSpending: () => null }));
jest.mock('./model/CloudPrices', () => ({ CloudPrices: () => null }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

function mount(client: ReturnType<typeof createFakeClient>, provider = 'local') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return render(<Model provider={provider} />, { wrapper: wrap });
}

describeNative('Settings > Model with the model server down', () => {
    it.each(['local', 'amd'])('carries one notice on the %s tab, the server\'s own words on its detail line, and no separate error card', async (tab) => {
        const scene = SETTINGS_SCENES[tab === 'local' ? 'model-server-down-yours-local' : 'model-server-down-yours-gateway']!;
        await mount(settingsSceneClient(scene) as never, tab);
        expect(await screen.findByTestId('server-down-notice')).toBeTruthy();
        expect(screen.getAllByTestId('server-down-notice')).toHaveLength(1);
        expect(screen.getByText(t('mobileApp.serverDown.paneBody'))).toBeTruthy();
        expect(screen.queryByText(t('serverDown.body'))).toBeNull();
        expect(await screen.findByTestId('server-down-detail')).toHaveTextContent('connect ECONNREFUSED 192.168.1.20:13305');
        expect(screen.getAllByText('connect ECONNREFUSED 192.168.1.20:13305')).toHaveLength(1);
        expect(screen.getAllByText(t('settings.key.checkAgain'))).toHaveLength(1);
    });

    it('shows no notice while the server answers', async () => {
        const scene = SETTINGS_SCENES['gpu-adjustable']!;
        await mount(settingsSceneClient(scene) as never);
        await screen.findByText(t('settings.model.inUseTitle'));
        expect(screen.queryByTestId('server-down-notice')).toBeNull();
    });
});
