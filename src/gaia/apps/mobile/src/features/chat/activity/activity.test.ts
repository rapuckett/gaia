// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { consolidateSteps, matchesStepFilter, stepsSummary, toolRowText } from '@webui/utils/agentActivity.core';

import type { StreamEvent } from '@/api/client.types';
import { translator } from '@/i18n/useT';
import { stampArrival } from '@/state/eventArrival';

import { liveStatusLine } from '../liveStatus';
import { endRunningSteps, stepsFromEvents } from './stepsFromEvents';
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

describe('waiting for the GPU', () => {
    const queued = event({ type: 'status', status: 'working', phase: 'queued', queue_position: 2, message: 'Waiting for the GPU \u2014 2nd in line' });
    const state = { waitingOnPerson: false, answering: false };

    it('says the place in line in English', () => {
        expect(liveStatusLine([queued], state, t)).toBe('Waiting for the GPU, #\u20662\u2069 in line');
    });

    it('says it in Arabic with the number kept left to right', () => {
        const line = liveStatusLine([queued], state, translator('ar'));
        expect(line).toContain('\u0641\u064a \u0627\u0646\u062a\u0638\u0627\u0631');
        expect(line).toMatch(/\u20662\u2069/);
        expect(line).not.toContain('2nd');
    });

    it('keeps the raw message for another phase', () => {
        const other = event({ type: 'status', status: 'working', phase: 'warming', message: 'Warming up the model' });
        expect(liveStatusLine([other], state, t)).toBe('Warming up the model');
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

describe('a step still running when the turn ends', () => {
    const steps = stepsFromEvents([event({ type: 'tool_start', tool: 'sleep', narration: 'Waiting' })], t);

    it('stops and keeps the time it had run', () => {
        expect(steps[0]!.active).toBe(true);
        const [ended] = endRunningSteps(steps, steps[0]!.timestamp + 13_000);
        expect(ended).toMatchObject({ active: false, latencyMs: 13_000 });
    });

    it('keeps its spinner in a live turn, where nothing ends it', () => {
        expect(consolidateSteps(steps, true)[0]).toMatchObject({ active: true });
    });
});

describe('a step\'s time comes from when its event arrived', () => {
    const start = stampArrival(event({ type: 'tool_start', tool: 'sleep', narration: 'Waiting' }), 50_000);

    it('freezes at the real duration even when the steps are rebuilt later', () => {
        const rebuilt = stepsFromEvents([start, stampArrival(event({ type: 'agent_error', content: 'Connection lost' }), 62_000)], t);
        const [ended] = endRunningSteps(rebuilt, 62_000);
        expect(ended).toMatchObject({ active: false, latencyMs: 12_000 });
    });

    it('does not move a live step when a later event arrives', () => {
        const later = stampArrival(event({ type: 'status', status: 'working', message: 'Still going' }), 58_000);
        expect(stepsFromEvents([start], t)[0]!.timestamp).toBe(50_000);
        expect(stepsFromEvents([start, later], t).find((s) => s.type === 'tool')!.timestamp).toBe(50_000);
    });
});
