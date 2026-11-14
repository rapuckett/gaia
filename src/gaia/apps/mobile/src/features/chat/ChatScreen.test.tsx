// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Message, StreamEvent } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import { ThemeProvider } from '@/ui';

import { ChatScreen } from './ChatScreen';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));

const t = translator('en');
const CHAT = 'chat-1';

function message(id: number, role: 'user' | 'assistant', content: string): Message {
    return { id, session_id: CHAT, role, content, created_at: '2026-11-14T00:00:00Z', rag_sources: null };
}

function gate() {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { opened, open };
}

function mount(client: ReturnType<typeof createFakeClient>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return render(<ChatScreen sessionId={CHAT} />, { wrapper: wrap });
}

async function sendText(text: string) {
    fireEvent.changeText(await screen.findByTestId('composer-input'), text);
    fireEvent.press(screen.getByTestId('composer-send'));
}

describe('ChatScreen', () => {
    beforeEach(() => useChatStreamStore.setState({ turns: {}, resolved: {} }));

    it('streams an answer, shows the stopped note after Stop, and Continue sends the web UI text', async () => {
        const stopped = gate();
        const messages = { [CHAT]: [message(1, 'user', 'Tell a story')] };
        const client = createFakeClient({
            messages,
            replies: async function* (): AsyncGenerator<StreamEvent> {
                yield { type: 'chunk', content: 'Once upon' };
                await stopped.opened;
                yield { type: 'done', cancelled: true, message_id: 2, content: 'Once upon' };
            },
        });
        mount(client);

        await sendText('Tell a story');
        expect(await screen.findByText('Once upon')).toBeTruthy();

        fireEvent.press(screen.getByTestId('composer-stop'));
        expect(client.cancelled).toEqual([CHAT]);
        messages[CHAT]!.push(message(2, 'assistant', 'Once upon'));
        await act(async () => stopped.open());

        expect(await screen.findByText(t('msg.stopped'))).toBeTruthy();
        fireEvent.press(screen.getByTestId('continue'));
        expect(client.sent.map((s) => s.message)).toEqual(['Tell a story', t('msg.continuePrompt')]);
    });

    it('shows a failed turn as its classified text and Try again deletes the exchange and resends', async () => {
        const messages = { [CHAT]: [message(1, 'user', 'Summarize it')] };
        let attempt = 0;
        const client = createFakeClient({
            messages,
            replies: async function* (): AsyncGenerator<StreamEvent> {
                attempt += 1;
                if (attempt === 1) yield { type: 'error', content: 'Lemonade could not get response' };
                else yield { type: 'done', message_id: 3, content: 'Done.' };
            },
        });
        mount(client);

        await sendText('Summarize it');
        expect(await screen.findByText(t('chatError.modelServer'))).toBeTruthy();

        await act(async () => fireEvent.press(screen.getByTestId('try-again')));
        expect(client.deleted).toEqual([{ sessionId: CHAT, messageId: 1 }]);
        expect(client.sent.map((s) => s.message)).toEqual(['Summarize it', 'Summarize it']);
    });
});
