// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DOCUMENTS_SCENES } from './devScenes';

import DocumentsGalleryRoute from '@/app/dev/documents';

let mockState: string | undefined;
jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ push: jest.fn() }),
    Redirect: () => null,
}));
jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('@/ui', () => {
    const actual = jest.requireActual('@/ui');
    return { ...actual, UIProvider: actual.ThemeProvider };
});
jest.mock('@/features/dev/devGallery', () => ({ devGalleryEnabled: () => true }));

const mount = async (state: string) => {
    mockState = state;
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <DocumentsGalleryRoute />
        </SafeAreaProvider>,
    );
};

// The component test renderer can't mount react-native-web's DOM.
(Platform.OS === 'web' ? describe.skip : describe)('documents gallery', () => {
    it.each(Object.keys(DOCUMENTS_SCENES))('renders the %s scene', async (name) => {
        await mount(name);
        expect(screen.queryByText(/^No documents scene/)).toBeNull();
        expect((await screen.findAllByText(/Add documents|Couldn.t load your documents/, {}, { timeout: 3000 })).length).toBeGreaterThan(0);
    });

    it('names the scenes when the state is unknown', async () => {
        await mount('nope');
        expect(screen.getByText('No documents scene "nope"')).toBeTruthy();
        expect(screen.getByText('library')).toBeTruthy();
    });
});
