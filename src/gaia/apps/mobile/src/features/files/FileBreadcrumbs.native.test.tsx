// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Dimensions, Platform } from 'react-native';
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

(Platform.OS === 'web' ? describe.skip : describe)('Deep breadcrumb', () => {
    it('folds the head of a long path into an ellipsis, keeps the last two folders, and keeps the up button and Show hidden chip', async () => {
        const client = fileBrowserScene('deep');
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 320, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>{children}</ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<FileBrowserScreen chatId="chat-1" onClose={() => {}} initial={FILE_BROWSER_START.deep} />, { wrapper });
        expect(await screen.findByText('2026')).toBeTruthy();
        expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
        expect(screen.getByText('…')).toBeTruthy();
        expect(screen.queryByText('Users')).toBeNull();
        expect(screen.queryByText('Projects')).toBeNull();
        expect(screen.getByTestId('file-show-hidden')).toBeTruthy();
        expect(await screen.findByLabelText('Go up')).toBeTruthy();
    });
});

(Platform.OS === 'web' ? describe.skip : describe)('Show hidden chip by window width', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={fileBrowserScene('deep')}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    const at = async (width: number) => {
        Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
        await render(<FileBrowserScreen chatId="chat-1" onClose={() => {}} initial={FILE_BROWSER_START.deep} />, { wrapper });
        return screen.findByTestId('file-show-hidden');
    };
    afterEach(() => Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } }));

    it('below 360 pt it is an eye icon only, still a checkbox labeled Show hidden', async () => {
        const chip = await at(320);
        expect(screen.queryByText('Show hidden')).toBeNull();
        expect(chip).toHaveProp('accessibilityLabel', 'Show hidden');
        expect(chip).toHaveProp('accessibilityRole', 'checkbox');
        expect(chip).not.toBeChecked();
        await fireEvent.press(chip);
        expect(screen.getByTestId('file-show-hidden')).toBeChecked();
        expect(screen.queryByText('Show hidden')).toBeNull();
    });

    it('at 360 pt and wider it shows the word, as before', async () => {
        const chip = await at(360);
        expect(screen.getByText('Show hidden')).toBeTruthy();
        expect(chip).toHaveProp('accessibilityLabel', 'Show hidden');
    });
});

(Platform.OS === 'web' ? describe.skip : describe)('Not indexable badge by window width', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={fileBrowserScene('deep')}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    const at = async (width: number) => {
        Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
        await render(<FileBrowserScreen chatId="chat-1" onClose={() => {}} initial={FILE_BROWSER_START.deep} />, { wrapper });
        await screen.findByText('holiday.mov');
    };
    afterEach(() => Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 1 } }));

    it('below 360 pt the label moves onto the meta line under the name', async () => {
        await at(320);
        expect(screen.getByText("Not indexable · This file type can't be added")).toBeTruthy();
        expect(screen.queryByLabelText('Not indexable')).toBeNull();
    });

    it('at 390 pt it stays a badge beside the name', async () => {
        await at(390);
        expect(screen.getByText("This file type can't be added")).toBeTruthy();
        expect(screen.getByLabelText('Not indexable')).toBeTruthy();
    });
});
