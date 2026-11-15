// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { consolidateSteps, stepsSummary, toolRowText } from '@webui/utils/agentActivity.core';

import type { StreamEvent } from '@/api/client.types';
import { translator } from '@/i18n/useT';

import { liveStatusLine } from '../liveStatus';
import { stepsFromEvents } from './stepsFromEvents';

const t = translator('en');

function event(partial: Partial<StreamEvent> & { type: string }): StreamEvent {
    return partial as StreamEvent;
}

describe('a turn with a tool call, a declined call and an error', () => {
    const events = [
        event({ type: 'tool_start', tool: 'web_search', detail: 'query: cats', narration: 'Searching web: cats' }),
        event({ type: 'tool_result', success: true, summary: 'Found 3 results', latency_ms: 800 }),
        event({ type: 'tool_start', tool: 'read_file', detail: 'path: notes.txt' }),
        event({ type: 'tool_result', status: 'denied', success: false, summary: 'Denied' }),
        event({ type: 'agent_error', content: 'The model stopped responding' }),
    ];

    it('folds to the step summary and the row texts', () => {
        const rows = consolidateSteps(stepsFromEvents(events, t), false);
        expect(rows.map((r) => r.type)).toEqual(['tool', 'tool', 'error']);
        expect(rows[0]).toMatchObject({ result: 'Found 3 results', success: true, active: false });
        expect(rows[1]).toMatchObject({ declined: true, active: false });
        expect(toolRowText(rows[0]!, t)).toBe('Searching web: cats');
        expect(toolRowText(rows[1]!, t)).toBe('You declined: Reading file');
        expect(stepsSummary(rows, t)).toBe('Searched web, you declined a step, hit an error');
    });
});

describe('a model retry', () => {
    const retry = (n: number) => `The model service is busy — retrying in 3s (${n}/4)`;
    const notice = (n: number) => [
        event({ type: 'status', status: 'warning', message: retry(n) }),
        event({ type: 'status', status: 'working', phase: 'model_retry', message: retry(n) }),
    ];

    it('is one live line that a second retry replaces, and not a step per retry', () => {
        const events = [...notice(1), ...notice(2)];
        expect(liveStatusLine(events, { waitingOnPerson: false, answering: false }, t)).toBe(retry(2));
        expect(stepsFromEvents(events, t)).toEqual([]);
    });

    it('is gone once the turn moves on', () => {
        const events = [...notice(1), event({ type: 'thinking', content: 'hm' })];
        expect(liveStatusLine(events, { waitingOnPerson: false, answering: false }, t)).toBeNull();
    });
});
