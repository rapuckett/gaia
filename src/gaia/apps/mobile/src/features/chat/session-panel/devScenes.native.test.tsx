// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UIProvider } from '@/ui';

import { SessionPanelGallery, type SessionPanelGalleryState } from './SessionPanelGallery';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), usePathname: () => '/dev/messages' }));

const mount = (state: SessionPanelGalleryState) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <UIProvider>
                <SessionPanelGallery state={state} />
            </UIProvider>
        </SafeAreaProvider>,
    );

(Platform.OS === 'web' ? describe.skip : describe)('/dev/messages panel changes scenes', () => {
    it('chgReview opens the review sheet that chgList leaves closed', async () => {
        await mount('chgReview');
        expect(await screen.findByText("Review this chat's changes")).toBeTruthy();
    });

    it('chgList shows the list without the review sheet', async () => {
        await mount('chgList');
        await screen.findByTestId('changes-body');
        expect(screen.queryByText("Review this chat's changes")).toBeNull();
    });

    it('runsOnCpp says it runs on gaiacpp, with no folder error', async () => {
        await mount('runsOnCpp');
        expect((await screen.findAllByText(/gaiacpp/)).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Session not found/)).toBeNull();
    });
});
