// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaClientProvider } from '@/data';
import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { fileBrowserScene, FILE_BROWSER_START } from './devScenes';
import { FileBrowserScreen } from './FileBrowserScreen';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-image', () => ({ Image: () => null }));

(Platform.OS === 'web' ? describe.skip : describe)('Arabic breadcrumb', () => {
    afterEach(() => useLocaleStore.setState({ locale: null }));

    it('stays left to right with the root first, aligned to the UI start', async () => {
        useLocaleStore.setState({ locale: 'ar' });
        const client = fileBrowserScene('folder');
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>{children}</ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<FileBrowserScreen chatId="chat-1" onClose={() => {}} onAsk={() => true} initial={FILE_BROWSER_START.folder} />, { wrapper });
        const bar = (await screen.findByTestId('file-breadcrumbs')) as unknown as { props: { style: { justifyContent?: string } } };
        expect(bar.props.style.justifyContent).toBe('flex-end');
        const root = screen.getByText('Users') as unknown as { props: { style: { writingDirection?: string } } };
        expect(root.props.style.writingDirection).toBe('ltr');
    });
});
