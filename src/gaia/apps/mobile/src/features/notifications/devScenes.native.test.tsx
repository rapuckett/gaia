// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NotificationsGalleryRoute from '@/app/dev/notifications';

import { glossParts } from '@webui/i18n/registry';

import { translator } from '@/i18n/useT';
import { useLocaleStore } from '@/state/locale';

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
        ['banner-chat-finished', 'GAIA finished', 'Quarterly plan'],
        ['banner-chat-needs-approval', 'GAIA needs your approval', 'Weekly report'],
    ])('%s shows the catalog headline over the chat title', async (name, headline, chat) => {
        mockState = name;
        await mount();
        expect(await screen.findByText(headline)).toBeTruthy();
        expect(screen.getByText(chat)).toBeTruthy();
    });

    it('goal-store-error lists the unreadable-goal-store notification', async () => {
        mockState = 'goal-store-error';
        await mount();
        expect(await screen.findByText("Approved goals aren't running")).toBeTruthy();
    });

    it('setup-upgrading-failed says the server update stopped, with Try again', async () => {
        mockState = 'setup-upgrading-failed';
        await mount();
        expect(await screen.findByText(/couldn.t update its local model server/)).toBeTruthy();
        expect(screen.getByText('Try again')).toBeTruthy();
    });

    it('banner-chat-failed shows the failed chat alert', async () => {
        mockState = 'banner-chat-failed';
        await mount();
        expect(await screen.findByText('GAIA hit a problem')).toBeTruthy();
        expect(screen.getByTestId('banner-chat-alert')).toBeTruthy();
    });

    it('banner-chat-finished headline is Arabic in the Arabic UI', async () => {
        useLocaleStore.getState().setLocale('ar');
        try {
            mockState = 'banner-chat-finished';
            await mount();
            expect(await screen.findByText(/انتهى GAIA/)).toBeTruthy();
            expect(screen.queryByText('GAIA finished')).toBeNull();
        } finally {
            useLocaleStore.getState().setLocale(null);
        }
    });

    it.each([
        ['schedule-failed', 'schedules.failed', 'Weekly backup'],
        ['schedule-finished', 'schedules.finished', 'Morning summary'],
    ] as const)('%s builds its title with the live translator in Arabic', async (name, key, task) => {
        useLocaleStore.getState().setLocale('ar');
        try {
            mockState = name;
            await mount();
            // The title is larger now, so its English gloss sits on its own line below the Arabic.
            const head = glossParts(translator('ar')(key, { name: task }))!.find((part) => !part.gloss)!.text.trim();
            expect(await screen.findByText(head, { exact: false })).toBeTruthy();
        } finally {
            useLocaleStore.getState().setLocale(null);
        }
    });

    it('names an unknown scene and lists the known ones', async () => {
        mockState = 'nope';
        await mount();
        expect(screen.getByText('No notifications scene "nope"')).toBeTruthy();
        expect(screen.getByText('mixed')).toBeTruthy();
    });
});
