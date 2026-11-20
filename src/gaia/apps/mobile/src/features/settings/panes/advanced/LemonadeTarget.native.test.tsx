// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LemonadeTarget as Target } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { LemonadeTarget } from './LemonadeTarget';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const ADDRESS = 'http://192.168.1.20:13305';
const KEY = 'lemonade-key-7b3d';
const OWN = { mode: 'gaia', source: 'config', base_url: null, saved_base_url: null, api_key_stored: false, gaia_installed: true, offer: false, env_url_ignored: null } as unknown as Target;

function setup(client = createFakeClient({ lemonadeTarget: OWN })) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return { client, queryClient, wrap };
}

async function typeAndAsk(url: string, key: string) {
    await fireEvent.changeText(await screen.findByTestId('own-server-url'), url);
    await fireEvent.changeText(screen.getByTestId('own-server-key'), key);
    await fireEvent.press(screen.getByTestId('own-server-use'));
}

describeNative('Use my own server', () => {
    afterEach(() => act(() => sheetStore.reset()));

    it('asks on a sheet first; only its button sends the switch, confirmed, and the key then leaves the field', async () => {
        const { client, queryClient, wrap } = setup();
        await render(<LemonadeTarget />, { wrapper: wrap });

        // A secret field: masked, never suggested or autofilled.
        expect((await screen.findByTestId('own-server-key')).props).toMatchObject({ secureTextEntry: true, autoComplete: 'off' });
        await typeAndAsk(ADDRESS, KEY);

        expect(await screen.findByText(t('mobileApp.server.confirm.title'))).toBeTruthy();
        expect(screen.getByText(/^\u2066?192\.168\.1\.20:13305\u2069?$/)).toBeTruthy();
        expect(client.targetSets).toEqual([]);

        await fireEvent.press(screen.getByTestId('own-server-confirm'));
        await screen.findByText(/GAIA uses your Lemonade Server at/);
        expect(client.targetSets).toEqual([{ mode: 'external', base_url: ADDRESS, api_key: KEY, confirm: true }]);
        expect(screen.getByTestId('own-server-key').props.value).toBe('');
        queryClient.clear();
    });

    it('Cancel on the sheet sends nothing, and the key stays typed for another go', async () => {
        const { client, queryClient, wrap } = setup();
        await render(<LemonadeTarget />, { wrapper: wrap });
        await typeAndAsk(ADDRESS, KEY);

        await fireEvent.press(await screen.findByTestId('own-server-cancel'));
        expect(client.targetSets).toEqual([]);
        expect(screen.getByTestId('own-server-key', { includeHiddenElements: true }).props.value).toBe(KEY);
        queryClient.clear();
    });

    it('a failed check shows our one sentence, and the key is cleared all the same', async () => {
        const probe = "GAIA couldn't use a Lemonade Server at that address. Check the address and key, and that the PC running GAIA can reach the server.";
        const { queryClient, wrap } = setup(createFakeClient({ lemonadeTarget: OWN, serverChangeError: new GaiaApiError(422, probe) }));
        await render(<LemonadeTarget />, { wrapper: wrap });
        await typeAndAsk(ADDRESS, KEY);
        await fireEvent.press(await screen.findByTestId('own-server-confirm'));

        expect(await screen.findByTestId('advanced-server-probe-failed')).toBeTruthy();
        expect(screen.queryByText(probe)).toBeNull();
        expect(screen.getByTestId('own-server-key').props.value).toBe('');
        queryClient.clear();
    });

    it('switching back to GAIA’s own needs no sheet and sends no confirm', async () => {
        const yours = { ...OWN, mode: 'external', base_url: ADDRESS, saved_base_url: ADDRESS } as Target;
        const { client, queryClient, wrap } = setup(createFakeClient({ lemonadeTarget: yours }));
        await render(<LemonadeTarget />, { wrapper: wrap });

        await fireEvent.press(await screen.findByTestId('advanced-use-own'));
        await screen.findByText('GAIA uses its own Lemonade Server.');
        expect(client.targetSets).toEqual([{ mode: 'gaia' }]);
        expect(screen.queryByText(t('mobileApp.server.confirm.title'))).toBeNull();
        queryClient.clear();
    });
});
