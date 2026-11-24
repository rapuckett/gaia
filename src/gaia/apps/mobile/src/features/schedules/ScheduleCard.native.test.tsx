// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Schedule } from '@/api/client.types';
import { ThemeProvider } from '@/ui';

import { ScheduleCard } from './ScheduleCard';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>{children}</ThemeProvider>
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
        await render(<ScheduleCard schedule={failed} now={new Date()} runPending={false} onOpenChat={() => {}} onRunNow={() => {}} onToggleStatus={() => {}} onDelete={() => {}} />, { wrapper: wrap });
        const line = screen.getByText('The step "send email" needs approval');
        expect(line.props.style).toEqual(expect.objectContaining({ writingDirection: 'ltr' }));
    });
});
