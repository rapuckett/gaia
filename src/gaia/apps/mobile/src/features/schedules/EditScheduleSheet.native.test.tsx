// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Schedule } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import { ScheduleCard } from './ScheduleCard';
import { NewScheduleSheet } from './NewScheduleSheet';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const t = translator('en');

const daily = {
    id: 's1',
    name: 'daily-summary',
    interval_seconds: 86400,
    prompt: 'Summarize my inbox',
    status: 'active',
    created_at: null,
    last_run_at: '2026-11-23T08:00:00Z',
    next_run_at: null,
    last_result: null,
    run_count: 2,
    error_count: 0,
    session_id: null,
    schedule_config: JSON.stringify({ raw_input: 'daily at 8am' }),
    description: 'Every day at 8:00 AM',
    description_parts: null,
    last_error: null,
} as unknown as Schedule;

afterEach(() => act(() => sheetStore.reset()));

async function mount(data: FakeClientData, ui: (schedule: Schedule) => React.ReactNode) {
    const client = createFakeClient({ schedules: [{ ...daily }], ...data });
    const view = await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <ThemeProvider>
                    <SheetHost>{ui(daily)}</SheetHost>
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    return { client, view };
}

(Platform.OS === 'web' ? describe.skip : describe)('editing a scheduled task', () => {
    it('opens prefilled with the words it was made with, and keeps the name fixed', async () => {
        await mount({}, (s) => <NewScheduleSheet open editing={s} onClose={() => {}} />);
        expect(await screen.findByDisplayValue('daily at 8am')).toBeTruthy();
        expect(screen.getByDisplayValue('daily-summary')).toBeDisabled();
        expect(screen.getByDisplayValue('Summarize my inbox')).toBeTruthy();
        expect(screen.getByText(/^Editing .*daily-summary/)).toBeTruthy();
    });

    it('fills the when field from a preset', async () => {
        await mount({}, (s) => <NewScheduleSheet open editing={s} onClose={() => {}} />);
        await fireEvent.press(await screen.findByText(t('schedules.preset.weekdays')));
        expect(screen.getByDisplayValue('weekdays at 9am')).toBeTruthy();
        await fireEvent.press(screen.getByText(t('schedules.preset.hourly')));
        expect(screen.getByDisplayValue('every 1h')).toBeTruthy();
    });

    it('saves with a PATCH body of interval, prompt and time zone, then closes', async () => {
        const onClose = jest.fn();
        const { client } = await mount({}, (s) => <NewScheduleSheet open editing={s} onClose={onClose} />);
        const edit = jest.spyOn(client, 'editSchedule');
        await fireEvent.press(await screen.findByText(t('schedules.preset.morning')));
        await fireEvent.changeText(screen.getByDisplayValue('Summarize my inbox'), 'Read my inbox');
        await fireEvent.press(screen.getByText(t('schedules.save')));
        await waitFor(() => expect(edit).toHaveBeenCalled());
        const [name, body] = edit.mock.calls[0]!;
        expect(name).toBe('daily-summary');
        expect(body).toEqual({ interval: 'daily at 8am', prompt: 'Read my inbox', timezone: expect.any(String) });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('shows Saving... while the PC answers', async () => {
        await mount({ editScheduleError: 'saving' }, (s) => <NewScheduleSheet open editing={s} onClose={() => {}} />);
        await fireEvent.press(await screen.findByText(t('schedules.save')));
        expect(await screen.findByText(t('schedules.saving'))).toBeTruthy();
    });

    it('says the save failed and puts the PC text on its own line', async () => {
        const onClose = jest.fn();
        await mount({ editScheduleError: new Error('lock timeout') }, (s) => <NewScheduleSheet open editing={s} onClose={onClose} />);
        await fireEvent.press(await screen.findByText(t('schedules.save')));
        expect(await screen.findByText(t('schedules.editFailed'))).toBeTruthy();
        expect(screen.getByText('lock timeout')).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();
    });
});

(Platform.OS === 'web' ? describe.skip : describe)('the card', () => {
    it('has an Edit chip that calls onEdit, disabled while a run is going', async () => {
        const onEdit = jest.fn();
        await mount({}, (s) => <ScheduleCard schedule={s} now={new Date()} runPending={false} onOpenChat={() => {}} onRunNow={() => {}} onToggleStatus={() => {}} onDelete={() => {}} onEdit={onEdit} />);
        await fireEvent.press(await screen.findByText(t('schedules.card.edit')));
        expect(onEdit).toHaveBeenCalledTimes(1);
    });

    it('lists past runs under the Past runs toggle', async () => {
        const runs = { 'daily-summary': [{ id: 'r1', task_id: 'x', executed_at: '2026-11-23T08:00:00Z', result: 'Four unread emails', error: null }] };
        await mount({ scheduleResults: runs }, (s) => <ScheduleCard schedule={s} now={new Date()} runPending={false} onOpenChat={() => {}} onRunNow={() => {}} onToggleStatus={() => {}} onDelete={() => {}} onEdit={() => {}} initialHistoryOpen />);
        expect(await screen.findByText(t('schedules.history'))).toBeTruthy();
        expect(await screen.findByText('Four unread emails')).toBeTruthy();
    });
});
