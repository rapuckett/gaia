// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import BootGalleryRoute from '@/app/dev/boot';
import SetupGalleryRoute from '@/app/dev/setup';
import { translator } from '@/i18n/useT';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const mount = (route: React.ReactElement) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            {route}
        </SafeAreaProvider>,
    );

describeNative('/dev/boot', () => {
    it.each([
        ['starting', t('startup.starting')],
        ['upgrading', t('setup.upgrading.notice')],
    ])('holds the %s wait', async (state, text) => {
        mockParams = { state };
        await mount(<BootGalleryRoute />);
        expect(await screen.findByText(text)).toBeTruthy();
    });
});

describeNative('/dev/setup ready/cards', () => {
    it('lists the task cards, including one that needs input', async () => {
        mockParams = { step: 'ready', state: 'cards' };
        await mount(<SetupGalleryRoute />);
        expect(await screen.findByText(t('setup.ready.tasks'))).toBeTruthy();
        expect(await screen.findByText('Research a topic')).toBeTruthy();
        expect(await screen.findByText('Summarize a document')).toBeTruthy();
        expect(await screen.findByText('Tidy a folder')).toBeTruthy();
    });
});
