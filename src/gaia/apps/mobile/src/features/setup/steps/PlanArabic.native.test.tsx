// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { PreflightReport, SetupPlan } from '@/api/client.types';
import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { COMMON } from '../devScenes';

import { CheckFound } from './CheckFound';
import { Contents } from './PlanStep';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const plan = COMMON.setupPlan as SetupPlan;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

beforeEach(() => useLocaleStore.getState().setLocale('ar'));
afterEach(() => useLocaleStore.getState().setLocale(null));

describeNative('setup in Arabic', () => {
    it('isolates each memory size in "x of y"', async () => {
        await render(<CheckFound plan={plan} hardware={COMMON.preflight as PreflightReport} />, { wrapper: wrap });
        const memory = screen.getAllByText(/من/).find((n) => /\u2066/.test(String(n.props.children)));
        expect(String(memory?.props.children)).toMatch(/\u2066[\d.]+ GB\u2069.*من.*\u2066[\d.]+ GB\u2069/);
    });

    it('lets the plan list description use the full row width', async () => {
        await render(<Contents plan={plan} run={null} models={[]} />, { wrapper: wrap });
        let node = screen.getAllByText(/\(/)[0].parent;
        while (node) {
            expect(StyleSheet.flatten(node.props?.style)?.flexDirection).not.toBe('row');
            node = node.parent;
        }
    });
});
