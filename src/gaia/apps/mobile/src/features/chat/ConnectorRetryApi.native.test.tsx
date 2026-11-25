// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Message } from '@/api/client.types';
import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { useChatStreamStore } from '@/state/chatStreams';
import { createRecordingFetch, jsonResponse, streamResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ChatScreen } from './ChatScreen';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('./header', () => ({ ChatHeader: () => null }));

const BASE = 'http://192.168.1.20:4200';
const CHAT = 'chat-1';
const SESSION = {
    id: CHAT, title: 'A chat', created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z',
    model: '', system_prompt: null, message_count: 2, document_ids: [],
};
const msg = (id: number, role: 'user' | 'assistant', content: string, extra: Record<string, unknown> = {}) =>
    ({ id, session_id: CHAT, role, content, created_at: '2026-11-14T00:00:00Z', rag_sources: null, ...extra }) as Message;

const account = (status: 'ok' | 'reauth_required') => ({ account_id: 'a', email: 'a@example.com', status, is_default: true });
const google = (status: 'ok' | 'reauth_required') => ({
    id: 'google', display_name: 'Google', type: 'oauth_pkce', configured: status === 'ok', enabled: true, account_id: null, accounts: [account(status)], activations: {},
});

/** The real HTTP client against a fake PC: the chat's transcript, its connectors, and the delete and send calls. */
async function mountChat() {
    const card = { render: 'connect_account', data: { kind: 'connect_account', providers: ['google'] } };
    let messages: Message[] = [msg(1, 'user', 'Check my mail'), msg(2, 'assistant', 'I need access to your mailbox first.', { cards: [card] })];
    let connected = false;
    const { fetch, calls } = createRecordingFetch((call) => {
        const path = call.url.slice(BASE.length);
        if (call.method === 'DELETE' && path === `/api/sessions/${CHAT}/messages/1/and-below`) {
            messages = [];
            return jsonResponse({ deleted: true, count: 2 });
        }
        if (call.method === 'POST' && path === '/api/chat/send') {
            messages = [msg(1, 'user', 'Check my mail'), msg(3, 'assistant', 'You have 4 unread emails.')];
            return streamResponse([`data: ${JSON.stringify({ type: 'done', message_id: 3, content: 'You have 4 unread emails.' })}\n\n`]);
        }
        if (path.startsWith(`/api/sessions/${CHAT}/messages`)) return jsonResponse({ messages, total: messages.length });
        if (path === `/api/sessions/${CHAT}`) return jsonResponse(SESSION);
        if (path === '/api/agents') return jsonResponse({ agents: [{ id: 'gaia', name: 'GAIA' }], total: 1 });
        if (path === '/api/connectors') return jsonResponse({ connectors: [google(connected ? 'ok' : 'reauth_required')] });
        return jsonResponse({ detail: 'not part of this test' }, 404);
    });
    const client = createHttpClient({ baseUrl: BASE, token: null, fetch });
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>
                            <ChatScreen sessionId={CHAT} />
                        </SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    return { calls, connect: () => (connected = true) };
}

beforeEach(() => useChatStreamStore.setState({ turns: {}, resolved: {} }));

(Platform.OS === 'web' ? describe.skip : describe)('CV-13 connector retry banner', () => {
    it('CV-13: waits for the account to connect, then Ask again deletes the question and everything below, resends it, and the banner clears', async () => {
        const { calls, connect } = await mountChat();
        expect(await screen.findByTestId('card-connect-account')).toBeTruthy();
        expect(screen.queryByTestId('connector-retry')).toBeNull();

        connect();
        const ask = await screen.findByText('Ask again', {}, { timeout: 6000 });
        const writes = () => calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.slice(BASE.length)}`);
        expect(writes()).toEqual([]);

        await fireEvent.press(ask);
        await waitFor(() => expect(writes()).toEqual([`DELETE /api/sessions/${CHAT}/messages/1/and-below`, 'POST /api/chat/send']));
        const send = calls.find((c) => c.method === 'POST' && c.url === `${BASE}/api/chat/send`)!;
        expect(JSON.parse(send.body!)).toEqual({ session_id: CHAT, message: 'Check my mail', stream: true });

        expect(await screen.findByText('You have 4 unread emails.')).toBeTruthy();
        expect(screen.queryByTestId('connector-retry')).toBeNull();
        expect(screen.queryByTestId('card-connect-account')).toBeNull();
    }, 20_000);
});
