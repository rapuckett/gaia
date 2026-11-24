// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AgentStep } from '@webui/types';
import { Platform } from 'react-native';

import type { StreamEvent } from '@/api/client.types';
import { translator } from '@/i18n/useT';
import { useLocaleStore } from '@/state/locale';
import { ThemeProvider } from '@/ui';

import { ActivityTimeline } from './ActivityTimeline';
import { stepsFromEvents } from './stepsFromEvents';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const DONE = 'Downloaded the speech model (2.4 GB)';

const call = (id: number, extra: Partial<AgentStep> = {}): AgentStep => ({
    id, type: 'tool', label: 'Using tool', tool: 'run_shell_command', narration: 'Running echo', active: false, success: true, timestamp: id, ...extra,
});

describeNative('a download the user waited on', () => {
    it('stays in the turn after later steps, drawn as done rather than as a warning', async () => {
        const events = [
            { type: 'status', status: 'working', phase: 'speech_model_download', message: 'Downloading the speech model, one time (2.4 GB)' },
            { type: 'status', status: 'working', phase: 'speech_model_downloaded', message: DONE },
            { type: 'tool_start', tool: 'transcribe_media', detail: 'path: a.wav', narration: 'Transcribing a.wav' },
            { type: 'tool_result', success: true, summary: 'done' },
        ] as StreamEvent[];
        const steps = stepsFromEvents(events, translator('en'));
        expect(steps.filter((s) => s.kept)).toHaveLength(1);

        await render(<ActivityTimeline steps={steps} />, { wrapper: ThemeProvider });
        await fireEvent.press(screen.getByRole('button'));
        expect(screen.getByText(DONE)).toBeTruthy();
        expect(screen.getByTestId('kept-step')).toBeTruthy();
    });
});

describeNative('a gated call GAIA turned down unasked', () => {
    it('says so, apart from a decline by the person and from a timeout', async () => {
        const steps = [
            call(1, { autoDeclined: true, success: false }),
            call(2, { tool: 'write_file', narration: undefined, declined: true, success: false }),
            call(3, { tool: 'read_file', narration: undefined, timedOut: true, success: false }),
        ];
        await render(<ActivityTimeline steps={steps} />, { wrapper: ThemeProvider });
        await fireEvent.press(screen.getByRole('button'));
        expect(screen.getByText('Not run, not needed for this request: Running command')).toBeTruthy();
        expect(screen.getByText(/^You declined: /)).toBeTruthy();
        expect(screen.getByText(/^Timed out, nothing ran: /)).toBeTruthy();
    });

    it('is read from the stream as autoDeclined, not declined', () => {
        const events = [
            { type: 'tool_start', tool: 'run_shell_command', detail: 'command: echo hi' },
            { type: 'tool_result', status: 'denied', declined_by: 'agent', success: false, summary: 'Not run' },
        ] as StreamEvent[];
        expect(stepsFromEvents(events, translator('en'))[0]).toMatchObject({ autoDeclined: true });
        expect(stepsFromEvents(events, translator('en'))[0]!.declined).toBeFalsy();
    });
});

describeNative('a failed shell step in Arabic', () => {
    afterEach(() => useLocaleStore.getState().setLocale(null));

    it('translates the exit line above the terminal card', async () => {
        useLocaleStore.getState().setLocale('ar');
        const steps = [call(1, { success: false, result: 'exit 2', commandOutput: { command: 'ls', stdout: '', stderr: 'x', returnCode: 2 } as never })];
        await render(<ActivityTimeline steps={steps} />, { wrapper: ThemeProvider });
        await fireEvent.press(screen.getAllByRole('button')[0]);
        expect(screen.queryByText('exit 2')).toBeNull();
        expect(screen.getAllByText(/رمز الخروج/).length).toBeGreaterThan(0);
    });
});

describeNative('an open failed shell step', () => {
    it('says its exit code once, in the terminal card', async () => {
        const steps = [call(1, { success: false, result: 'exit 2', commandOutput: { command: 'ls', stdout: '', stderr: 'x', returnCode: 2 } as never })];
        await render(<ActivityTimeline steps={steps} />, { wrapper: ThemeProvider });
        await fireEvent.press(screen.getAllByRole('button')[0]);
        expect(screen.getAllByText(/exit/i)).toHaveLength(1);
    });
});

describeNative('step rows with a folded thought', () => {
    it('each get their own testID', async () => {
        const thought = (id: number): AgentStep => ({ id, type: 'thinking', label: 'Thinking', detail: `plan ${id}`, active: false, timestamp: id });
        const steps = [thought(1), call(2, { detail: 'command: a' }), thought(3), call(4, { detail: 'command: b' })];
        await render(<ActivityTimeline steps={steps} />, { wrapper: ThemeProvider });
        await fireEvent.press(screen.getByRole('button'));
        expect(screen.getByTestId('step-row-1')).toBeTruthy();
        expect(screen.getByTestId('step-row-3')).toBeTruthy();
        expect(screen.queryByTestId('step-row--1')).toBeNull();
    });
});
