// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { SERVER_CANCELLED_TEXT, splitCutOff, type CutOff } from '@webui/utils/turnEnding.core';

import type { Message, StreamEvent } from '@/api/client.types';
import type { GaiaError } from '@/api/errors';
import type { ChatStream } from '@/data';

import { mayStillFinish } from './chatErrors';

export interface Stop {
    state: 'stopped' | 'unconfirmed';
    error?: GaiaError;
}

export type ChatRow =
    | { key: string; kind: 'user'; text: string }
    | {
          key: string;
          kind: 'reply';
          text: string;
          /** The turn is running: the bubble streams and shows its live line. */
          live: boolean;
          events: readonly StreamEvent[];
          stop?: Stop;
          cutOff?: CutOff;
          error?: GaiaError;
          /** The saved reply a retry replaces; null for one that was never saved. */
          replyId: number | null;
          canTryAgain: boolean;
          canContinue: boolean;
      };

type Turn = Pick<ChatStream, 'status' | 'liveText' | 'events' | 'error' | 'stopState' | 'stopError'>;

/** The saved messages and the live turn as one list. Try again and Continue go on the latest reply only, never while busy. */
export function buildRows(messages: readonly Message[], turn: Turn): ChatRow[] {
    const saved = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    const busy = turn.status !== 'idle';
    const lastSaved = saved[saved.length - 1];
    // A stop GAIA never confirmed has no saved reply: its text comes from the turn.
    const stopOnSaved = !busy && !!turn.stopState && lastSaved?.role === 'assistant' && !(turn.stopState === 'unconfirmed' && turn.liveText);
    const showTail = busy || !!turn.error || !!turn.liveText || (!!turn.stopState && !stopOnSaved);

    const rows: ChatRow[] = saved.map((m, i): ChatRow => {
        if (m.role === 'user') return { key: `m${m.id}`, kind: 'user', text: m.content };
        const latest = i === saved.length - 1 && !showTail;
        const cutOff = splitCutOff(m.content) ?? undefined;
        const cancelled = m.content.trim() === SERVER_CANCELLED_TEXT;
        const stop: Stop | undefined =
            latest && stopOnSaved ? { state: turn.stopState!, error: turn.stopError } : cancelled ? { state: 'stopped' } : undefined;
        const text = cancelled ? '' : cutOff ? cutOff.body : m.content;
        const stoppedCleanly = stop?.state === 'stopped' && !stop.error;
        const canTryAgain = latest && !busy && (!!cutOff || stoppedCleanly);
        return {
            key: `m${m.id}`,
            kind: 'reply',
            text,
            live: false,
            events: [],
            stop,
            cutOff,
            replyId: m.id,
            canTryAgain,
            canContinue: canTryAgain && stoppedCleanly && text.trim() !== '',
        };
    });

    if (showTail) {
        const stop: Stop | undefined = turn.stopState ? { state: turn.stopState, error: turn.stopError } : undefined;
        const failed = !!turn.error && !mayStillFinish(turn.error);
        rows.push({
            key: 'turn',
            kind: 'reply',
            text: turn.liveText,
            live: busy,
            events: turn.events,
            stop,
            error: turn.error ?? undefined,
            replyId: null,
            canTryAgain: !busy && (failed || (stop?.state === 'stopped' && !stop.error)),
            canContinue: false,
        });
    }
    return rows;
}
