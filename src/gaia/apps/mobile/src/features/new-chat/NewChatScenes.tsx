// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { StartScreen, SystemStatus } from '@webui/types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { UIProvider } from '@/ui';

import { NewChatScreen } from './NewChatScreen';

/**
 * Developer scenes (`/dev/composer?state=`) for the new-chat screen.
 * `new-chat-setup-failed` (NC-03), `new-chat-library` (NC-08: the Documents for this chat panel),
 * `new-chat-warmup` (NC-09), `new-chat-send-error` (NC-10: the opening message fails to start a chat),
 * `new-chat-assistant` (NC-13: tap Details for the reason; Try again asks again).
 */
export const NEW_CHAT_SCENES = ['new-chat-setup-failed', 'new-chat-library', 'new-chat-warmup', 'new-chat-send-error', 'new-chat-assistant'] as const;
export type NewChatScene = (typeof NEW_CHAT_SCENES)[number];

const READY = {
    lemonade_running: true, context_size_sufficient: true, model_context_size: 65536, download_progress: null,
    init_state: 'ready', model_loaded: 'Gemma-4-E4B-it-GGUF',
} as unknown as SystemStatus;

const START: StartScreen = { cards: [], working_folder: { path: '/Users/avery/Documents', name: 'Documents', gaia_folder: false, choosable: false } };

const DOC = (n: number, name: string) => ({
    id: `d${n}`, filename: name, filepath: `/Users/avery/Documents/${name}`, file_size: 20_000, chunk_count: 5,
    indexed_at: '2026-11-16T09:00:00Z', indexing_status: 'complete',
});
const DOCUMENTS = [DOC(1, 'board-notes.pdf'), DOC(2, 'q3-summary.md'), DOC(3, 'forecast.csv')];

function clientFor(state: NewChatScene) {
    const base = { start: START, status: READY };
    if (state === 'new-chat-setup-failed') {
        return createFakeClient({ ...base, status: { ...READY, model_loaded: null, setup_error: 'The model download stopped at 41%.' } as unknown as SystemStatus });
    }
    if (state === 'new-chat-library') {
        return createFakeClient({ ...base, documents: { documents: DOCUMENTS, total: 3, total_chunks: 15, total_size_bytes: 60_000 } } as Parameters<typeof createFakeClient>[0]);
    }
    if (state === 'new-chat-warmup') {
        return createFakeClient({ ...base, status: { ...READY, warm_up: { state: 'warming', elapsed_seconds: 12, model: 'Gemma-4-E4B-it-GGUF', device: 'gpu' } } as unknown as SystemStatus });
    }
    if (state === 'new-chat-assistant') {
        return createFakeClient({ ...base, start: { ...START, skills_error: 'Could not list skills: agent process exited with code 1' } });
    }
    const fake = createFakeClient(base);
    return { ...fake, createSession: () => Promise.reject(new GaiaApiError(500, 'database is locked')) };
}

export function NewChatScenes({ state }: { state: NewChatScene }) {
    const client = useMemo(() => clientFor(state), [state]);
    const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);
    const noop = () => undefined;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <NewChatScreen onOpen={noop} onChooseDocuments={noop} initialHeld={state === 'new-chat-send-error' ? 'Summarize the board notes for me' : undefined} />
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
