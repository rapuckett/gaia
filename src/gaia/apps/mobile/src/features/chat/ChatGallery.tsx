// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { ActiveModel, LocalModelStatus, Session, StreamEvent } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { jumpToMessage } from './messages/jumpToMessage';
import { IDLE_TURN, useChatStreamStore, writeTurn } from '@/state/chatStreams';
import { useComposerQueueStore } from '@/features/composer/composerQueue';
import { ScreenBannerProvider, UIProvider } from '@/ui';

import { ChatScreen } from './ChatScreen';
import { FIXTURES } from './messages/__fixtures__/messages';

/**
 * Developer gallery (`/dev/chat?state=`): the chat screen with a turn running on the PC.
 * `question` (RC-08, CMP-10): a question card waits and the box says Send answer. `approval` (RC-07): the approval-needed card after the run.
 * `question-answered`, `question-answer-failed` (CMP-10): the same question with "Downloads" typed in the box; tap Send answer, and the answer goes through (the card resolves) or the PC refuses it (the error shows and the text returns to the box).
 * `permission-scrolled`: a tool approval card is pinned and the transcript is scrolled up, so the jump button rides above the card. `permission-room`: a short card with room above it, so the button shows. `permission-tall`: a card so tall the list is too short for the button, which hides. `permission-tall-mid` / `-end`: the tall card's details box scrolled to the middle or the end (web only).
 * `queue` (CMP-12, CMP-13): a queued text with Add to this reply, a failed one with Send again.
 * `env-offline` (SP-17): the chat's internet is off and the session panel is closed, so the offline notice shows above the composer.
 * `queue-stop` (CMP-15): the same queue; `#tap=composer-stop` ends the turn and the queued texts return to the box.
 * `?queued=<model id>`: the chip shows a model switch waiting for the turn to end ("name → id").
 * `?model=none`: the PC reports no model, so the chip shows its fallback name. Otherwise it shows Gemma 4 E4B, running on the PC.
 */
export const CHAT_STATES = ['running-empty', 'running-status', 'question', 'question-answered', 'question-answer-failed', 'approval', 'permission-scrolled', 'permission-room', 'permission-tall', 'permission-tall-mid', 'permission-tall-end', 'queue', 'queue-stop', 'env-offline'] as const;
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

const ACTIVE_MODEL: ActiveModel = {
    provider: 'local',
    model: SESSION.model,
    display_name: 'Gemma 4 E4B',
    label: 'Gemma 4 E4B',
    remote: false,
    is_default: true,
    downloaded: true,
    inference_remote: false,
};
const LOCAL_MODEL: LocalModelStatus = {
    state: 'loaded',
    active_model: SESSION.model,
    active_display_name: 'Gemma 4 E4B',
    active_remote: false,
    model: SESSION.model,
    display_name: 'Gemma 4 E4B',
    placement: null,
    ctx_size: 65536,
    memory: null,
    memory_error: null,
    error: null,
    base_url: null,
    owner: 'gaia',
    busy: false,
    restarting: false,
    restart_error: null,
};

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

const PERMISSION = {
    type: 'permission_request',
    confirm_id: 'p1',
    tool: 'write_file',
    tool_label: 'writing file',
    args: { file_path: '/Users/Shared/gaia-demo/notes.txt', content: 'hello' },
    always_scope: 'write_file on notes.txt',
    timeout_seconds: 600,
} as StreamEvent;
const TALL_PERMISSION = {
    ...PERMISSION,
    args: { file_path: '/Users/Shared/gaia-demo/notes.txt', content: Array.from({ length: 40 }, (_, i) => `line ${i + 1} of the file`).join('\n') },
} as StreamEvent;
const ROOM_PERMISSION = {
    type: 'permission_request',
    confirm_id: 'p2',
    tool: 'run_shell_command',
    tool_label: 'running a shell command',
    args: { command: 'git status --short' },
    timeout_seconds: 600,
} as StreamEvent;
const MANY_MESSAGES = FIXTURES.many.messages;

const STATUS: StreamEvent = { type: 'status', phase: 'reading', message: 'Reading your request' };

