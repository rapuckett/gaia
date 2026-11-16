// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import DrawerGalleryRoute from '@/app/dev/drawer';

import { DRAWER_SCENES } from './devScenes';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

let mockState: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
    useNavigation: () => ({ canGoBack: () => false, goBack: jest.fn(), openDrawer: jest.fn(), toggleDrawer: jest.fn(), getParent: () => undefined }),
}));
// The real provider waits on font files the test environment doesn't have.
jest.mock('@/ui', () => {
    const actual = jest.requireActual('@/ui');
    const { SafeAreaProvider } = jest.requireActual('react-native-safe-area-context');
    const { createElement } = jest.requireActual('react');
    return {
        ...actual,
        UIProvider: ({ children }: { children: unknown }) =>
            createElement(SafeAreaProvider, { initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } } }, createElement(actual.ThemeProvider, null, children)),
    };
});
jest.mock('@/features/dev/devGallery', () => ({ devGalleryEnabled: () => true }));

// react-native-web’s DOM can't be mounted by the component test renderer.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('drawer gallery route', () => {
    it.each(Object.keys(DRAWER_SCENES))('renders %s', async (name) => {
        mockState = name;
        await render(<DrawerGalleryRoute />);
        expect((await screen.findAllByLabelText(/search/i)).length).toBeGreaterThan(0);
    });

    it('hides the background runs behind a counted toggle, then lists them when it is on', async () => {
        mockState = 'background-hidden';
        const hidden = await render(<DrawerGalleryRoute />);
        expect(await screen.findByText('Show 2 background runs')).toBeTruthy();
        expect(screen.queryByText('Daily summary (scheduled)')).toBeNull();
        hidden.unmount();
        mockState = 'background-shown';
        await render(<DrawerGalleryRoute />);
        expect(await screen.findByText('Hide background runs')).toBeTruthy();
        expect(await screen.findByText('Daily summary (scheduled)')).toBeTruthy();
        expect(screen.getByText('Eval run 42')).toBeTruthy();
    });

    it('shows the download chip from the shared download state', async () => {
        mockState = 'download-chip';
        await render(<DrawerGalleryRoute />);
        expect(await screen.findByText('Downloading 1 of 1 · 42%')).toBeTruthy();
    });

    it('names the scenes when the state is unknown', async () => {
        mockState = 'nope';
        await render(<DrawerGalleryRoute />);
        expect(screen.getByText('No drawer scene "nope"')).toBeTruthy();
    });
});
