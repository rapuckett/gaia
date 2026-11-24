// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SystemStatus } from '@/api/client.types';
import { STATUS_IDLE_POLL_MS } from '@/api/constants';
import { GaiaNetworkError } from '@/api/errors';
import { createFakeClient, type FakeGaiaClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { shouldRetryQuery } from '@/data/queryRetry';
import { translator } from '@/i18n/useT';
import { useBannerDismissedStore } from '@/state/bannerDismissed';
import { ThemeProvider } from '@/ui';

import { ConnectionBanner } from './ConnectionBanner';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const failedDownload = {
    lemonade_running: true,
    context_size_sufficient: true,
    model_context_size: 65536,
    model_loaded: null,
    init_state: 'ready',
    download_progress: { state: 'error', model_name: 'Gemma-4-E4B-it-GGUF', percent: 0, file: null, file_index: 1, total_files: 1, downloaded_bytes: 0, total_bytes: 0, message: 'Not enough disk space.' },
} as unknown as SystemStatus;

const healthy = {
    lemonade_running: true,
    context_size_sufficient: true,
    model_context_size: 65536,
    model_loaded: 'Gemma-4-E4B-it-GGUF',
    init_state: 'ready',
    download_progress: null,
} as unknown as SystemStatus;

function wrapper(client: FakeGaiaClient, queryClient: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>{children}</ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
    };
}

async function advance(ms: number) {
    for (let spent = 0; spent < ms; spent += 1_000) await act(async () => void (await jest.advanceTimersByTimeAsync(1_000)));
}

describeNative('ConnectionBanner', () => {
    describe('when a PC that answered goes away', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('says the PC can\'t be reached within seconds of the first refused poll, and clears once it answers again', async () => {
            let up = true;
            let polls = 0;
            const client = createFakeClient({ status: healthy });
            client.getSystemStatus = () => {
                polls += 1;
                return up ? Promise.resolve(healthy) : Promise.reject(new GaiaNetworkError('https://pc', new Error('Connection refused')));
            };
            const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
            await render(<ConnectionBanner />, { wrapper: wrapper(client, queryClient) });
            await advance(1_000);
            expect(screen.queryByTestId('banner-unreachable')).toBeNull();

            up = false;
            // The next idle poll is the first one refused; its two retries take 1 s and 2 s.
            await advance(STATUS_IDLE_POLL_MS + 5_000);
            expect(screen.getByTestId('banner-unreachable')).toBeTruthy();
            expect(screen.getByText(t('mobileApp.pairing.off.title'))).toBeTruthy();

            up = true;
            await advance(10_000);
            expect(screen.queryByTestId('banner-unreachable')).toBeNull();

            // Back to the healthy rate once it answers, not the outage's fast one.
            const before = polls;
            await advance(2 * STATUS_IDLE_POLL_MS);
            expect(polls - before).toBe(2);
        });
    });

    it('names a failed download by its display name once the model list loads, with the PC\'s text on the detail line', async () => {
        const client = createFakeClient({
            status: failedDownload,
            providerModels: { local: { provider: 'local', models: [{ id: 'Gemma-4-E4B-it-GGUF', display_name: 'Gemma 4 E4B', context_length: null, downloaded: false, labels: [], rank: null, note: null, evidence: null, available: true }] } },
        });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        await render(<ConnectionBanner />, { wrapper: wrapper(client, queryClient) });
        expect(await screen.findByText(t('mobileApp.model.downloadFailedShort', { model: '\u2066Gemma 4 E4B\u2069' }))).toBeTruthy();
        expect(screen.queryByText(/Gemma-4-E4B-it-GGUF/)).toBeNull();
        expect(screen.getByText('\u2066Not enough disk space.\u2069')).toBeTruthy();
    });

    it('offers Retry on a failed download, which starts that model downloading again through the client', async () => {
        const client = createFakeClient({ status: failedDownload });
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
        await render(<ConnectionBanner />, { wrapper: wrap });
        fireEvent.press(await screen.findByText(t('docs.retry')));
        await waitFor(() => expect(client.modelDownloads).toEqual([{ modelName: 'Gemma-4-E4B-it-GGUF', force: false, loadAfter: true }]));
    });

    it('closing a failed download tells the PC to forget it, and the banner stays gone after a remount', async () => {
        const client = createFakeClient({ status: failedDownload });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const first = await render(<ConnectionBanner />, { wrapper: wrapper(client, queryClient) });
        fireEvent.press(await screen.findByLabelText(t('download.dismissFailed')));
        await waitFor(() => expect(client.dismissedDownloads).toEqual(['Gemma-4-E4B-it-GGUF']));
        expect(screen.queryByTestId('banner-download')).toBeNull();
        first.unmount();
        useBannerDismissedStore.setState({ dismissed: null });
        await waitFor(() => expect(client.dismissedDownloads).toHaveLength(1));
        await render(<ConnectionBanner />, { wrapper: wrapper(client, queryClient) });
        expect(screen.queryByTestId('banner-download')).toBeNull();
    });

    describe('when the model server is down', () => {
        const down = (patch: Partial<SystemStatus>) => ({ lemonade_running: false, context_size_sufficient: true, init_state: 'ready', download_progress: null, ...patch }) as unknown as SystemStatus;
        const mount = async (status: SystemStatus, ui = <ConnectionBanner />) => {
            const client = createFakeClient({ status });
            await render(ui, { wrapper: wrapper(client, new QueryClient({ defaultOptions: { queries: { retry: false } } })) });
        };

        it('is one card with one Check again and no Open setup once setup is done', async () => {
            await mount(down({ start_command: null, start_instruction: null }));
            expect(await screen.findByTestId('banner-serverStopped')).toBeTruthy();
            expect(screen.getAllByText(t('settings.key.checkAgain'))).toHaveLength(1);
            expect(screen.queryByText(t('setup.serverDown.setup'))).toBeNull();
        });

        it('puts Open setup inside the same card while setup is not done', async () => {
            await mount(down({ start_command: null, start_instruction: 'Run gaia init to install the model server.' }));
            const card = await screen.findByTestId('banner-serverStopped');
            expect(within(card).getByText(t('setup.serverDown.setup'))).toBeTruthy();
            expect(within(card).getAllByText(t('settings.key.checkAgain'))).toHaveLength(1);
        });

        it('shows nothing above a Settings screen', async () => {
            await mount(down({ start_command: null, start_instruction: null }), <ConnectionBanner hideServerDown />);
            await act(async () => undefined);
            expect(screen.queryByTestId('banner-serverStopped')).toBeNull();
            expect(screen.queryByText(t('banner.serverStopped'))).toBeNull();
        });
    });
});
