// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
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

    it('hides the navigation rows while a query is typed, and brings them back when it is cleared', async () => {
        mockState = 'search-title';
        await render(<DrawerGalleryRoute />);
        expect(await screen.findByText(/chats? match/i)).toBeTruthy();
        expect(screen.queryByText('New chat')).toBeNull();
        expect(screen.queryByText('Skills')).toBeNull();
        fireEvent.changeText(screen.getByLabelText('Search chats'), '');
        expect(await screen.findByText('New chat')).toBeTruthy();
        expect(screen.getByText('Skills')).toBeTruthy();
    });

    it('lets a tap open a result and a drag put the search keyboard away', async () => {
        const scroller = (from: { parent: any }) => {
            let node = from.parent;
            while (node && node.props.keyboardDismissMode === undefined) node = node.parent;
            return node;
        };
        mockState = 'groups';
        await render(<DrawerGalleryRoute />);
        const list = scroller(await screen.findByText('Weekly planning notes'));
        expect(list.props.keyboardShouldPersistTaps).toBe('handled');
        expect(list.props.keyboardDismissMode).toBe('on-drag');
    });

    it('puts the keyboard away on a drag in the short drawer too', async () => {
        const scroller = (from: { parent: any }) => {
            let node = from.parent;
            while (node && node.props.keyboardDismissMode === undefined) node = node.parent;
            return node;
        };
        mockState = 'empty';
        await render(<DrawerGalleryRoute />);
        const scroll = scroller(await screen.findByText('New chat'));
        expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
        expect(scroll.props.keyboardDismissMode).toBe('on-drag');
    });

    it('hides the background runs behind a counted toggle', async () => {
        mockState = 'background-hidden';
        await render(<DrawerGalleryRoute />);
        expect(await screen.findByText('Show 2 background runs')).toBeTruthy();
        expect(screen.queryByText('Daily summary (scheduled)')).toBeNull();
    });

    it('lists the background runs once the toggle is on', async () => {
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

    it('keeps the download chip after a failure, as the desktop does', async () => {
        mockState = 'download-failed';
        await render(<DrawerGalleryRoute />);
        expect(await screen.findByText('A download failed')).toBeTruthy();
    });

    it('shows a failed chat list as a list-sized error with a retry', async () => {
        mockState = 'list-error';
        await render(<DrawerGalleryRoute />);
        expect(await screen.findByText('Try again')).toBeTruthy();
        expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('says one muted line, with no retry, while the setup gate already shows the PC unreachable', async () => {
        mockState = 'list-unavailable';
        await render(<DrawerGalleryRoute />);
        expect(await screen.findByText('Chats show up once your PC is reachable.')).toBeTruthy();
        expect(screen.queryByText('Try again')).toBeNull();
    });

    it('names the scenes when the state is unknown', async () => {
        mockState = 'nope';
        await render(<DrawerGalleryRoute />);
        expect(screen.getByText('No drawer scene "nope"')).toBeTruthy();
    });
});
