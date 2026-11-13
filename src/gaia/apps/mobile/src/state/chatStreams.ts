// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

import type { StreamEvent } from '@webui/types';

import { AGENT_EVENT_TYPES, RESOLVES_PROMPTS } from '@/api/constants';
import { GaiaTurnError, type GaiaError } from '@/api/errors';

/**
 * - `idle`: no turn is running in this chat on this phone.
 * - `connecting`: a message was sent and GAIA has not started answering it.
 * - `streaming`: the turn's events are arriving; a reattached turn replays from its start.
 * - `stopping`: Stop was pressed; the turn ends when GAIA confirms it.
 */
export type ChatStreamStatus = 'idle' | 'connecting' | 'streaming' | 'stopping';

/** A tool call the turn is blocked on until it is allowed or denied. */
export type PermissionRequest = StreamEvent & { type: 'permission_request' };

/** A question the turn is blocked on until it is answered. */
export type QuestionRequest = StreamEvent & { type: 'needs_input'; request_id: string };

export interface ChatTurn {
    status: ChatStreamStatus;
    /** The answer so far. */
    liveText: string;
    /** The agent's activity in order; back-to-back `thinking` pieces are joined into one event. */
    events: readonly StreamEvent[];
    pendingPermission: PermissionRequest | null;
    pendingQuestion: QuestionRequest | null;
    error: GaiaError | null;
    /** A tool ran since the last answer text, so the next text starts a new paragraph. */
    toolSinceText: boolean;
}

export const IDLE_TURN: ChatTurn = {
    status: 'idle',
    liveText: '',
    events: [],
    pendingPermission: null,
    pendingQuestion: null,
    error: null,
    toolSinceText: false,
};

/** A message was just sent: nothing of the previous turn is kept. */
export function beginTurn(): ChatTurn {
    return { ...IDLE_TURN, status: 'connecting' };
}

/** The turn's first event arrived. A reattached turn replays from its start, so this starts clean. */
export function openTurn(turn: ChatTurn): ChatTurn {
    return { ...IDLE_TURN, status: turn.status === 'stopping' ? 'stopping' : 'streaming' };
}

function withoutPrompts(turn: ChatTurn): ChatTurn {
    if (!turn.pendingPermission && !turn.pendingQuestion) return turn;
    return { ...turn, pendingPermission: null, pendingQuestion: null };
}

function appendEvent(events: readonly StreamEvent[], event: StreamEvent): readonly StreamEvent[] {
    const last = events[events.length - 1];
    if (event.type === 'thinking' && last?.type === 'thinking') {
        return [...events.slice(0, -1), { ...last, content: (last.content ?? '') + (event.content ?? '') }];
    }
    return [...events, event];
}

function applyAgentEvent(turn: ChatTurn, event: StreamEvent): ChatTurn {
    let next = RESOLVES_PROMPTS.has(event.type) ? withoutPrompts(turn) : turn;
    if (event.type === 'permission_request') {
        next = { ...next, pendingPermission: event as PermissionRequest };
    }
    // A question without an id can't be answered; it stays visible in `events`.
    if (event.type === 'needs_input' && event.request_id) {
        next = { ...next, pendingQuestion: event as QuestionRequest };
    }
    if (event.type === 'tool_start') {
        next = { ...next, toolSinceText: true };
    }
    // The text so far narrated a tool call, was reasoning, or was cut off: it is not the answer.
    if (event.type === 'commentary' || event.retracts_answer) {
        next = { ...next, liveText: '', toolSinceText: false };
    }
    return { ...next, events: appendEvent(next.events, event) };
}

/** One stream event folded into the turn, as the web Agent UI's chat view folds it. */
export function applyEvent(turn: ChatTurn, event: StreamEvent): ChatTurn {
    switch (event.type) {
        case 'chunk': {
            if (!event.content) return turn;
            const separator = turn.toolSinceText && turn.liveText ? '\n\n' : '';
            return { ...withoutPrompts(turn), liveText: turn.liveText + separator + event.content, toolSinceText: false };
        }
        case 'answer':
            // The whole answer, not a piece of it.
            if (!event.content) return turn;
            return { ...withoutPrompts(turn), liveText: event.content, toolSinceText: false };
        case 'done':
            return { ...withoutPrompts(turn), liveText: event.content || turn.liveText };
        case 'error':
            return { ...withoutPrompts(turn), error: new GaiaTurnError(event.content ?? '') };
        default:
            return AGENT_EVENT_TYPES.has(event.type) ? applyAgentEvent(turn, event) : turn;
    }
}

/** The permission prompt `confirmId` was answered; with no id, whichever one is open. */
export function permissionAnswered(turn: ChatTurn, confirmId?: string | null): ChatTurn {
    const pending = turn.pendingPermission;
    if (!pending || (confirmId && pending.confirm_id !== confirmId)) return turn;
    return { ...turn, pendingPermission: null };
}

export function questionAnswered(turn: ChatTurn, requestId: string): ChatTurn {
    return turn.pendingQuestion?.request_id === requestId ? { ...turn, pendingQuestion: null } : turn;
}

interface ChatStreamsState {
    /** By chat id; a chat with no entry is idle. */
    turns: Readonly<Record<string, ChatTurn>>;
}

// Live turns only: once a turn ends, its messages come from the transcript query.
export const useChatStreamStore = create<ChatStreamsState>(() => ({ turns: {} }));

export function readTurn(sessionId: string): ChatTurn {
    return useChatStreamStore.getState().turns[sessionId] ?? IDLE_TURN;
}

export function writeTurn(sessionId: string, turn: ChatTurn | null): void {
    useChatStreamStore.setState((state) => {
        const turns = { ...state.turns };
        if (turn === null) delete turns[sessionId];
        else turns[sessionId] = turn;
        return { turns };
    });
}

/** Changes a chat's live turn; a chat with none is left alone. */
export function updateTurn(sessionId: string, change: (turn: ChatTurn) => ChatTurn): void {
    const turn = useChatStreamStore.getState().turns[sessionId];
    if (!turn) return;
    const next = change(turn);
    if (next !== turn) writeTurn(sessionId, next);
}
