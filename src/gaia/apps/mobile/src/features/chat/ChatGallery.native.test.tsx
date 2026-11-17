// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';

import { ChatGallery, type ChatGalleryState } from './ChatGallery';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('./header', () => ({ ChatHeader: () => null }));

const t = translator('en');

async function mount(state: ChatGalleryState) {
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ChatGallery state={state} />
        </SafeAreaProvider>,
    );
}

(Platform.OS === 'web' ? describe.skip : describe)('/dev/chat question scenes', () => {
    beforeEach(() => useChatStreamStore.setState({ turns: {}, resolved: {} }));

    it('question-answered: Send answer resolves the waiting question with the typed text', async () => {
        await mount('question-answered');
        expect((await screen.findByTestId('composer-input')).props.value).toBe('Downloads');
        await fireEvent.press(await screen.findByLabelText(t('composer.sendAnswer')));
        await waitFor(() => expect(useChatStreamStore.getState().resolved.dev?.q1).toEqual({ state: 'answered', answer: 'Downloads' }));
    });

    it('question-answer-failed: the error shows and the typed text returns to the box', async () => {
        await mount('question-answer-failed');
        await fireEvent.press(await screen.findByLabelText(t('composer.sendAnswer')));
        expect(await screen.findByText(t('mobileApp.composer.answerFailedShort'))).toBeTruthy();
        await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('Downloads'));
        expect(useChatStreamStore.getState().resolved.dev?.q1).toBeUndefined();
    });
});
