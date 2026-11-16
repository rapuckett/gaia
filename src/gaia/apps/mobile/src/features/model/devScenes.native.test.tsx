// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ModelServerGalleryRoute from '@/app/dev/model-server';

import { tEn } from '@webui/i18n/translator';

import { useModelNeededStore } from '@/state/modelNeeded';
import { sheetStore } from '@/ui/overlays/sheetStore';

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
    // Sheets queue in a global store, so one scene's sheet would otherwise show over the next.
    beforeEach(() => sheetStore.reset());

    it.each(Object.keys(MODEL_SCENES))('renders the %s scene', async (name) => {
        mockState = name;
        await mount();
        expect(screen.queryByText(/^No model-server scene/)).toBeNull();
    });

    it.each([
        ['need-chat', null],
        ['need-downloading', tEn('modelNeeded.dialog')],
        ['need-starting', 'Starting the download'],
        ['need-failed', 'The download stopped.'],
    ])('the %s scene shows its seeded state', async (name, text) => {
        mockState = name;
        await mount();
        const opts = { includeHiddenElements: true };
        await screen.findByText('Chatting needs a model', opts);
        // The app's own host reads this store, and its sheet would queue ahead of the scene's.
        expect(useModelNeededStore.getState().need).toBeNull();
        const started = screen.queryByText(/Starting the download/, opts);
        const failed = screen.queryByText(/The download stopped\./, opts);
        const progress = screen.queryByRole('progressbar', opts);
        if (!text) {
            expect([started, failed, progress]).toEqual([null, null, null]);
        } else if (name === 'need-downloading') {
            expect(progress?.props.accessibilityValue.now).toBe(42);
            expect(progress?.props.accessibilityLabel).toBe(text);
        } else if (name === 'need-starting') {
            expect(started).not.toBeNull();
        } else {
            expect(failed).not.toBeNull();
            expect(screen.getByText('Try again', opts)).toBeTruthy();
        }
    });

    it('names an unknown scene and lists the known ones', async () => {
        mockState = 'nope';
        await mount();
        expect(screen.getByText('No model-server scene "nope"', { includeHiddenElements: true })).toBeTruthy();
        expect(screen.getByText('need-chat', { includeHiddenElements: true })).toBeTruthy();
    });

    it('the restore-ok scene holds its notice past the 6 s the app shows it for', async () => {
        mockState = 'restore-ok';
        await mount();
        const msg = 'Restored your saved model, Gemma 4 E4B.';
        await screen.findByText(msg);
        await new Promise((resolve) => setTimeout(resolve, 6500));
        expect(screen.getByText(msg)).toBeTruthy();
    }, 15000);
});
