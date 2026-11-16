// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createFakeClient, type FakeClientData } from '@/api/fake';
import type { ScheduleDescription } from '@webui/types';

import type { GaiaClient, Schedule, ScheduleResult } from '@/api/client.types';

import type { SchedulesDevStart } from './SchedulesScreen';

/** The Schedules screen in one state: the fake PC's schedules and what a tap would have opened. */
export interface SchedulesScene {
    data: FakeClientData;
    dev?: SchedulesDevStart;
}

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const every = (count: number, unit: ScheduleDescription['unit']): ScheduleDescription => ({ kind: 'every', count, unit, days: null, time: null, start_hour: null, end_hour: null });
const daily = (time: string): ScheduleDescription => ({ kind: 'daily', count: null, unit: null, days: null, time, start_hour: null, end_hour: null });
const weekdays: ScheduleDescription = { kind: 'days', count: null, unit: null, days: [0, 1, 2, 3, 4], time: '08:00', start_hour: null, end_hour: null };

const schedule = (name: string, over: Partial<Schedule> = {}): Schedule => ({
    id: `id-${name}`, name, interval_seconds: 3600, prompt: 'Summarize my unread email and list what needs a reply.', status: 'active',
    created_at: hoursFromNow(-200), last_run_at: hoursFromNow(-3), next_run_at: hoursFromNow(5), last_result: 'Done', run_count: 12, error_count: 0,
    session_id: `chat-${name}`, schedule_config: null, description: 'Every day at 8:00 AM', description_parts: daily('08:00'), last_error: null, ...over,
});

const DAILY = schedule('daily-summary');
const WEEKDAYS = schedule('standup-notes', { prompt: 'Collect yesterday\'s commits and write the standup note.', description_parts: weekdays, description: 'Weekdays at 8:00 AM', run_count: 40 });
const PAUSED = schedule('weekly-backup-check', { status: 'paused', next_run_at: null, description_parts: every(1, 'week'), description: 'Every week', prompt: 'Check that the weekend backup finished.' });
const FAILED = schedule('inbox-triage', { run_count: 9, error_count: 3, last_error: 'The step "send email" needs approval, so the run stopped.', description_parts: every(2, 'hour'), description: 'Every 2 hours' });
const RUNNING = schedule('news-digest', { running: true, description_parts: every(30, 'minute'), description: 'Every 30 minutes', prompt: 'Read the day\'s headlines and write a three-line digest.' });
const SOON = schedule('water-reminder', { next_run_at: new Date(Date.now() + 40_000).toISOString(), description_parts: every(1, 'hour'), description: 'Every hour', prompt: 'Remind me to drink water.' });
const LONG = schedule('quarterly-report-with-a-very-long-schedule-name-that-wraps', { prompt: 'Pull every revenue figure from the finance folder, compare it with the previous quarter, flag anything that moved by more than ten percent, and draft three paragraphs for the board pack. '.repeat(2) });

const run = (id: string, hours: number, over: Partial<ScheduleResult> = {}): ScheduleResult => ({
    id, task_id: 'x', executed_at: hoursFromNow(-hours), result: 'You have 4 unread emails. Two need a reply: the invoice from Acme and the dentist.', error: null, ...over,
});

const RESULTS: Record<string, ScheduleResult[]> = {
    'daily-summary': [run('r1', 3), run('r2', 27, { result: '' }), run('r3', 51, { error: 'The PC was asleep, so this run was missed.' })],
    'inbox-triage': [run('r4', 2, { result: null, error: 'The step "send email" needs approval, so the run stopped.' }), run('r5', 4)],
    'weekly-backup-check': [],
};

const COMMON: FakeClientData = { schedules: [DAILY, WEEKDAYS, PAUSED], scheduleResults: RESULTS };

const scene = (over: Partial<SchedulesScene> = {}): SchedulesScene => ({ ...over, data: { ...COMMON, ...over.data } });

export const SCHEDULE_SCENES = {
    list: scene({ data: { schedules: [DAILY, WEEKDAYS, PAUSED, FAILED, RUNNING] } }),
    empty: scene({ data: { schedules: [] } }),
    paused: scene({ data: { schedules: [PAUSED, DAILY] } }),
    failed: scene({ data: { schedules: [FAILED, DAILY] } }),
    running: scene({ data: { schedules: [RUNNING, DAILY] } }),
    countdown: scene({ data: { schedules: [SOON, DAILY] } }),
    'long-text': scene({ data: { schedules: [LONG, DAILY] } }),
    'new-empty': scene({ dev: { form: { when: '', name: '', prompt: '' } } }),
    'new-valid': scene({ dev: { form: { when: 'every weekday at 8am', name: 'standup-notes', prompt: 'Write the standup note from yesterday\'s commits.' } } }),
    'new-invalid': scene({ dev: { form: { when: 'whenever', name: 'standup-notes', prompt: 'Write the standup note.' } } }),
    edit: scene({ data: { schedules: [DAILY, PAUSED] }, dev: { form: { when: 'Every day at 8:00 AM', name: 'daily-summary', prompt: DAILY.prompt } } }),
    'delete-confirm': scene({ dev: { confirmDelete: 'daily-summary' } }),
    history: scene({ dev: { historyOpen: 'daily-summary' } }),
    'history-failed': scene({ data: { schedules: [FAILED, DAILY] }, dev: { historyOpen: 'inbox-triage' } }),
    'history-empty': scene({ dev: { historyOpen: 'weekly-backup-check' } }),
    'action-error': scene({ dev: { error: "Schedule 'daily-summary' is already running" } }),
} satisfies Record<string, SchedulesScene>;

export type ScheduleSceneName = keyof typeof SCHEDULE_SCENES;

export function schedulesSceneClient(found: SchedulesScene): GaiaClient {
    return createFakeClient(found.data);
}
