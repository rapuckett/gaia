// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { consolidateSteps, matchesStepFilter, stepsSummary, toolRowText } from '@webui/utils/agentActivity.core';

import type { StreamEvent } from '@/api/client.types';
import { translator } from '@/i18n/useT';

import { stepsFromEvents } from './stepsFromEvents';
import { TERMINAL_HARD_CAP_CHARS, terminalWindow } from './terminalText';

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

describe('the steps filter', () => {
    const rows = consolidateSteps(
        stepsFromEvents(
            [
                event({ type: 'tool_start', tool: 'web_search', detail: 'query: cats' }),
                event({ type: 'tool_result', success: true, summary: 'ok' }),
                event({ type: 'tool_start', tool: 'read_file', detail: 'path: a.txt' }),
                event({ type: 'tool_result', success: false, summary: 'missing' }),
            ],
            t,
        ),
        false,
    );
    const kept = (name: string, status: 'all' | 'success' | 'error') =>
        rows.filter((r) => matchesStepFilter(r, name, status, t)).map((r) => r.tool);

    it('sifts tool rows by name and by outcome, together', () => {
        expect(kept('', 'all')).toEqual(['web_search', 'read_file']);
        expect(kept('READ', 'all')).toEqual(['read_file']);
        expect(kept('', 'success')).toEqual(['web_search']);
        expect(kept('', 'error')).toEqual(['read_file']);
        expect(kept('read', 'success')).toEqual([]);
    });
});

describe('terminal output window', () => {
    const long = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');

    it('folds a long log to a preview and expands to the whole', () => {
        expect(terminalWindow('ok', false)).toMatchObject({ text: 'ok', collapsible: false });
        const folded = terminalWindow(long, false);
        expect(folded.collapsible).toBe(true);
        expect(folded.text.split('\n').length).toBeLessThan(25);
        expect(terminalWindow(long, true).text).toBe(long);
    });

    it('never renders past the hard cap, even expanded', () => {
        const huge = 'x'.repeat(TERMINAL_HARD_CAP_CHARS * 5);
        const view = terminalWindow(huge, true);
        expect(view.text.length).toBe(TERMINAL_HARD_CAP_CHARS);
        expect(view.capped).toBe(true);
    });
});
