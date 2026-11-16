// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { Session, StreamEvent } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { IDLE_TURN, writeTurn } from '@/state/chatStreams';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import { ChatScreen } from './ChatScreen';
import { FIXTURES } from './messages/__fixtures__/messages';

/** Developer gallery (`/dev/chat?state=`): the chat screen with a turn running on the PC. */
export const CHAT_STATES = ['running-empty', 'running-status'] as const;
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

const STATUS: StreamEvent = { type: 'status', phase: 'reading', message: 'Reading your request' };

export function ChatGallery({ state }: { state: ChatGalleryState }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        const base = createFakeClient({ sessions: [SESSION], messages: { dev: [FIXTURES.short.messages[0]!] } });
        // The turn never ends here, so the running state written below stays.
        base.attachToRun = () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<StreamEvent>>(() => undefined) }) });
        return base;
    });
    useEffect(() => {
        writeTurn('dev', { ...IDLE_TURN, status: 'streaming', events: state === 'running-status' ? [STATUS] : [] });
        return () => writeTurn('dev', null);
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
