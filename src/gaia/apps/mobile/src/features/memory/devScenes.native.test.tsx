// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MemoryGalleryRoute from '@/app/dev/memory-gallery';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockScene: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ scene: mockScene }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const mount = () =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <MemoryGalleryRoute />
        </SafeAreaProvider>,
    );

(Platform.OS === 'web' ? describe.skip : describe)('/dev/memory-gallery stats scenes', () => {
    it('failed opens on the tab that shows the load-failed state', async () => {
        mockScene = 'failed';
        await mount();
        expect(await screen.findByText('Failed to load memory data. Is the backend running?')).toBeTruthy();
    });

    it('failed keeps the PC\'s reason off the sentence and shows it on its own line', async () => {
        mockScene = 'failed';
        await mount();
        expect(await screen.findByText('The backend is not running')).toBeTruthy();
        expect(screen.queryByText(/\(503\).*The backend is not running/)).toBeNull();
    });

    it('loading shows no load-failed state', async () => {
        mockScene = 'loading';
        await mount();
        await screen.findByTestId('memory-tab-advanced');
        expect(screen.queryByTestId('memory-pane-advanced')).toBeNull();
        expect(screen.queryByText('Failed to load memory data. Is the backend running?')).toBeNull();
    });

    it('discoveryOff leaves discovery consent off, so its switch opens the consent dialog', async () => {
        mockScene = 'discoveryOff';
        await mount();
        fireEvent.press(await screen.findByTestId('memory-switch-discovery'));
        expect(await screen.findByText('Enable System Discovery?')).toBeTruthy();
    });
});
