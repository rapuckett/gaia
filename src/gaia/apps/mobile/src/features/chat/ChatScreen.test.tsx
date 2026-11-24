// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { item, type QueuedMessage } from '@webui/utils/messageQueue';
import { APPROVAL_ARM_MS } from '@webui/utils/permissionPrompts.core';

import type { ConnectorListEntry } from '@webui/types';

import type { Message, StreamEvent } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useComposerQueueStore } from '@/features/composer/composerQueue';
import { translator } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import { useResearchStore } from '@/state/research';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ChatScreen } from './ChatScreen';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('./header', () => ({ ChatHeader: () => null }));

const t = translator('en');
const CHAT = 'chat-1';

function message(id: number, role: 'user' | 'assistant', content: string): Message {
    return { id, session_id: CHAT, role, content, created_at: '2026-11-14T00:00:00Z', rag_sources: null };
}

const SESSION = {
    id: CHAT,
    title: 'A chat',
    created_at: '2026-11-14T00:00:00Z',
    updated_at: '2026-11-14T00:00:00Z',
    model: '',
    system_prompt: null,
    message_count: 1,
    document_ids: [],
};

function gate() {
    let open!: () => void;
    const opened = new Promise<void>((resolve) => (open = resolve));
    return { opened, open };
}

async function mount(client: ReturnType<typeof createFakeClient>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ChatScreen sessionId={CHAT} />, { wrapper: wrap });
}

async function sendText(text: string) {
    await fireEvent.changeText(await screen.findByTestId('composer-input'), text);
    await fireEvent.press(screen.getByTestId('composer-send'));
}

