// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Goal } from '@/api/client.types';
import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { createRecordingFetch, jsonResponse, type RecordedCall } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { MemoryScreen } from './MemoryScreen';
import { SAMPLE_GOALS } from './devScenes';

// The PC's routes (src/gaia/ui/routers/memory.py, goals.py): each maintenance action is a bodyless POST to
// /api/memory/<action>; Accept and Reject are bodyless PUTs to /api/goals/{id}/approve and /reject. The phone
// sends the same, so there is no mismatch.

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const BASE = 'http://192.168.1.20:4200';
const AUTH = { Authorization: 'Bearer tok-1' };

const MAINTENANCE: [string, string, string][] = [
    ['consolidate', '/api/memory/consolidate', 'Consolidated 3 sessions, extracted 12 items'],
    ['rebuildEmbeddings', '/api/memory/rebuild-embeddings', 'Backfilled 6 embeddings'],
    ['reconcile', '/api/memory/reconcile', 'Checked 4 pairs: 1 reinforced, 0 contradicted'],
    ['refreshSystemContext', '/api/memory/refresh-system-context', 'System context refreshed: 7 facts updated'],
    ['rebuildFts', '/api/memory/rebuild-fts', 'FTS indexes rebuilt successfully'],
];

function mount() {
    let goals: Goal[] = SAMPLE_GOALS.map((g) => ({ ...g }));
    const { fetch, calls } = createRecordingFetch((call) => {
        const url = new URL(call.url);
        const goalAction = /^\/api\/goals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
        if (call.method === 'PUT' && goalAction) {
            const status = goalAction[2] === 'approve' ? 'queued' : 'rejected';
            goals = goals.map((g) => (g.id === goalAction[1] ? { ...g, status } : g));
            return jsonResponse(goals.find((g) => g.id === goalAction[1]));
        }
        if (url.pathname === '/api/memory/settings') return jsonResponse({ memory_enabled: true, mcp_memory_enabled: false, system_discovery_consent: false });
        if (url.pathname === '/api/goals') return jsonResponse({ goals, total: goals.length });
        if (call.method === 'POST' && url.pathname === '/api/memory/consolidate') return jsonResponse({ status: 'ok', consolidated: 3, extracted_items: 12 });
        if (call.method === 'POST' && url.pathname === '/api/memory/rebuild-embeddings') return jsonResponse({ status: 'ok', backfilled: 6, total_without: 0 });
        if (call.method === 'POST' && url.pathname === '/api/memory/reconcile') return jsonResponse({ status: 'ok', pairs_checked: 4, reinforced: 1, contradicted: 0 });
        if (call.method === 'POST' && url.pathname === '/api/memory/refresh-system-context') return jsonResponse({ status: 'ok', stored: 7 });
        if (call.method === 'POST' && url.pathname === '/api/memory/rebuild-fts') return jsonResponse({ status: 'ok' });
        return jsonResponse({ detail: 'unexpected' }, 404);
    });
    const client = createHttpClient({ baseUrl: BASE, token: 'tok-1', fetch });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return { calls, queryClient, wrapper };
}

const writes = (calls: RecordedCall[]) => calls.filter((c) => c.method !== 'GET');

describeNative('Memory maintenance and goal suggestions against the real client', () => {
    it.each(MAINTENANCE)('MEM-04: the %s item sends one bodyless POST to %s and shows its result notice', async (action, path, notice) => {
        const { calls, queryClient, wrapper } = mount();
        await render(<MemoryScreen onBack={() => undefined} initialTab="advanced" />, { wrapper });
        await fireEvent.press(await screen.findByTestId('memory-maintenance'));
        expect(writes(calls)).toEqual([]);
        await fireEvent.press(await screen.findByTestId(`memory-action-${action}`));
        await waitFor(() => expect(writes(calls)).toHaveLength(1));
        expect(writes(calls)[0]).toMatchObject({ method: 'POST', url: `${BASE}${path}`, headers: AUTH, body: undefined });
        expect(await screen.findByText(new RegExp(notice))).toBeTruthy();
        queryClient.clear();
    });

    it('MEM-21: Accept sends PUT /api/goals/{id}/approve with no body, and the suggestion leaves the list', async () => {
        const { calls, queryClient, wrapper } = mount();
        await render(<MemoryScreen onBack={() => undefined} initialTab="goals" />, { wrapper });
        expect(await screen.findByText('Agent suggested 1 goal(s) — review before execution')).toBeTruthy();
        expect(writes(calls)).toEqual([]);
        await fireEvent.press(screen.getByTestId('goals-accept-g1'));
        await waitFor(() => expect(writes(calls)).toHaveLength(1));
        expect(writes(calls)[0]).toMatchObject({ method: 'PUT', url: `${BASE}/api/goals/g1/approve`, headers: AUTH, body: undefined });
        await waitFor(() => expect(screen.queryByTestId('goals-suggested')).toBeNull());
        queryClient.clear();
    });

    it('MEM-21: Reject sends PUT /api/goals/{id}/reject with no body, and the suggestion leaves the list', async () => {
        const { calls, queryClient, wrapper } = mount();
        await render(<MemoryScreen onBack={() => undefined} initialTab="goals" />, { wrapper });
        await screen.findByTestId('goals-suggested');
        await fireEvent.press(screen.getByTestId('goals-reject-g1'));
        await waitFor(() => expect(writes(calls)).toHaveLength(1));
        expect(writes(calls)[0]).toMatchObject({ method: 'PUT', url: `${BASE}/api/goals/g1/reject`, headers: AUTH, body: undefined });
        await waitFor(() => expect(screen.queryByTestId('goals-suggested')).toBeNull());
        expect(screen.queryByText('Tidy the inbox')).toBeNull();
        queryClient.clear();
    });
});
