// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { ThemeProvider } from '@/ui';
import { contentWidth } from '@/ui/tokens/space';

import { HomeScreen } from './HomeScreen';

jest.mock('@/features/nav/ScreenHeader', () => {
    const { createElement } = jest.requireActual('react');
    return { ScreenHeader: () => createElement('View', { testID: 'screen-header' }) };
});

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

describeNative('HomeScreen', () => {
    afterEach(() => {
        useConnectionStore.setState({ connection: null, restored: true });
    });

    it('unpaired shows the not-connected line alone, at flow width', async () => {
        useConnectionStore.setState({ connection: null, restored: true });
        await render(<HomeScreen />, { wrapper: wrap });
        expect(screen.getByText(t('mobileApp.notConnected'))).toBeTruthy();
        expect(screen.queryByTestId('screen-header')).toBeNull();
        expect(screen.getByTestId('screen-content').props.dataSet).toEqual({ contentWidth: String(contentWidth.flow) });
    });

    it('connected renders the screen header', async () => {
        useConnectionStore.setState({ connection: { baseUrl: 'https://192.168.1.20:4243' }, restored: true });
        await render(<HomeScreen />, { wrapper: wrap });
        expect(screen.getByTestId('screen-header')).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.notConnected'))).toBeNull();
    });
});