describe('ChatScreen', () => {
    beforeEach(() => {
        useChatStreamStore.setState({ turns: {}, resolved: {} });
        useComposerQueueStore.setState({ byChat: {}, drafts: {} });
        useResearchStore.setState({ research: {} });
    });

    it('streams an answer, shows the stopped note after Stop, and Continue sends the web UI text', async () => {
        const stopped = gate();
        const messages = { [CHAT]: [message(1, 'user', 'Tell a story')] };
        const client = createFakeClient({
            sessions: [SESSION],
            messages,
            replies: async function* (): AsyncGenerator<StreamEvent> {
                yield { type: 'chunk', content: 'Once upon' };
                await stopped.opened;
                yield { type: 'done', cancelled: true, message_id: 2, content: 'Once upon' };
            },
        });
        await mount(client);

        await sendText('Tell a story');
        expect(await screen.findByText(/Once upon/)).toBeTruthy();

        await fireEvent.press(screen.getByTestId('composer-stop'));
        expect(client.cancelled).toEqual([CHAT]);
        messages[CHAT]!.push(message(2, 'assistant', 'Once upon'));
        await act(async () => stopped.open());

        expect(await screen.findByText(t('msg.stopped'))).toBeTruthy();
        await fireEvent.press(screen.getByTestId('continue'));
        await waitFor(() => expect(client.sent.map((s) => s.message)).toEqual(['Tell a story', t('msg.continuePrompt')]));
        // A full stream, Stop and Continue; under a loaded parallel run it can pass jest's 5 s default.
    }, 20_000);

    it('sends the typed text as a /research turn while the Research chip is on', async () => {
        const client = createFakeClient({
            sessions: [SESSION],
            messages: { [CHAT]: [message(1, 'user', 'Hi')] },
            replies: async function* (): AsyncGenerator<StreamEvent> {
                yield { type: 'done', message_id: 2, content: 'ok' };
            },
        });
        await mount(client);
        await fireEvent.press(await screen.findByTestId('research-chip'));
        await sendText('EU AI Act');
        await waitFor(() => expect(client.sent.map((s) => s.message)).toEqual(['/research EU AI Act']));
    });

    it('shows a failed turn as its classified text and Try again deletes the exchange and resends', async () => {
        const messages = { [CHAT]: [message(1, 'user', 'Summarize it')] };
        let attempt = 0;
        const client = createFakeClient({
            sessions: [SESSION],
            messages,
            replies: async function* (): AsyncGenerator<StreamEvent> {
                attempt += 1;
                if (attempt === 1) yield { type: 'error', content: 'Lemonade could not get response' };
                else yield { type: 'done', message_id: 3, content: 'Done.' };
            },
        });
        await mount(client);

        await sendText('Summarize it');
        expect(await screen.findByText(t('chatError.modelServer'))).toBeTruthy();

        await fireEvent.press(await screen.findByTestId('try-again'));
        await waitFor(() => expect(client.sent.map((s) => s.message)).toEqual(['Summarize it', 'Summarize it']));
        expect(client.deleted).toEqual([{ sessionId: CHAT, messageId: 1 }]);
    });

    it('shows the model-server-down notice under a failed reply', async () => {
        const client = createFakeClient({
            sessions: [SESSION],
            messages: { [CHAT]: [message(1, 'user', 'Hi')] },
            replies: async function* (): AsyncGenerator<StreamEvent> {
                yield { type: 'done', message_id: 2, content: 'Lemonade is not running.', failed: true, failure: 'model_server_down' };
            },
        });
        await mount(client);

        await sendText('Hi');
        expect(await screen.findByTestId('server-down-notice')).toBeTruthy();
        expect(screen.queryByTestId('error-banner')).toBeNull();
    });

    it('shows the model-server-down fix as the saved failed reply\'s only failure surface', async () => {
        const messages = { [CHAT]: [message(1, 'user', 'Hi')] };
        const client = createFakeClient({
            sessions: [SESSION],
            messages,
            replies: async function* (): AsyncGenerator<StreamEvent> {
                messages[CHAT].push({ ...message(2, 'assistant', 'Lemonade is not running.'), failed: true });
                yield { type: 'done', message_id: 2, content: 'Lemonade is not running.', failed: true, failure: 'model_server_down' };
            },
        });
        await mount(client);

        await sendText('Hi');
        expect(await screen.findByTestId('server-down-notice')).toBeTruthy();
        expect(await screen.findByText('Lemonade is not running.')).toBeTruthy();
        expect(screen.queryByTestId('error-banner')).toBeNull();
    });

    it('keeps the sent message above a failed turn\'s card and Try again', async () => {
        const client = createFakeClient({
            sessions: [SESSION],
            messages: { [CHAT]: [message(1, 'user', 'hello'), { ...message(2, 'assistant', 'Lemonade is not running.'), failed: true }] },
        });
        await mount(client);

        let list = (await screen.findByText('hello')).parent;
        while (list && list.props.keyboardDismissMode === undefined) list = list.parent;
        expect(await screen.findByTestId('try-again')).toBeTruthy();
        expect(screen.getByText('Lemonade is not running.')).toBeTruthy();
        expect(list?.props.keyboardDismissMode).toBe(Platform.OS === 'ios' ? 'interactive' : 'on-drag');
        expect(list?.props.keyboardShouldPersistTaps).toBe('handled');
    });

    it('Stop returns the queued messages to the box and sends none of them', async () => {
        const finish = gate();
        const client = createFakeClient({
            sessions: [SESSION],
            messages: { [CHAT]: [message(1, 'user', 'first')] },
            replies: async function* (): AsyncGenerator<StreamEvent> {
                yield { type: 'chunk', content: 'Working' };
                await finish.opened;
                yield { type: 'done', cancelled: true, message_id: 2, content: 'Working' };
            },
        });
        await mount(client);

        await sendText('first');
        await screen.findByText(/Working/);
        await sendText('second');
        await sendText('third');
        await fireEvent.press(screen.getByTestId('composer-stop'));
        await act(async () => finish.open());

        await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('second\n\nthird'));
        expect(client.sent.map((s) => s.message)).toEqual(['first']);
        expect(useComposerQueueStore.getState().byChat[CHAT]).toEqual([]);
    });

    it('holds the messages behind a failed one until Send again', async () => {
        const failed: QueuedMessage = { ...item('first', 'failed'), error: 'no connection' };
        useComposerQueueStore.setState({ byChat: { [CHAT]: [failed, item('second', 'queued')] } });
        const client = createFakeClient({
            sessions: [SESSION],
            messages: { [CHAT]: [] },
            replies: [{ type: 'done', message_id: 2, content: 'ok' }],
        });
        await mount(client);

        expect(await screen.findByText(t('queue.notSentBare'))).toBeTruthy();
        expect(screen.getByText('no connection')).toBeTruthy();
        expect(client.sent).toEqual([]);

        await fireEvent.press(screen.getByTestId(`queued-retry-${failed.id}`));
        await waitFor(() => expect(client.sent.map((s) => s.message)).toEqual(['first', 'second']));
    });

    it('offers Ask again for a Connect card once its account is connected, and tells the person to connect on the PC', async () => {
        const card = { render: 'connect_account', data: { kind: 'connect_account', providers: ['google'] } };
        const reply = { ...message(2, 'assistant', 'I need access to your mailbox first.'), cards: [card] };
        const connected = { id: 'google', display_name: 'Google', configured: true } as ConnectorListEntry;
        await mount(createFakeClient({ sessions: [SESSION], messages: { [CHAT]: [message(1, 'user', 'Check my mail'), reply] }, connectors: [connected] }));

        expect(await screen.findByTestId('card-connect-account')).toBeTruthy();
        expect(await screen.findByText(t('mobileApp.connectorRetry.askAgain'))).toBeTruthy();
    });

    it('sends a typed answer to the waiting question as its value, shown as typed', async () => {
        const hold = gate();
        const client = createFakeClient({
            sessions: [SESSION],
            messages: { [CHAT]: [message(1, 'user', 'Pick one')] },
            replies: async function* (): AsyncGenerator<StreamEvent> {
                yield {
                    type: 'needs_input',
                    request_id: 'q1',
                    question: 'Which color?',
                    options: [
                        { value: 'r', label: 'Red', description: '' },
                        { value: 'b', label: 'Blue', description: '' },
                    ],
                    allow_free_text: false,
                };
                await hold.opened;
                yield { type: 'done', message_id: 2, content: '' };
            },
        });
        await mount(client);

        await sendText('Pick one');
        await screen.findByLabelText(t('composer.sendAnswer'));
        await sendText('blue');
        await waitFor(() => expect(client.answers).toEqual([{ session_id: CHAT, request_id: 'q1', value: 'b', display: 'blue' }]));
        expect(client.sent.map((m) => m.message)).toEqual(['Pick one']);
        await act(async () => hold.open());
    });

    describe('tool approval', () => {
        const REQUEST: StreamEvent = { type: 'permission_request', tool: 'write_file', confirm_id: 'c1', always_scope: 'write_file', timeout_seconds: 60 };
        let hold = gate();
        beforeEach(() => {
            hold = gate();
        });
        // The stream stays open on the request, as a turn waiting on the person does.
        const permissionClient = (event: StreamEvent) =>
            createFakeClient({
                sessions: [SESSION],
                messages: { [CHAT]: [message(1, 'user', 'Save it')] },
                replies: async function* (): AsyncGenerator<StreamEvent> {
                    yield event;
                    await hold.opened;
                    yield { type: 'done', message_id: 2, content: '' };
                },
            });

        it('sends nothing for a tap as the prompt appears, then posts the answer and clears it as answered', async () => {
            const client = permissionClient(REQUEST);
            await mount(client);
            await sendText('Save it');
            await fireEvent.press(await screen.findByTestId('perm-always'));
            await fireEvent.press(screen.getByTestId('perm-allow'));
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, APPROVAL_ARM_MS + 50));
            });
            expect(client.confirmations).toEqual([]);
            await fireEvent.press(screen.getByTestId('perm-allow'));
            await waitFor(() => expect(client.confirmations).toEqual([{ session_id: CHAT, approved: true, always: false, confirm_id: 'c1' }]));
            await waitFor(() => expect(screen.queryByTestId('perm-card')).toBeNull());
            expect(useChatStreamStore.getState().resolved[CHAT]?.c1).toEqual({ state: 'answered' });
            await act(async () => hold.open());
        });

        it('starts the wait again when something in the footer below the card changes height', async () => {
            const client = permissionClient(REQUEST);
            await mount(client);
            await sendText('Save it');
            await screen.findByTestId('perm-allow');
            const still = () =>
                act(async () => {
                    await new Promise((resolve) => setTimeout(resolve, APPROVAL_ARM_MS + 50));
                });
            await still();
            await fireEvent(screen.getByTestId('chat-footer'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 260 } } });
            await fireEvent.press(screen.getByTestId('perm-allow'));
            expect(client.confirmations).toEqual([]);
            await still();
            await fireEvent.press(screen.getByTestId('perm-allow'));
            await waitFor(() => expect(client.confirmations).toEqual([{ session_id: CHAT, approved: true, always: false, confirm_id: 'c1' }]));
            await act(async () => hold.open());
        });

        it('notes on the waiting card that Full access starts from the next step', async () => {
            await mount(permissionClient(REQUEST));
            await sendText('Save it');
            await screen.findByTestId('perm-card');
            await waitFor(() => expect(screen.queryByTestId('perm-full-pending')).toBeNull());
            await fireEvent.press(screen.getByTestId('permission-chip'));
            await fireEvent.press(await screen.findByTestId('permission-full_access'));
            await fireEvent.press(await screen.findByText(t('env.turnOn')));
            await screen.findByTestId('permission-pending');
            await fireEvent.press(screen.getByTestId('permission-cancel'));
            expect(await screen.findByTestId('perm-full-pending')).toBeTruthy();
            await act(async () => hold.open());
        });

        it('clears a prompt whose deadline has passed as expired', async () => {
            await mount(permissionClient({ ...REQUEST, expires_at: Date.now() / 1000 - 5 }));
            await sendText('Save it');
            await waitFor(() => expect(useChatStreamStore.getState().resolved[CHAT]?.c1).toEqual({ state: 'expired' }));
            expect(screen.queryByTestId('perm-card')).toBeNull();
            expect(useChatStreamStore.getState().turns[CHAT]?.pendingPermission).toBeNull();
        });
    });

    describe('back from the background', () => {
        let appState: ((state: string) => void)[] = [];
        beforeEach(() => {
            appState = [];
            jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, handler: (state: string) => void) => {
                if (type === 'change') appState.push(handler);
                return { remove: () => (appState = appState.filter((h) => h !== handler)) };
            }) as unknown as typeof AppState.addEventListener);
        });
        afterEach(() => jest.restoreAllMocks());

        async function backgroundThenForeground() {
            await act(async () => [...appState].forEach((h) => h('background')));
            await act(async () => [...appState].forEach((h) => h('active')));
        }

        const READING: StreamEvent = { type: 'status', status: 'working', message: 'Reading your request' };

        it('keeps a quiet running turn running, with its status and Stop, until GAIA ends it', async () => {
            const replay = gate();
            const lostView = gate();
            const messages = { [CHAT]: [message(1, 'user', 'Write a guide')] };
            const base = createFakeClient({
                sessions: [SESSION],
                messages,
                replies: async function* (): AsyncGenerator<StreamEvent> {
                    yield READING;
                    await lostView.opened;
                },
            });
            const client = {
                ...base,
                // The re-attach answers late, as over a phone's freshly woken connection.
                attachToRun: async function* (): AsyncGenerator<StreamEvent> {
                    await replay.opened;
                    yield READING;
                    yield { type: 'done', message_id: 2, content: 'Step 1. Dig.' };
                },
            } as typeof base;
            await mount(client);

            await sendText('Write a guide');
            expect(await screen.findByText(t('live.readingRequest'))).toBeTruthy();
            await backgroundThenForeground();

            expect(screen.getByText(t('live.readingRequest'))).toBeTruthy();
            expect(screen.getByTestId('composer-stop')).toBeTruthy();
            expect(screen.queryByTestId('composer-send')).toBeNull();

            messages[CHAT].push(message(2, 'assistant', 'Step 1. Dig.'));
            await act(async () => replay.open());
            expect(await screen.findByText('Step 1. Dig.')).toBeTruthy();
            await waitFor(() => expect(screen.queryByTestId('composer-stop')).toBeNull());
            expect(screen.queryByText(t('live.readingRequest'))).toBeNull();
            expect(client.sent.map((s) => s.message)).toEqual(['Write a guide']);
            await act(async () => lostView.open());
        });

        it('shows a turn that ended while away as finished', async () => {
            const lostView = gate();
            const messages = { [CHAT]: [message(1, 'user', 'Write a guide')] };
            // No turn is running when the phone re-attaches, so the attach replays nothing.
            const client = createFakeClient({
                sessions: [SESSION],
                messages,
                replies: async function* (): AsyncGenerator<StreamEvent> {
                    yield READING;
                    await lostView.opened;
                },
            });
            await mount(client);

            await sendText('Write a guide');
            expect(await screen.findByText(t('live.readingRequest'))).toBeTruthy();
            messages[CHAT].push(message(2, 'assistant', 'All ten steps.'));
            await backgroundThenForeground();

            expect(await screen.findByText('All ten steps.')).toBeTruthy();
            await waitFor(() => expect(screen.queryByTestId('composer-stop')).toBeNull());
            expect(screen.queryByText(t('live.readingRequest'))).toBeNull();
            await act(async () => lostView.open());
        });
    });
});
