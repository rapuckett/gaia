// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import ReadAloud from './ReadAloud';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const settings = { voice: 'af_heart', speed: 100, auto: false, min_speed: 50, max_speed: 200, voices: [], available: false, unavailable_reason: 'No verified voice on macOS' };

describeNative('Settings > Read aloud on a PC that has not verified its voice', () => {
    it('shows only the note, not the controls', async () => {
        const client = createFakeClient({ speechSettings: settings });
        const wrap = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>{children}</ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<ReadAloud />, { wrapper: wrap });
        expect(await screen.findByText(t('readAloud.settings.unavailable'))).toBeTruthy();
        expect(screen.queryByTestId('read-aloud-voice')).toBeNull();
        expect(screen.queryByText('No verified voice on macOS')).toBeNull();
    });
});
