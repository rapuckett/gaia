// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEVELOPMENT_SCHEME } from '@/features/dev/devGallery';
import { translator } from '@/i18n/useT';
import { ThemeProvider, useScreenBanner } from '@/ui';
import { contentWidth } from '@/ui/tokens/space';

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

/** Stands in for a `Screen`: the gate's notice reaches the app through the banner context. */
const Pane = () => {
    const banner = useScreenBanner();
    return (
        <View testID="pane">
            <Text>App</Text>
            <View testID="pane-banner">{banner}</View>
        </View>
    );
};

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
        await render(<SetupGate><Pane /></SetupGate>, { wrapper });
        expect(screen.getByText('The download was interrupted.')).toBeTruthy();
        expect(screen.queryByText(/Details:/)).toBeNull();
        mockGate = { state: 'ready' };
    });
});

describe('a gallery build with no PC answering', () => {
    const saved = process.env.EXPO_PUBLIC_DEV_GALLERY;
    const savedDev = __DEV__;
    // Jest runs with __DEV__ on, which opens the gallery on its own; these cases are about a built app.
    beforeEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    });
    afterEach(() => {
        (globalThis as unknown as { __DEV__: boolean }).__DEV__ = savedDev;
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
        expect(await shows('/dev/messages', { gallery: false, scheme: DEVELOPMENT_SCHEME })).toBe(false);
    });

    it('opens a production web export made with the flag, but never a production native build', async () => {
        expect(await shows('/dev/messages', { gallery: true, scheme: 'ai.amd.gaia.mobile' })).toBe(Platform.OS === 'web');
        expect(await shows('/', { gallery: true, scheme: 'ai.amd.gaia.mobile' })).toBe(false);
    });
});

describe('app under a notice', () => {
    it('shows the notice through the banner context, never in a wrapper above or around the navigator', async () => {
        mockGate = { state: 'serverDown' };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 1158, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ThemeProvider>{children}</ThemeProvider>
            </SafeAreaProvider>
        );
        await render(<SetupGate><Pane /></SetupGate>, { wrapper });
        const capped = (node: ReturnType<typeof screen.getByTestId>) => {
            for (let n: typeof node | null = node; n; n = n.parent) if (StyleSheet.flatten(n.props.style)?.maxWidth === contentWidth.reading) return true;
            return false;
        };
        const inside = (node: ReturnType<typeof screen.getByTestId>, testID: string) => {
            for (let n: typeof node | null = node; n; n = n.parent) if (n.props.testID === testID) return true;
            return false;
        };
        expect(capped(screen.getByTestId('pane'))).toBe(false);
        const retry = screen.getByText(translator('en')('setup.serverDown.setup'));
        expect(inside(retry, 'pane-banner')).toBe(true);
        expect(screen.queryByTestId('setup-gate-notice')).toBeNull();
        mockGate = { state: 'ready' };
    });

    it('keeps the app mounted while the gate goes from a notice to ready', async () => {
        let mounts = 0;
        const Counted = () => {
            useEffect(() => {
                mounts += 1;
            }, []);
            return <Pane />;
        };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 1158, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                <ThemeProvider>{children}</ThemeProvider>
            </SafeAreaProvider>
        );
        mockGate = { state: 'serverDown' };
        const view = await render(<SetupGate><Counted /></SetupGate>, { wrapper });
        mockGate = { state: 'ready' };
        await view.rerender(<SetupGate><Counted /></SetupGate>);
        mockGate = { state: 'serverDown' };
        await view.rerender(<SetupGate><Counted /></SetupGate>);
        expect(mounts).toBe(1);
        mockGate = { state: 'ready' };
    });
});

describe('first-run setup', () => {
    it.each(['checking', 'upgrading', 'needed', 'addingLocal'])('replaces the app, and so its sidebar and menu, while the gate is %s', async (state) => {
        mockGate = { state };
        await render(<SetupGate><Text>App</Text></SetupGate>, { wrapper: ThemeProvider });
        expect(screen.queryByText('App')).toBeNull();
        mockGate = { state: 'ready' };
    });
});
