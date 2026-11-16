// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SystemStatus } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
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

describeNative('ConnectionBanner', () => {
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
});
