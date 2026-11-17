// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Message } from '@/api/client.types';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { AssistantBubble } from './AssistantBubble';
import { MessageActionsContext } from './MessageActionsContext';

afterEach(() => act(() => sheetStore.reset()));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');
const reply = (over: Partial<Message> = {}): Message => ({
    id: 2,
    session_id: 's',
    role: 'assistant',
    content: 'A plain answer.',
    created_at: '2026-11-13T14:05:09Z',
    rag_sources: null,
    ...over,
});

const show = async (message: Message, { latest = true, busy = false } = {}) => {
    const retry = jest.fn(() => Promise.resolve(true));
    await render(
        <QueryClientProvider client={new QueryClient()}>
            <ThemeProvider>
                <SheetHost>
                    <MessageActionsContext.Provider value={{ send: () => true, retry, busy }}>
                        <AssistantBubble message={message} context={{ laterTurns: 0, latest }} />
                    </MessageActionsContext.Provider>
                </SheetHost>
            </ThemeProvider>
        </QueryClientProvider>,
    );
    return retry;
};

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Try again on the latest answer', () => {
    it('shows on a plain latest answer and calls the retry with its id', async () => {
        const retry = await show(reply());
        await fireEvent.press(screen.getByLabelText(t('msg.tryAgain')));
        expect(retry).toHaveBeenCalledWith(2);
    });

    it('is not on an earlier answer', async () => {
        await show(reply(), { latest: false });
        expect(screen.queryByLabelText(t('msg.tryAgain'))).toBeNull();
    });

    it('is hidden while a turn is running', async () => {
        await show(reply(), { busy: true });
        expect(screen.queryByLabelText(t('msg.tryAgain'))).toBeNull();
    });

    it('is left to the turn tail on a failed reply, so only one Try again shows', async () => {
        await show(reply({ failed: true, content: 'Error: model not found' }));
        expect(screen.queryByLabelText(t('msg.tryAgain'))).toBeNull();
    });
});
