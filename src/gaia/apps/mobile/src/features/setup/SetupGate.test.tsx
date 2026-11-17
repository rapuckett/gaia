// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEVELOPMENT_SCHEME } from '@/features/dev/devGallery';
import { ThemeProvider } from '@/ui';

import { reopenSetup, SetupGate } from './SetupGate';

const mockOpen = jest.fn();
let mockGate: Record<string, unknown> = { state: 'ready' };

jest.mock('@/data', () => ({
    useGaiaClient: () => ({}),
    useSetupGate: () => ({ gate: mockGate, recheck: jest.fn(), finish: jest.fn(), open: mockOpen }),
}));
jest.mock('@/features/pairing', () => ({ PinMismatchScreen: () => null, usePairAgain: () => ({ mutate: jest.fn(), isPending: false }) }));
jest.mock('./SetupScreen', () => ({ SetupScreen: () => null }));
jest.mock('./StartupScreen', () => ({ StartupScreen: () => null }));
const mockExpoConfig = { scheme: '' };
// A getter: the app's imports load expo-constants before this file's own lines run.
jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        get expoConfig() {
            return mockExpoConfig;
        },
    },
}));

describe('reopenSetup', () => {
    it('opens setup in re-run mode while the gate is mounted, and says so when it is not', async () => {
        expect(() => reopenSetup()).toThrow(/not mounted/);
        const { unmount } = await render(<SetupGate><Text>App</Text></SetupGate>, { wrapper: ThemeProvider });
        expect(screen.getByText('App')).toBeTruthy();
        reopenSetup();
        expect(mockOpen).toHaveBeenCalledTimes(1);
        await unmount();
        expect(() => reopenSetup()).toThrow(/not mounted/);
    });
});

describe('failed upgrade notice', () => {
    it('keeps the server reason in its own element, not inside the translated sentence', async () => {
        mockGate = { state: 'unknown', upgradeFailed: true, error: new Error('The download was interrupted.') };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ThemeProvider>{children}</ThemeProvider>
            </SafeAreaProvider>
        );
        await render(<SetupGate><Text>App</Text></SetupGate>, { wrapper });
        expect(screen.getByText('The download was interrupted.')).toBeTruthy();
        expect(screen.queryByText(/Details:/)).toBeNull();
        mockGate = { state: 'ready' };
    });
});

describe('a gallery build with no PC answering', () => {
    const saved = process.env.EXPO_PUBLIC_DEV_GALLERY;
    afterEach(() => {
        mockGate = { state: 'ready' };
        if (saved === undefined) delete process.env.EXPO_PUBLIC_DEV_GALLERY;
        else process.env.EXPO_PUBLIC_DEV_GALLERY = saved;
    });

    async function shows(route: string, { gallery, scheme }: { gallery: boolean; scheme: string }): Promise<boolean> {
        mockGate = { state: 'checking' };
        mockExpoConfig.scheme = scheme;
        if (gallery) process.env.EXPO_PUBLIC_DEV_GALLERY = '1';
        else delete process.env.EXPO_PUBLIC_DEV_GALLERY;
        const { unmount } = await render(<SetupGate route={route}><Text>App</Text></SetupGate>, { wrapper: ThemeProvider });
        const shown = screen.queryByText('App') !== null;
        await unmount();
        return shown;
    }

    it('opens only the /dev/* scenes, and only in a development-env build', async () => {
        expect(await shows('/dev/messages', { gallery: true, scheme: DEVELOPMENT_SCHEME })).toBe(true);
        expect(await shows('/', { gallery: true, scheme: DEVELOPMENT_SCHEME })).toBe(false);
        expect(await shows('/dev/messages', { gallery: true, scheme: 'ai.amd.gaia.mobile' })).toBe(false);
        expect(await shows('/dev/messages', { gallery: false, scheme: DEVELOPMENT_SCHEME })).toBe(false);
    });
});
