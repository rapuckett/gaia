// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError, GaiaAuthError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import { PairedPcsScreen } from './PairedPcsScreen';
import { setPairingService } from './registry';
import type { PairedPc, PairingService } from './service';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-router', () => ({
    useNavigation: () => ({ openDrawer: jest.fn(), goBack: jest.fn(), canGoBack: () => false }),
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = translator('en');

// Two PCs with the same name on the same host: only their ids and ports differ.
function pc(id: string, port: number): PairedPc {
    const origin = `https://192.168.1.20:${port}`;
    return { id, name: 'air', connection: { baseUrl: origin, pcId: id, pinned: true, origins: [origin], routes: [{ kind: 'home', origin }] } };
}
const FIRST = pc('a1'.repeat(16), 4243);
const SECOND = pc('b2'.repeat(16), 4245);

describeNative('Your PCs with two PCs of the same name on one host', () => {
    afterEach(() => {
        setPairingService(null);
        useConnectionStore.getState().clearConnection();
    });

    it('lists both after the second is paired, marks the one in use, and switches back to the first', async () => {
        let pcs = [FIRST];
        const use = jest.fn(async (id: string) => {
            useConnectionStore.getState().setConnection(pcs.find((p) => p.id === id)!.connection);
        });
        setPairingService({ list: async () => pcs, use } as unknown as PairingService);
        useConnectionStore.getState().setConnection(FIRST.connection);

        await render(
            <SafeAreaProvider initialMetrics={METRICS}>
                <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                    <GaiaClientProvider client={createFakeClient()}>
                        <UIProvider>
                            <ScreenBannerProvider banner={null}>
                                <PairedPcsScreen onAdd={() => undefined} />
                            </ScreenBannerProvider>
                        </UIProvider>
                    </GaiaClientProvider>
                </QueryClientProvider>
            </SafeAreaProvider>,
        );
        expect(await screen.findByText(t('mobileApp.pairing.pcs.inUse'))).toBeTruthy();

        // What PairingFlow does once the second PC allows this phone; the screen stays mounted in the drawer.
        pcs = [FIRST, SECOND];
        await act(async () => useConnectionStore.getState().setConnection(SECOND.connection));

        await waitFor(() => expect(screen.getAllByText('air')).toHaveLength(2));
        expect(screen.getAllByText(t('mobileApp.pairing.pcs.inUse'))).toHaveLength(1);
        expect(screen.getByText(t('mobileApp.pairing.route.home'))).toBeTruthy();
        expect(screen.queryByTestId(`pc-row-${SECOND.id}-use`)).toBeNull();

        await act(async () => fireEvent.press(screen.getByTestId(`pc-row-${FIRST.id}-use`)));
        await waitFor(() => expect(screen.getByTestId(`pc-row-${SECOND.id}-use`)).toBeTruthy());
        expect(use).toHaveBeenCalledWith(FIRST.id);
        expect(useConnectionStore.getState().connection).toMatchObject({ pcId: FIRST.id, baseUrl: FIRST.connection.baseUrl });
        expect(screen.queryByTestId(`pc-row-${FIRST.id}-use`)).toBeNull();
    });
});

describeNative('Your PCs when listing fails', () => {
    afterEach(() => setPairingService(null));

    it("keeps the PC's text out of the sentence and on a left-to-right detail line", async () => {
        setPairingService({ list: async () => Promise.reject(new GaiaApiError(500, 'disk full on the PC')) } as unknown as PairingService);
        await render(
            <SafeAreaProvider initialMetrics={METRICS}>
                <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                    <GaiaClientProvider client={createFakeClient()}>
                        <UIProvider>
                            <ScreenBannerProvider banner={null}>
                                <PairedPcsScreen onAdd={() => undefined} />
                            </ScreenBannerProvider>
                        </UIProvider>
                    </GaiaClientProvider>
                </QueryClientProvider>
            </SafeAreaProvider>,
        );
        expect(await screen.findByText(t('mobileApp.error.httpNoDetail'))).toBeTruthy();
        const detail = screen.getByText('disk full on the PC') as unknown as { props: { style: { writingDirection?: string } } };
        expect(detail.props.style.writingDirection).toBe('ltr');
    });

    it("keeps the PC's text out of a pairing-refused sentence too", async () => {
        setPairingService({ list: async () => Promise.reject(new GaiaAuthError('token revoked by the PC')) } as unknown as PairingService);
        await render(
            <SafeAreaProvider initialMetrics={METRICS}>
                <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                    <GaiaClientProvider client={createFakeClient()}>
                        <UIProvider>
                            <ScreenBannerProvider banner={null}>
                                <PairedPcsScreen onAdd={() => undefined} />
                            </ScreenBannerProvider>
                        </UIProvider>
                    </GaiaClientProvider>
                </QueryClientProvider>
            </SafeAreaProvider>,
        );
        expect(await screen.findByText(t('mobileApp.error.authNoDetail'))).toBeTruthy();
        const detail = screen.getByText('token revoked by the PC') as unknown as { props: { style: { writingDirection?: string } } };
        expect(detail.props.style.writingDirection).toBe('ltr');
    });
});
