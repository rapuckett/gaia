// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { I18nManager, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { Switch } from './Switch';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

function nativeLayout(isRTL: boolean, swap: boolean) {
    jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ isRTL, doLeftAndRightSwapInRTL: swap, localeIdentifier: 'ar' });
}

async function offKnobSide() {
    await render(<Switch value={false} onValueChange={() => undefined} label="Show hidden" testID="sw" />, { wrapper: wrap });
    const knob = screen.getByTestId('sw').queryAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.position === 'absolute')[0];
    const style = StyleSheet.flatten(knob.props.style);
    return 'left' in style ? 'left' : 'right';
}

afterEach(() => {
    useLocaleStore.getState().setLocale(null);
    jest.restoreAllMocks();
});

describeNative('Switch off position', () => {
    it('rests at the physical left in English', async () => {
        nativeLayout(false, false);
        expect(await offKnobSide()).toBe('left');
    });

    it('rests at the physical right in Arabic on web, where left and right are not swapped', async () => {
        useLocaleStore.getState().setLocale('ar');
        nativeLayout(false, false);
        expect(await offKnobSide()).toBe('right');
    });

    it('asks for the swapped side in Arabic on native, which lands it at the UI start', async () => {
        useLocaleStore.getState().setLocale('ar');
        nativeLayout(true, true);
        expect(await offKnobSide()).toBe('left');
    });
});
