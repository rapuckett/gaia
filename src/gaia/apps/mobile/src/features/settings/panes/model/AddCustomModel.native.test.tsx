// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { CustomModelReport } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { AddCustomModel, SeedCustomReport } from './AddCustomModel';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const URL_ = 'https://huggingface.co/amd/Demo-Chat-GGUF';
const REPORT: CustomModelReport = {
    url: URL_, ok: true, error: null, display_name: 'Demo Chat', model_id: 'user.Demo-Chat-GGUF', size_gb: 3.4, file: 'Demo-Chat-Q4_K_M.gguf', quant: 'Q4_K_M',
    checks: [], warnings: [],
    variants: [
        { quant: 'Q4_K_M', file: 'Demo-Chat-Q4_K_M.gguf', size_gb: 3.4, fits: true, reason: null },
        { quant: 'Q8_0', file: 'Demo-Chat-Q8_0.gguf', size_gb: 6.1, fits: true, reason: null },
    ],
};

describeNative('Add from Hugging Face', () => {
    it('labels the quantization choice above it', async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrap = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={createFakeClient({})}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SeedCustomReport.Provider value={REPORT}>{children}</SeedCustomReport.Provider>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<AddCustomModel open onToggle={jest.fn()} onClose={jest.fn()} onAdded={jest.fn()} />, { wrapper: wrap });

        const label = screen.getByText('Quantization');
        expect(label).toBeTruthy();
        expect(screen.getByLabelText('Quantization')).toBeTruthy();
        expect(screen.getByText(/Q8_0/)).toBeTruthy();
        queryClient.clear();
    });
});
