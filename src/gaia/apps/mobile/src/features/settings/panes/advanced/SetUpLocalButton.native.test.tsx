// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

import { SetUpLocalButton } from './SetUpLocalButton';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
const replace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace }) }));
const reopenSetup = jest.fn();
jest.mock('@/features/setup/SetupGate', () => ({ reopenSetup: () => reopenSetup() }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Set up local models', () => {
    it('leaves Settings and reopens setup', () => {
        render(
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ThemeProvider>
                    <SetUpLocalButton />
                </ThemeProvider>
            </SafeAreaProvider>,
        );
        fireEvent.press(screen.getByTestId('advanced-set-up-local'));
        expect(replace).toHaveBeenCalledWith('/');
        expect(reopenSetup).toHaveBeenCalledTimes(1);
    });
});
