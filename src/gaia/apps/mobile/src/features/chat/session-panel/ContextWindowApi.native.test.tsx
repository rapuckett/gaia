// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';

import { ContextSection } from './ContextSection';
import { useSessionPanelStore } from './panelStore';

// The PC's route (chat.py `get_context_usage`): GET /api/chat/context/{session_id}, answering
// {available: true, ...usage with context_state}. The phone reads it with a bodyless GET (the panel also reads
// /api/chat/performance/{id}).

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const BASE = 'http://192.168.1.20:4200';

async function show(usage: Record<string, unknown>) {
    useSessionPanelStore.getState().setSection('context', true);
    const { fetch, calls } = createRecordingFetch((call) =>
        new URL(call.url).pathname === '/api/chat/context/chat%201' || new URL(call.url).pathname === '/api/chat/context/chat 1'
            ? jsonResponse({ available: true, ...usage })
            : jsonResponse({ detail: 'unexpected' }, 404),
    );
    const client = createHttpClient({ baseUrl: BASE, token: 'tok-1', fetch });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ContextSection sessionId="chat 1" live={false} />, { wrapper });
    return { calls, queryClient };
}

describeNative('SP-20: context beyond the window, against the real client', () => {
    const usage: Record<string, unknown> = {
        window: 131072,
        reply_reserve: 4096,
        system: 9000,
        tools: 6200,
        documents: 3100,
        history: 8400,
        query: 120,
        used: 26820,
        history_budget: 40000,
        history_used: 8400,
        turns_in_view: 6,
        turns_hidden: 0,
        at_risk: [],
        at_risk_tokens: 0,
        tokenizer: { exact: true, model: 'Gemma-4-E4B-it-GGUF' },
        categories: [{ key: 'system', label: 'System prompt', tokens: 9000 }],
        tool_loading: { loaded: ['search_web'], on_demand: [] },
        model: 'Gemma-4-E4B-it-GGUF',
        model_window: 131072,
        context_state: { put_away: { results: 4, tokens: 5200 }, summarized: { turns: 12, tokens: 14800, summary_tokens: 900 } },
    };

    it('shows Live, Put away and Summarized with the PC counts, and reads GET /api/chat/context/{id} once, with no body', async () => {
        const { calls, queryClient } = await show(usage);
        expect(await screen.findByText('Live in the window')).toBeTruthy();
        expect(screen.getByText('Put away')).toBeTruthy();
        expect(screen.getByText('Older tool results moved out of the prompt; still readable')).toBeTruthy();
        expect(screen.getByText('4 results')).toBeTruthy();
        expect(screen.getByText('Summarized')).toBeTruthy();
        expect(screen.getByText('Older turns folded into a running summary; the originals stay saved')).toBeTruthy();
        expect(screen.getByText('12 earlier turns')).toBeTruthy();
        expect(screen.getByText('Earlier messages summarized — still searchable.')).toBeTruthy();
        const reads = calls.filter((c) => c.url.includes('/api/chat/context/'));
        expect(reads).toHaveLength(1);
        expect(reads[0]).toMatchObject({ method: 'GET', url: `${BASE}/api/chat/context/chat%201`, headers: { Authorization: 'Bearer tok-1' }, body: undefined });
        queryClient.clear();
    });

    it('leaves Put away and Summarized out when the PC reports nothing moved', async () => {
        const { queryClient } = await show({ ...usage, context_state: { put_away: { results: 0, tokens: 0 }, summarized: { turns: 0, tokens: 0, summary_tokens: 0 } } });
        expect(await screen.findByText('Live in the window')).toBeTruthy();
        expect(screen.queryByText('Put away')).toBeNull();
        expect(screen.queryByText('Summarized')).toBeNull();
        expect(screen.queryByText('Earlier messages summarized — still searchable.')).toBeNull();
        queryClient.clear();
    });
});
