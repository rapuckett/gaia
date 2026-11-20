// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { GPU } from '@/features/setup/devScenes';
import { ThemeProvider } from '@/ui';

import { GpuMemory } from './GpuMemory';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('GpuMemory', () => {
    it('shows the GPU and CPU legends as separate Text nodes so each keeps its own direction', async () => {
        const client = createFakeClient({ gpuMemory: GPU });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        await render(
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider><GpuMemory /></ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        await fireEvent.press(await screen.findByTestId('gpu-memory-toggle'));
        const row = await screen.findByTestId('gpu-memory-split');
        expect(within(row).getByText(/^GPU .*16.*$/)).toBeTruthy();
        expect(within(row).getByText(/^CPU .*112.*$/)).toBeTruthy();
        expect(within(row).getByText('·')).toBeTruthy();
        queryClient.clear();
    });
});
