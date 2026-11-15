// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { ChatPerformance, ContextUsage } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaApiError } from '@/api/errors';
import { GaiaClientProvider } from '@/data';
import { FIXTURES } from '@/features/chat/messages/__fixtures__/messages';
import { MessageListView } from '@/features/chat/messages/MessageList';
import { Screen } from '@/ui';
import type { TurnPerformance } from '@webui/types';

import { useSessionPanelStore } from './panelStore';
import { SessionPanel } from './SessionPanel';

/** Developer gallery: the session panel open over a chat, with Skills and Agent info in each state. */
export type SessionPanelGalleryState =
    | 'loaded'
    | 'empty'
    | 'error'
    | 'notRunning'
    | 'ctxMeasuring'
    | 'ctxNormal'
    | 'ctxEstimated'
    | 'ctxFilling'
    | 'ctxChat'
    | 'ctxNoTurn';

const CONTEXT_STATES: readonly SessionPanelGalleryState[] = ['ctxMeasuring', 'ctxNormal', 'ctxEstimated', 'ctxFilling', 'ctxChat', 'ctxNoTurn'];

const USAGE: ContextUsage = {
    window: 65536,
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
    categories: [
        { key: 'system', label: 'System prompt', tokens: 9000 },
        { key: 'tools', label: 'Tools', tokens: 6200 },
        { key: 'documents', label: 'Documents', tokens: 3100 },
        { key: 'history', label: 'Conversation', tokens: 8400 },
        { key: 'query', label: 'Your message', tokens: 120 },
    ],
    tool_loading: { loaded: ['search_web', 'read_file'], on_demand: ['gmail_search', 'calendar_list', 'drive_find'] },
    model: 'Gemma-4-E4B-it-GGUF',
    model_window: 131072,
    context_state: { put_away: { results: 4, tokens: 5200 }, summarized: { turns: 12, tokens: 14800, summary_tokens: 900 } },
};

const TURN: TurnPerformance = {
    message_id: 9,
    created_at: '2026-11-14T10:00:00Z',
    model: 'Gemma-4-E4B-it-GGUF',
    time: { wall_seconds: 14.2, model_seconds: 9.8, gaia_seconds: 4.4, tool_seconds: 3.1, waiting_seconds: 0, own_seconds: 1.3 },
    first_token_seconds: 1.4,
    first_token_source: 'server',
    prefill_tokens_per_second: 812.4,
    prefill_source: 'client',
    generation_tokens_per_second: 31.6,
    generation_source: 'server',
    model_calls: 3,
    tokens_in: 26820,
    tokens_new: 4200,
    tokens_cached: 22620,
    tokens_out: 640,
    last_prompt_tokens: 27011,
    tool_calls: 2,
    tool_seconds_total: 3.1,
    tools: [{ name: 'search_web', seconds: 2.4 }, { name: null, seconds: 0.7 }],
    loads: [],
    cost: { kind: 'local', usd: null },
};

const PERFORMANCE: ChatPerformance = {
    latest_message_id: 9,
    turns: [TURN],
    totals: {
        turns: 7,
        wall_seconds: 96.4,
        model_seconds: 70.1,
        gaia_seconds: 26.3,
        tokens_in: 150400,
        tokens_cached: 121000,
        tokens_out: 4300,
        tool_calls: 11,
        loads: 1,
        load_seconds: 6.2,
        usd: 0,
        unpriced_turns: 0,
    },
    now: { model: 'Gemma-4-E4B-it-GGUF', provider: 'local', loaded: true, device: 'gpu', backend: 'vulkan', ctx_size: 65536, weights_gb: 5.4, kv_cache_gb: 1.3, free_gb: 18.2, error: null },
};

const TOOLS = [
    {
        name: 'search_web',
        description: 'Search the web and return the top results.\nSecond line is not shown.',
        category: 'agent',
    },
    {
        name: 'read_file',
        description: 'Read a text file from the working folder.',
        category: 'file_io',
    },
    {
        name: 'gmail_search',
        description: 'Find mail in the connected Gmail account.',
        category: 'mcp',
    },
    { name: 'coding', description: 'Write and run code', category: 'skill' },
];

export function SessionPanelGallery({ state }: { state: SessionPanelGalleryState }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const client = useMemo(() => {
        const ctx = CONTEXT_STATES.includes(state);
        const base = createFakeClient({
            contextUsage: ctx
                ? {
                      available: true,
                      ...USAGE,
                      ...(state === 'ctxEstimated' ? { tokenizer: { exact: false, reason: 'the model is not loaded, so a shared tokenizer counted each part.' } } : {}),
                      ...(state === 'ctxFilling' ? { used: 61200, at_risk: ['What did the budget say last quarter?', 'Summarize the contract'], at_risk_tokens: 4100 } : {}),
                  }
                : undefined,
            chatPerformance: state === 'ctxNoTurn' ? { ...PERFORMANCE, latest_message_id: null, turns: [] } : ctx ? PERFORMANCE : undefined,
            capabilities:
                state === 'loaded'
                    ? {
                          dev: {
                              session_id: 'dev',
                              agent_type: 'gaia',
                              tools: TOOLS,
                              skills: [
                                  { name: 'coding', how: 'model' },
                                  { name: 'file-ops', how: 'auto' },
                                  { name: 'memory', how: 'always' },
                              ],
                          },
                      }
                    : state === 'empty'
                      ? {
                            dev: {
                                session_id: 'dev',
                                agent_type: 'gaia',
                                tools: [],
                                skills: [],
                            },
                        }
                      : undefined,
        });
        if (state === 'ctxMeasuring') {
            base.getContextUsage = () => new Promise(() => undefined);
            base.getChatPerformance = () => new Promise(() => undefined);
        }
        if (state === 'error') {
            base.getCapabilities = async () => {
                throw new GaiaApiError(500, 'The agent stopped responding');
            };
        }
        return base;
    }, [state]);
    useEffect(() => {
        const store = useSessionPanelStore.getState();
        const ctx = CONTEXT_STATES.includes(state);
        store.setSection('skills', !ctx);
        store.setSection('tools', !ctx);
        store.setSection('context', ctx);
        store.setContextScope(state === 'ctxChat' ? 'chat' : 'turn');
    }, [state]);
    return (
        <>
            <Screen>
                <MessageListView messages={FIXTURES.short.messages} />
            </Screen>
            <SessionPanel
                sessionId="dev"
                open
                onClose={() => undefined}
                wrap={(body) => (
                    <QueryClientProvider client={queryClient}>
                        <GaiaClientProvider client={client}>{body}</GaiaClientProvider>
                    </QueryClientProvider>
                )}
            />
        </>
    );
}

export const SessionPanelGalleryData = { performance: PERFORMANCE, usage: USAGE };
