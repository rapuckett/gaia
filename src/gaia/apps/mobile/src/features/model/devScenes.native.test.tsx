// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ModelServerGalleryRoute from '@/app/dev/model-server';

import { MODEL_SCENES } from './devScenes';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockState: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    usePathname: () => '/dev/model-server',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = () =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ModelServerGalleryRoute />
        </SafeAreaProvider>,
    );

describeNative('/dev/model-server', () => {
    it.each(Object.keys(MODEL_SCENES))('renders the %s scene', async (name) => {
        mockState = name;
        await mount();
        expect(screen.queryByText(/^No model-server scene/)).toBeNull();
    });

    it('names an unknown scene and lists the known ones', async () => {
        mockState = 'nope';
        await mount();
        expect(screen.getByText('No model-server scene "nope"', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByText('need-chat', { includeHiddenElements: true })).toBeTruthy();
    });
});
