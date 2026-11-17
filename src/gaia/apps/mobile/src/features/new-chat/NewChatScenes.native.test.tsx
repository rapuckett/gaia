// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NewChatScenes, type NewChatScene } from './NewChatScenes';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-router', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    usePathname: () => '/dev/composer',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = (state: NewChatScene) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <NewChatScenes state={state} />
        </SafeAreaProvider>,
    );

describeNative('/dev/composer new-chat scenes', () => {
    it('create-failed keeps the draft and shows the failure notice after Send', async () => {
        await mount('create-failed');
        await fireEvent.press(await screen.findByTestId('composer-send'));
        expect((await screen.findAllByText(/reach GAIA on your PC/)).length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('Draft a status update for the team')).toBeTruthy();
    });

    it('skill-prompt lands the Try it prompt under the unsent draft', async () => {
        await mount('skill-prompt');
        await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('Compare these two quotes\n\nLoad the summarize skill, then tell me briefly what it lets you do.'));
    });
});
