// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
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

    it.each([
        ['model-key-disconnected', 'Reconnect'],
        ['model-search-empty', 'No models match.'],
        ['model-local-empty', /No models yet\./],
        ['model-available', 'Available to download'],
        ['model-fireworks', /Show all models/],
        ['model-unavailable', 'Not available on your PC'],
        ['model-downloading', /Downloading Qwen3\.6 35B A3B|42%/],
        ['model-switching', /My tuned model/],
        ['model-custom', 'Remove'],
        ['model-npu-not-ready', /NPU/],
        ['spend-total', 'Cloud spending this month'],
        ['spend-near-limit', /Close to your limit/],
        ['spend-over-limit', /You.ve reached your limit/],
    ])('%s shows its key text', async (name, text) => {
        mockState = name;
        await mount();
        expect((await screen.findAllByText(text, { includeHiddenElements: true })).length).toBeGreaterThan(0);
    });

    it('model-custom hides Remove for the model in use', async () => {
        mockState = 'model-custom';
        await mount();
        expect(await screen.findByTestId('model-remove-user.my-tuned-GGUF', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.queryByTestId('model-remove-user.in-use-GGUF', { includeHiddenElements: true })).toBeNull();
    });

    it('model-hf-added opens on the success notice with no typing', async () => {
        mockState = 'model-hf-added';
        await mount();
        expect(await screen.findByText(/Added .*Demo Chat.*Choose Download/, undefined, { timeout: 3000 })).toBeTruthy();
    });
});
