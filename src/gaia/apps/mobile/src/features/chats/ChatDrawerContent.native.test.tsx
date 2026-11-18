// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AX_FONT_SCALE, atFontScale } from '@/test-support/fontScale';
import { ThemeProvider } from '@/ui';

import { ChatDrawerContent } from './ChatDrawerContent';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>{children}</ThemeProvider>
        </SafeAreaProvider>
    </QueryClientProvider>
);

afterEach(() => jest.restoreAllMocks());

describeNative('the drawer at AX5', () => {
    it('caps its navigation labels and the search field at 2x', async () => {
        atFontScale(AX_FONT_SCALE);
        await render(<ChatDrawerContent onSelect={() => {}} onClose={() => {}} onNewChat={() => {}} routeNames={['connectors']} />, { wrapper: wrap });
        expect(screen.getByText('New chat').props.maxFontSizeMultiplier).toBe(2);
        expect(screen.getByText('Connectors').props.maxFontSizeMultiplier).toBe(2);
        expect(screen.getByLabelText('Search chats').props.maxFontSizeMultiplier).toBe(2);
    });
});

describeNative('the drawer header', () => {
    it('shows the close button only when there is something to close', async () => {
        const view = await render(<ChatDrawerContent onSelect={() => {}} onClose={() => {}} routeNames={[]} />, { wrapper: wrap });
        expect(screen.getByLabelText('Collapse sidebar')).toBeTruthy();
        view.unmount();
        await render(<ChatDrawerContent onSelect={() => {}} routeNames={[]} />, { wrapper: wrap });
        expect(screen.queryByLabelText('Collapse sidebar')).toBeNull();
    });
});