function seedScene(state: ChatGalleryState) {
    if (state === 'env-offline') return;
    if (state.startsWith('permission-')) {
        writeTurn('dev', {
            ...IDLE_TURN,
            status: 'streaming',
            pendingPermission: (state === 'permission-room' ? ROOM_PERMISSION : state.startsWith('permission-tall') ? TALL_PERMISSION : PERMISSION) as typeof IDLE_TURN.pendingPermission,
        });
    } else if (state === 'approval') writeTurn('dev', { ...IDLE_TURN, pendingConfirmation: CONFIRMATION as typeof IDLE_TURN.pendingConfirmation });
    else {
        writeTurn('dev', {
            ...IDLE_TURN,
            status: 'streaming',
            events: state === 'running-status' ? [STATUS] : [],
            pendingQuestion: state.startsWith('question') ? (QUESTION as typeof IDLE_TURN.pendingQuestion) : null,
        });
    }
    if (state === 'queue' || state === 'queue-stop') useComposerQueueStore.setState({ byChat: { dev: QUEUED }, drafts: {} });
    if (state === 'question-answered' || state === 'question-answer-failed') useComposerQueueStore.setState({ byChat: {}, drafts: { dev: 'Downloads' } });
}

export function ChatGallery({ state, queued, model }: { state: ChatGalleryState; queued?: string; model?: 'none' }) {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const [client] = useState(() => {
        const base = createFakeClient({
            sessions: [SESSION],
            activeModel: model === 'none' ? undefined : ACTIVE_MODEL,
            localModel: model === 'none' ? undefined : LOCAL_MODEL,
            messages: { dev: state.startsWith('permission-') ? [...MANY_MESSAGES] : [FIXTURES.short.messages[0]!] },
            environments: state === 'env-offline' ? { dev: { session_id: 'dev', folders: [], removed: [], internet: false, enforced: true, internet_enforced: true } } : undefined,
        });
        if (state === 'env-offline') return base;
        // The turn never ends here, so the running state written below stays.
        if (state === 'queue-stop') {
            // The turn ends once GAIA is asked to stop, as it does on the PC.
            let release: () => void = () => undefined;
            const gate = new Promise<void>((resolve) => (release = resolve));
            base.cancelChat = async () => {
                release();
                return { status: 'ok', cancelled: true };
            };
            // Stop reaches the PC only once the run has seen an event, so one arrives first.
            base.attachToRun = async function* () {
                await new Promise((resolve) => setTimeout(resolve, 50));
                yield STATUS;
                await gate;
                yield { type: 'done' } as StreamEvent;
            };
            return base;
        }
        if (state === 'approval') return base;
        if (state === 'question-answer-failed') {
            base.sendUserInput = async () => {
                throw new GaiaApiError(500, 'Database is locked');
            };
        }
        base.attachToRun = () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<StreamEvent>>(() => undefined) }) });
        return base;
    });
    // The screen mounts only once seeded: a model chip that mounts with no turn running applies `queued` at once, and a store write while rendering would update subscribers like the drawer mid-render.
    const seeded = useChatStreamStore((s) => state === 'env-offline' || s.turns.dev !== undefined);
    useEffect(() => {
        if (state === 'env-offline') return undefined;
        seedScene(state);
        return () => {
            writeTurn('dev', null);
            useComposerQueueStore.setState({ byChat: {}, drafts: {} });
        };
    }, [state]);
    useEffect(() => {
        if (!seeded || !state.startsWith('permission-')) return undefined;
        // Scroll up once the transcript has loaded, so the jump button would show.
        const timer = setInterval(() => {
            if (jumpToMessage(MANY_MESSAGES[0]!.id)) clearInterval(timer);
        }, 200);
        return () => clearInterval(timer);
    }, [seeded, state]);
    useEffect(() => {
        if (!seeded || Platform.OS !== 'web' || !/^permission-tall-(mid|end)$/.test(state)) return undefined;
        const timer = setInterval(() => {
            const box = document.querySelector<HTMLElement>('[data-testid="perm-details-scroll"]');
            if (!box || box.scrollHeight <= box.clientHeight) return;
            const room = box.scrollHeight - box.clientHeight;
            box.scrollTop = state.endsWith('end') ? room : Math.round(room / 2);
            clearInterval(timer);
        }, 200);
        return () => clearInterval(timer);
    }, [seeded, state]);
    if (!seeded) return null;
    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <ScreenBannerProvider banner={null}>
                        <ChatScreen sessionId="dev" initialQueuedModel={queued} />
                    </ScreenBannerProvider>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
