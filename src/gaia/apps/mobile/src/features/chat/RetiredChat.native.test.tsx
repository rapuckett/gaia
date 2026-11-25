// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import { useComposerQueueStore } from '@/features/composer/composerQueue';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ChatScreen } from './ChatScreen';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('./header', () => ({ ChatHeader: () => null }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');
const BASE = 'http://192.168.1.20:4200';
const CHAT = 'old-chat';

function mount(agentType: string) {
    const { fetch, calls } = createRecordingFetch((call) => {
        const path = new URL(call.url).pathname;
        if (path === `/api/sessions/${CHAT}`) {
            return jsonResponse({ id: CHAT, title: 'Old chat', created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z', model: '', system_prompt: null, message_count: 0, document_ids: [], agent_type: agentType });
        }
        if (path === `/api/sessions/${CHAT}/messages`) return jsonResponse({ messages: [], total: 0 });
        return jsonResponse({ detail: 'unexpected' }, 404);
    });
    const client = createHttpClient({ baseUrl: BASE, token: 'tok-1', fetch });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return { calls, queryClient, client };
}

const render_ = (m: ReturnType<typeof mount>) =>
    render(
        <QueryClientProvider client={m.queryClient}>
            <GaiaClientProvider client={m.client}>
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

beforeEach(() => {
    useChatStreamStore.setState({ turns: {}, resolved: {} });
    useComposerQueueStore.setState({ byChat: {}, drafts: {} });
});

describeNative("CV-57: a retired agent's chat is read-only", () => {
    it('disables the composer with the retired reason, and trying to send POSTs nothing', async () => {
        const m = mount('chat');
        await render_(m);
        const reason = t('chat.retiredReadOnly', { agent: 'chat' });
        await waitFor(() => expect(screen.getByTestId('composer-input').props.editable).toBe(false));
        expect(screen.getByTestId('composer-input').props.accessibilityHint).toBe(reason);
        expect(screen.getByTestId('composer-send').props.accessibilityState?.disabled).toBe(true);
        await fireEvent.changeText(screen.getByTestId('composer-input'), 'hello again');
        await fireEvent.press(screen.getByTestId('composer-send'));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(m.calls.filter((c) => c.method === 'POST')).toEqual([]);
        expect(m.calls.some((c) => c.url.includes('/api/chat/send'))).toBe(false);
        m.queryClient.clear();
    });

    it('the flagship agent keeps the composer on, so the check above is not a blanket disable', async () => {
        const m = mount('gaia');
        await render_(m);
        await waitFor(() => expect(m.calls.some((c) => c.url.endsWith(`/api/sessions/${CHAT}`))).toBe(true));
        await waitFor(() => expect(screen.getByTestId('composer-input').props.editable).not.toBe(false));
        m.queryClient.clear();
    });
});
