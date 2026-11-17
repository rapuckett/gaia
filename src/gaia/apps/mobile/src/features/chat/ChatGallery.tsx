// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { Session, StreamEvent } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { IDLE_TURN, writeTurn } from '@/state/chatStreams';
import { useComposerQueueStore } from '@/features/composer/composerQueue';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import { ChatScreen } from './ChatScreen';
import { FIXTURES } from './messages/__fixtures__/messages';

/**
 * Developer gallery (`/dev/chat?state=`): the chat screen with a turn running on the PC.
 * `question` (RC-08, CMP-10): a question card waits and the box says Send answer. `approval` (RC-07): the approval-needed card after the run.
 * `queue` (CMP-12, CMP-13): a queued text with Add to this reply, a failed one with Send again.
 * `queue-stop` (CMP-15): the same queue; `#tap=composer-stop` ends the turn and the queued texts return to the box.
 */
export const CHAT_STATES = ['running-empty', 'running-status', 'question', 'approval', 'queue', 'queue-stop'] as const;
export type ChatGalleryState = (typeof CHAT_STATES)[number];

const SESSION = {
    id: 'dev',
    title: 'Quarterly reports',
    created_at: '2026-11-14T10:00:00Z',
    updated_at: '2026-11-14T10:00:00Z',
    model: 'Gemma-4-E4B-it-GGUF',
    system_prompt: null,
    message_count: 1,
    document_ids: [],
    agent_type: 'gaia',
    inference_remote: false,
} as Session;

const QUESTION = {
    type: 'needs_input',
    request_id: 'q1',
    question: 'Which folder should I tidy?',
    options: [
        { value: 'documents', label: 'Documents' },
        { value: 'downloads', label: 'Downloads' },
    ],
    allow_free_text: true,
} as StreamEvent;
const CONFIRMATION = { type: 'needs_confirmation', action: 'send_email', summary: 'Send the report to the whole team.' } as StreamEvent;
const QUEUED = [
    { id: 9001, text: 'Also check the budget sheet', state: 'queued' as const },
    { id: 9002, text: 'Then email me the summary', state: 'failed' as const, error: 'Could not reach your PC' },
];

const STATUS: StreamEvent = { type: 'status', phase: 'reading', message: 'Reading your request' };

export function ChatGallery({ state }: { state: ChatGalleryState }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        const base = createFakeClient({ sessions: [SESSION], messages: { dev: [FIXTURES.short.messages[0]!] } });
        // The turn never ends here, so the running state written below stays.
        if (state === 'queue-stop') {
            // The turn ends once GAIA is asked to stop, as it does on the PC.
            let release: () => void = () => undefined;
            const gate = new Promise<void>((resolve) => (release = resolve));
            base.cancelChat = async () => {
                release();
                return { status: 'ok', cancelled: true };
            };
            base.attachToRun = async function* () {
                yield STATUS;
                await gate;
                yield { type: 'done' } as StreamEvent;
            };
            return base;
        }
        if (state === 'approval') return base;
        base.attachToRun = () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<StreamEvent>>(() => undefined) }) });
        return base;
    });
    useEffect(() => {
        if (state === 'approval') writeTurn('dev', { ...IDLE_TURN, pendingConfirmation: CONFIRMATION as typeof IDLE_TURN.pendingConfirmation });
        else if (state !== 'queue-stop') {
            writeTurn('dev', {
                ...IDLE_TURN,
                status: 'streaming',
                events: state === 'running-status' ? [STATUS] : [],
                pendingQuestion: state === 'question' ? (QUESTION as typeof IDLE_TURN.pendingQuestion) : null,
            });
        }
        if (state === 'queue' || state === 'queue-stop') useComposerQueueStore.setState({ byChat: { dev: QUEUED }, drafts: {} });
        return () => {
            writeTurn('dev', null);
            useComposerQueueStore.setState({ byChat: {}, drafts: {} });
        };
    }, [state]);
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <ChatScreen sessionId="dev" />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
