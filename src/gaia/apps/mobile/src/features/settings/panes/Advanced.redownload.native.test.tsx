// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SystemStatus } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import Advanced from './Advanced';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('@/features/logs', () => ({ LogsCard: () => null }));

const STATUS = {
    lemonade_running: true,
    lemonade_version: '10.8',
    model_loaded: 'Gemma-4-E4B-it-GGUF',
    expected_model_loaded: true,
    context_size_sufficient: true,
    model_downloaded: true,
    default_model_name: 'Gemma-4-E4B-it-GGUF',
    disk_space_gb: 120,
    memory_available_gb: 40,
    embedding_model_loaded: true,
    download_progress: null,
} as unknown as SystemStatus;

(Platform.OS === 'web' ? describe.skip : describe)('Advanced in Arabic', () => {
    afterEach(() => useLocaleStore.getState().setLocale(null));

    it('words "Download again" with its English gloss, like the buttons beside it', async () => {
        useLocaleStore.getState().setLocale('ar');
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrap = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={createFakeClient({ status: STATUS })}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetHost>{children}</SheetHost>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<Advanced />, { wrapper: wrap });
        fireEvent.press(await screen.findByText(/More details/));
        expect(await screen.findByTestId('advanced-redownload')).toBeTruthy();
        expect(screen.getByText(/Download again/)).toBeTruthy();
        queryClient.clear();
    });
});
