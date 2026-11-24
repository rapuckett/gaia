// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Schedule } from '@/api/client.types';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ScheduleCard } from './ScheduleCard';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <SheetHost>{children}</SheetHost>
            </ThemeProvider>
        </SafeAreaProvider>
    </QueryClientProvider>
);

const failed = {
    id: 's1',
    name: 'inbox-triage',
    interval_seconds: 7200,
    prompt: 'Summarize my email',
    status: 'active',
    created_at: null,
    last_run_at: null,
    next_run_at: null,
    last_result: null,
    run_count: 1,
    error_count: 1,
    session_id: null,
    schedule_config: null,
    description: 'Every 2 hours',
    description_parts: { kind: 'interval', seconds: 7200 },
    last_error: 'The step "send email" needs approval',
} as unknown as Schedule;

describeNative('the schedule card failure strip', () => {
    it('puts the PC error on its own left-to-right line, apart from the translated label', async () => {
        await render(<ScheduleCard schedule={failed} now={new Date()} runPending={false} onOpenChat={() => {}} onRunNow={() => {}} onToggleStatus={() => {}} onDelete={() => {}} onEdit={() => {}} />, { wrapper: wrap });
        const line = screen.getByText('The step "send email" needs approval');
        expect(line.props.style).toEqual(expect.objectContaining({ writingDirection: 'ltr' }));
    });
});

describeNative('the schedule delete dialog', () => {
    const mount = (schedule: Schedule, onDelete = jest.fn()) =>
        render(<ScheduleCard schedule={schedule} now={new Date()} runPending={false} onOpenChat={() => {}} onRunNow={() => {}} onToggleStatus={() => {}} onDelete={onDelete} onEdit={() => {}} />, { wrapper: wrap });

    it('says what deleting does, and deletes only on confirm', async () => {
        const onDelete = jest.fn();
        await mount({ ...failed, session_id: 'chat-1' } as Schedule, onDelete);
        await fireEvent.press(screen.getByText('Delete'));
        expect(await screen.findByText('Delete the schedule "inbox-triage"?')).toBeTruthy();
        expect(await screen.findByText("It won't run again, and the run history shown here is deleted. This can't be undone.")).toBeTruthy();
        expect(await screen.findByText('Its chat stays, with the answers from past runs.')).toBeTruthy();
        expect(screen.queryByText('The run in progress stops now.')).toBeNull();
        expect(onDelete).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByTestId('confirm-ok'));
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('adds the run-stops line only while a run is in progress', async () => {
        await mount({ ...failed, running: true } as Schedule);
        await fireEvent.press(screen.getByText('Delete'));
        expect(await screen.findByText('The run in progress stops now.')).toBeTruthy();
        expect(screen.queryByText('Its chat stays, with the answers from past runs.')).toBeNull();
    });
});
