// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { LemonadeFound, LemonadeTarget } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { CheckOffer } from './CheckOffer';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const FOUND = { url: 'http://localhost:13305/api/v1', version: '2026.44.1', minimum: '10.7.0', status: 'needs_key', message: '' } as LemonadeFound;
const TARGET = { mode: 'gaia', source: 'gaia', base_url: null, saved_base_url: null, api_key_stored: false, gaia_installed: true, offer: true } as unknown as LemonadeTarget;
const KEY = 'lemonade-key-7b3d';

function mount() {
    const client = createFakeClient({ lemonadeTarget: TARGET });
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

describeNative('Setup: use the existing model server', () => {
    afterEach(() => act(() => sheetStore.reset()));

    it('GAIA’s own is picked at first, and Continue sends it with no sheet and no confirm', async () => {
        const { client, queryClient, wrap } = mount();
        await render(<CheckOffer state={{ kind: 'offer', found: FOUND, needsKey: true }} />, { wrapper: wrap });

        expect(screen.getByRole('radio', { name: new RegExp(t('setup.offer.useOwn')), checked: true })).toBeTruthy();
        await fireEvent.press(screen.getByTestId('offer-continue'));
        await act(async () => undefined);
        expect(client.targetSets).toEqual([{ mode: 'gaia' }]);
        expect(screen.queryByText(t('mobileApp.server.confirm.title'))).toBeNull();
        queryClient.clear();
    });

    it('"Use the one I have" waits for its key, asks on a sheet, and only the sheet sends the key, confirmed', async () => {
        const { client, queryClient, wrap } = mount();
        await render(<CheckOffer state={{ kind: 'offer', found: FOUND, needsKey: true }} />, { wrapper: wrap });

        await fireEvent.press(screen.getByTestId('offer-external'));
        expect(screen.getByTestId('offer-continue')).toBeDisabled();
        await fireEvent.changeText(screen.getByTestId('offer-key'), KEY);
        await fireEvent.press(screen.getByTestId('offer-continue'));

        expect(await screen.findByText(t('mobileApp.server.confirm.title'))).toBeTruthy();
        expect(client.targetSets).toEqual([]);

        await fireEvent.press(screen.getByTestId('own-server-confirm'));
        await act(async () => undefined);
        expect(client.targetSets).toEqual([{ mode: 'external', base_url: FOUND.url, api_key: KEY, confirm: true }]);
        queryClient.clear();
    });
});
