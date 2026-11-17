// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, render, screen } from '@testing-library/react-native';
import { Dimensions, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useConnectionStore } from '@/state/connection';
import { ThemeProvider } from '@/ui';

import { AppNavigator } from './AppNavigator';

let mockPath = '/';
let mockGallery = false;

jest.mock('expo-router', () => ({
    Slot: () => {
        const { ScreenHeader } = jest.requireActual('./ScreenHeader');
        return <ScreenHeader title="Home" />;
    },
    useNavigation: () => ({ openDrawer: jest.fn() }),
    usePathname: () => mockPath,
}));
jest.mock('expo-router/drawer', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text: RNText } = require('react-native');
    const Drawer = function Drawer() {
        return <RNText>drawer</RNText>;
    };
    Drawer.Screen = function Screen() {
        return null;
    };
    return { Drawer, useDrawerStatus: () => 'closed' };
});
jest.mock('@/features/dev/devGallery', () => ({ galleryBuild: () => mockGallery }));
jest.mock('./AppDrawer', () => ({ AppDrawer: () => null }));

function mount(width = 390) {
    Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
    return render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <AppNavigator />
            </ThemeProvider>
        </SafeAreaProvider>,
    );
}

const PC = { baseUrl: 'https://pc.local:4243' };

// Dimensions can't be set in a browser, as in the other layout tests.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('AppNavigator', () => {
    afterEach(() => {
        mockPath = '/';
        mockGallery = false;
        useConnectionStore.setState({ connection: null });
    });

    it.each([390, 1024])('draws no drawer and no menu button at %i wide while no PC is paired', async (width) => {
        await mount(width);
        expect(screen.getByText('Home')).toBeTruthy();
        expect(screen.queryByText('drawer')).toBeNull();
        expect(screen.queryByLabelText('Open sidebar')).toBeNull();
    });

    it('draws the drawer once a PC is paired', async () => {
        useConnectionStore.setState({ connection: PC });
        await mount();
        expect(screen.getByText('drawer')).toBeTruthy();
    });

    it('removes the drawer when the last PC is unpaired', async () => {
        useConnectionStore.setState({ connection: PC });
        await mount();
        await act(async () => useConnectionStore.getState().clearConnection());
        expect(screen.queryByText('drawer')).toBeNull();
        expect(screen.getByText('Home')).toBeTruthy();
    });

    it('keeps the drawer for a gallery build scene with no PC', async () => {
        mockGallery = true;
        mockPath = '/dev/messages';
        await mount();
        expect(screen.getByText('drawer')).toBeTruthy();
    });
});
