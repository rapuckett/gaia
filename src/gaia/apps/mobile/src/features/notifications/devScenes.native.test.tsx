// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NotificationsGalleryRoute from '@/app/dev/notifications';

import { NOTIFICATION_SCENES } from './devScenes';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockState: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    usePathname: () => '/dev/notifications',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = () =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <NotificationsGalleryRoute />
        </SafeAreaProvider>,
    );

describeNative('/dev/notifications', () => {
    it.each(Object.keys(NOTIFICATION_SCENES))('renders the %s scene', async (name) => {
        mockState = name;
        await mount();
        expect(screen.queryByText(/^No notifications scene/)).toBeNull();
    });

    it.each([
        ['banner-chat-finished', 'Morning summary finished'],
        ['banner-chat-needs-approval', 'Weekly report needs your approval'],
    ])('%s shows its own chat banner', async (name, title) => {
        mockState = name;
        await mount();
        expect(await screen.findByText(title)).toBeTruthy();
    });

    it('setup-upgrading-failed says the server update stopped, with Try again', async () => {
        mockState = 'setup-upgrading-failed';
        await mount();
        expect(await screen.findByText(/couldn.t update its local model server/)).toBeTruthy();
        expect(screen.getByText('Try again')).toBeTruthy();
    });

    it('names an unknown scene and lists the known ones', async () => {
        mockState = 'nope';
        await mount();
        expect(screen.getByText('No notifications scene "nope"')).toBeTruthy();
        expect(screen.getByText('mixed')).toBeTruthy();
    });
});
