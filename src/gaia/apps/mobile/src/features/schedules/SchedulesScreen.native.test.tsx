// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createHttpClient } from '@/api/http';
import type { Schedule } from '@/api/client.types';
import { GaiaClientProvider } from '@/data';
import { openChat } from '@/features/nav/navigation';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { SheetScope, ThemeProvider } from '@/ui';

import { SCHEDULE_SCENES } from './devScenes';
import { SchedulesScreen } from './SchedulesScreen';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-router', () => ({
    useNavigation: () => ({ canGoBack: () => false, goBack: jest.fn(), openDrawer: jest.fn(), toggleDrawer: jest.fn(), getParent: () => undefined }),
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const BASE = 'http://192.168.1.20:4200';
const DAILY: Schedule = SCHEDULE_SCENES.list.data.schedules![0]!;
const RUNS = [{ id: 'r1', task_id: 'x', executed_at: '2026-11-23T08:00:00Z', result: 'Four unread emails', error: null }];

/** The real HTTP client against a fake PC that keeps one schedule's status. */
async function mountScreen(onOpenChat: (id: string) => void = () => {}) {
    let status: Schedule['status'] = DAILY.status;
    const { fetch, calls } = createRecordingFetch((call) => {
        const url = call.url.slice(BASE.length);
        if (call.method === 'PUT') {
            status = (JSON.parse(call.body!) as { status: Schedule['status'] }).status;
            return jsonResponse({ ...DAILY, status });
        }
        if (url.endsWith('/run')) return jsonResponse({ ...DAILY, running: true });
        if (url.includes('/results')) return jsonResponse({ results: RUNS, total: 1 });
        return jsonResponse({ schedules: [{ ...DAILY, status }], total: 1 });
    });
    const client = createHttpClient({ baseUrl: BASE, token: null, fetch });
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetScope>
                            <SchedulesScreen onOpenChat={onOpenChat} onOpenAutomations={() => {}} />
                        </SheetScope>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    return { calls };
}

describeNative('SCH-06 tapping a schedule card opens its chat', () => {
    it('SCH-06: the card tap replaces the route with that schedule chat', async () => {
        const router = { replace: jest.fn() } as unknown as Parameters<typeof openChat>[0];
        await mountScreen((id) => openChat(router, id));
        await fireEvent.press(await screen.findByTestId(`schedule-card-${DAILY.name}`));
        expect(router.replace).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: DAILY.session_id } });
        expect(screen.queryByText('Open Chat')).toBeNull();
        expect(screen.getByTestId(`schedule-card-${DAILY.name}`).props.accessibilityHint).toBe('Opens its chat');
    });
});

describeNative('SCH-07 Run now', () => {
    it('SCH-07: Run now posts to that schedule run endpoint with no body', async () => {
        const { calls } = await mountScreen();
        await fireEvent.press(await screen.findByTestId(`schedule-run-${DAILY.name}`));
        await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
        const post = calls.find((c) => c.method === 'POST')!;
        expect(post.url).toBe(`${BASE}/api/schedules/${DAILY.name}/run`);
        expect(post.body).toBeUndefined();
    });
});

describeNative('SCH-08 Pause and Resume', () => {
    it('SCH-08: Pause then Resume PUT the new status, and the pill and label flip', async () => {
        const { calls } = await mountScreen();
        expect(await screen.findByText('Active')).toBeTruthy();
        await fireEvent.press(screen.getByText('Pause'));
        expect(await screen.findByText('Paused')).toBeTruthy();
        expect(screen.getByText('Resume')).toBeTruthy();
        await fireEvent.press(screen.getByText('Resume'));
        expect(await screen.findByText('Active')).toBeTruthy();
        expect(screen.getByText('Pause')).toBeTruthy();
        const puts = calls.filter((c) => c.method === 'PUT');
        expect(puts.map((c) => [c.url, JSON.parse(c.body!)])).toEqual([
            [`${BASE}/api/schedules/${DAILY.name}`, { status: 'paused' }],
            [`${BASE}/api/schedules/${DAILY.name}`, { status: 'active' }],
        ]);
    });
});

describeNative('SCH-10 Past runs', () => {
    it('SCH-10: opening Past runs reads that schedule results and lists them', async () => {
        const { calls } = await mountScreen();
        await fireEvent.press(await screen.findByText('Past runs'));
        expect(await screen.findByText('Four unread emails')).toBeTruthy();
        const read = calls.find((c) => c.url.includes('/results'))!;
        expect(read).toMatchObject({ url: `${BASE}/api/schedules/${DAILY.name}/results?limit=20`, method: 'GET' });
    });
});

describeNative('the empty list', () => {
    it('shows the clock empty state with a New schedule button that opens the create sheet', async () => {
        const { fetch } = createRecordingFetch(() => jsonResponse({ schedules: [], total: 0 }));
        const client = createHttpClient({ baseUrl: BASE, token: null, fetch });
        await render(
            <QueryClientProvider client={new QueryClient()}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetScope>
                                <SchedulesScreen onOpenChat={() => {}} onOpenAutomations={() => {}} />
                            </SheetScope>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        expect(await screen.findByTestId('schedules-empty')).toBeTruthy();
        expect(screen.getByText('No scheduled tasks yet')).toBeTruthy();
        expect(screen.getByText('Make one to have GAIA run a job for you on a schedule, like a morning summary.')).toBeTruthy();
        expect(screen.queryByTestId('schedules-new')).toBeNull();
        await fireEvent.press(screen.getByTestId('schedules-empty-new'));
        expect(await screen.findByText('Create schedule')).toBeTruthy();
    });
});
