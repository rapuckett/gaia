// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { sheetStore } from '@/ui/overlays/sheetStore';

import { SETUP_SCENES } from './devScenes';
import { SetupSceneView } from './SetupSceneView';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
// The real provider waits on font files the test environment doesn't have.
jest.mock('@/ui', () => {
    const actual = jest.requireActual('@/ui');
    const { createElement } = jest.requireActual('react');
    return { ...actual, UIProvider: ({ children }: { children: unknown }) => createElement(actual.ThemeProvider, null, createElement(actual.SheetScope, null, children)) };
});

// Each new scene key and a line only its state shows (English, from the web UI's catalog).
const NEW_SCENES: Record<string, string> = {
    'chip/failed': 'A download failed',
    'chip/moving': 'Downloading 2 of 2 · 36%',
    'confirm/low-disk': 'Change models',
    'confirm/no-fit-many': 'Download them anyway?',
    'confirm/no-fit-one': 'Download it anyway?',
    'confirm/server-low-disk': 'Download anyway',
    'confirm/server-no-fit': 'Use it anyway',
    'download/finish': 'Finish setup',
    'download/finish-cancelled': 'Finish setup',
    'download/lost': 'Lost contact with GAIA',
    'download/verify-failed': 'Retry deletes it and downloads it again.',
    'gate/again': 'Back to GAIA',
    'gate/check': 'Step 1 of 5',
    'gate/download': 'Step 3 of 5',
    'gate/interrupted': 'Setup stopped when GAIA restarted',
    'gate/locked': 'Setup is running. To change this, cancel it or wait until it finishes.',
    'gate/resume': 'Last time’s download didn’t finish.',
};

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        {children}
    </SafeAreaProvider>
);

// react-native-web’s DOM can't be mounted by the component test renderer.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('setup gallery scenes', () => {
    // The sheet store is global: a sheet left open by one scene would queue the next scene's behind it.
    beforeEach(() => sheetStore.reset());

    it.each(Object.entries(NEW_SCENES))('%s shows its state', async (key, text) => {
        const found = SETUP_SCENES[key];
        expect(found).toBeDefined();
        await render(<SetupSceneView found={found!} />, { wrapper: wrap });
        expect((await screen.findAllByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), undefined, { timeout: 4000 })).length).toBeGreaterThan(0);
    });
});
