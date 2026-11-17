// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import type { SetupStepContext } from '../SetupScreen';
import { ModelsScreen } from './ModelsScreen';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('ModelsScreen', () => {
    it("keeps the PC's reason off the model-list sentence and shows it left to right below", async () => {
        const client = createFakeClient({});
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
        await render(<ModelsScreen ctx={{ locked: false } as unknown as SetupStepContext} close={() => undefined} />, { wrapper: wrap });
        const sentence = await screen.findByText('Couldn’t read the model list from the model server.');
        expect(sentence.props.children).not.toContain('no setup plan');
        expect(StyleSheet.flatten(screen.getByText(/no setup plan/).props.style)).toMatchObject({ writingDirection: 'ltr' });
    });
});
