// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsGalleryRoute from '@/app/dev/settings';

import { SETTINGS_SCENES } from './devScenes';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockState: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    usePathname: () => '/dev/settings',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = () =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <SettingsGalleryRoute />
        </SafeAreaProvider>,
    );

describeNative('/dev/settings', () => {
    it.each(Object.keys(SETTINGS_SCENES))('renders the %s scene', async (name) => {
        mockState = name;
        await mount();
        expect(screen.queryByText(/^No settings scene/)).toBeNull();
    });

    it.each([
        ['gpu-adjustable', 'gpu-memory'],
        ['gpu-adjustable-setup', 'setup-gpu'],
        ['gpu-read-error', 'gpu-memory'],
        ['gpu-read-error-setup', 'setup-gpu'],
    ])('shows the GPU row in %s', async (name, testID) => {
        mockState = name;
        await mount();
        expect(await screen.findByTestId(testID)).toBeTruthy();
    });
});
