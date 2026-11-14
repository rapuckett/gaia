// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { SERVER_CANCELLED_TEXT, splitCutOff } from '@webui/utils/turnEnding.core';

import type { Message, StreamEvent } from '@/api/client.types';
import type { GaiaError } from '@/api/errors';
import type { ChatStream } from '@/data';

import { mayStillFinish } from './chatErrors';
import type { Stop } from './EndingNotes';

export interface TurnTail {
    /** The turn is running: the answer streams and shows its live line. */
    live: boolean;
    text: string;
    events: readonly StreamEvent[];
    stop?: Stop;
    error?: GaiaError;
    /** The saved reply a retry replaces; null for one that was never saved. */
    replyId: number | null;
    canTryAgain: boolean;
    canContinue: boolean;
}

type Turn = Pick<ChatStream, 'status' | 'liveText' | 'events' | 'error' | 'stopState' | 'stopError'>;

/**
 * What goes under the saved messages: the running turn, how the last one ended
 * (stopped, failed, cut off) and its Try again and Continue. Those two go on the
 * latest reply only, never while busy. Null when there is nothing to show.
 */
export function buildTail(messages: readonly Message[], turn: Turn): TurnTail | null {
    const busy = turn.status !== 'idle';
    const last = messages.filter((m) => m.role !== 'system').at(-1);
    const lastReply = last?.role === 'assistant' ? last : undefined;
    const cancelled = lastReply?.content.trim() === SERVER_CANCELLED_TEXT;
    const cutOff = lastReply ? splitCutOff(lastReply.content) : null;
    // A stop GAIA never confirmed has no saved reply: its text comes from the turn.
    const stopOnSaved = !busy && !!turn.stopState && !!lastReply && !(turn.stopState === 'unconfirmed' && turn.liveText);

    if (busy) {
        return { live: true, text: turn.liveText, events: turn.events, error: turn.error ?? undefined, replyId: null, canTryAgain: false, canContinue: false };
    }
    if (stopOnSaved && lastReply) {
        const stoppedCleanly = turn.stopState === 'stopped' && !turn.stopError;
        const hasText = lastReply.content.trim() !== '' && !cancelled && !cutOff;
        return {
            live: false,
            text: '',
            events: [],
            // The saved "Cancelled." reply already carries its own note.
            stop: cancelled ? undefined : { state: turn.stopState!, error: turn.stopError },
            replyId: lastReply.id,
            canTryAgain: stoppedCleanly,
            canContinue: stoppedCleanly && hasText,
        };
    }
    if (turn.error || turn.liveText || turn.stopState) {
        const failed = !!turn.error && !mayStillFinish(turn.error);
        const stop: Stop | undefined = turn.stopState ? { state: turn.stopState, error: turn.stopError } : undefined;
        return {
            live: false,
            text: turn.liveText,
            events: turn.events,
            stop,
            error: turn.error ?? undefined,
            replyId: null,
            canTryAgain: failed || (stop?.state === 'stopped' && !stop.error),
            canContinue: false,
        };
    }
    if (lastReply && (cutOff || cancelled)) {
        return { live: false, text: '', events: [], replyId: lastReply.id, canTryAgain: true, canContinue: false };
    }
    return null;
}
