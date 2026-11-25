// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { Automation } from '@/api/client.types';
import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';
import { sheetStore } from '@/ui/overlays/sheetStore';

import Automations from './Automations';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const t = translator('en');
const BASE = 'http://192.168.1.20:4200';
const row = (id: string, name: string, paused = false): Automation => ({
    id, name, kind: 'summary', heartbeat: false, paused, every_seconds: 86400, next_at: 1794906000, last_run_at: 0, runs: 0,
    prompt: 'Summarize my inbox', say: '', check: '', quiet: '', days: '', failures: 0,
});

afterEach(() => act(() => sheetStore.reset()));

/** The real HTTP client against a fake PC that keeps the automations list, as the PC's router does. */
async function mountPane() {
    let rows = [row('a1', 'Inbox digest'), row('b2', 'Keep me')];
    const { fetch, calls } = createRecordingFetch((call) => {
        const path = call.url.slice(BASE.length);
        const post = /^\/api\/automations\/([^/]+)\/(pause|resume)$/.exec(path);
        if (call.method === 'POST' && post) {
            rows = rows.map((r) => (r.id === post[1] ? { ...r, paused: post[2] === 'pause' } : r));
            return jsonResponse(rows.find((r) => r.id === post[1]));
        }
        const del = /^\/api\/automations\/([^/]+)$/.exec(path);
        if (call.method === 'DELETE' && del) {
            const gone = rows.find((r) => r.id === del[1]);
            rows = rows.filter((r) => r.id !== del[1]);
            return jsonResponse(gone);
        }
        return jsonResponse({ automations: rows, delivers: true });
    });
    const client = createHttpClient({ baseUrl: BASE, token: null, fetch });
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <ThemeProvider>
                    <SheetHost>
                        <Automations />
                    </SheetHost>
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    const writes = () => calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.slice(BASE.length)}`);
    return { writes, calls };
}

(Platform.OS === 'web' ? describe.skip : describe)('SET-AUTO-04 pause, resume and remove an automation', () => {
    it('SET-AUTO-04: Pause and Resume POST /api/automations/{id}/{action} with no body, and the badge follows the PC', async () => {
        const { writes, calls } = await mountPane();
        await fireEvent.press(await screen.findByTestId('automation-toggle-a1'));
        await waitFor(() => expect(screen.getAllByText(t('settings.automations.resume')).length).toBe(1));
        expect(writes()).toEqual(['POST /api/automations/a1/pause']);
        expect(calls.find((c) => c.method === 'POST')!.body).toBeUndefined();
        expect(screen.getAllByText(t('settings.automations.paused')).length).toBeGreaterThan(0);

        await fireEvent.press(screen.getByTestId('automation-toggle-a1'));
        await waitFor(() => expect(screen.queryAllByText(t('settings.automations.resume')).length).toBe(0));
        expect(writes()).toEqual(['POST /api/automations/a1/pause', 'POST /api/automations/a1/resume']);
        expect(screen.queryAllByText(t('settings.automations.paused')).length).toBe(0);
    });

    it('SET-AUTO-04: Cancel on the remove sheet sends nothing, and the automation stays', async () => {
        const { writes } = await mountPane();
        await fireEvent.press(await screen.findByTestId('automation-remove-a1'));
        expect(await screen.findByText(/Remove .*Inbox digest.*\?/)).toBeTruthy();
        await fireEvent.press(screen.getByText(t('settings.automations.cancel')));
        await waitFor(() => expect(screen.queryByText(/Remove .*Inbox digest.*\?/)).toBeNull());
        expect(writes()).toEqual([]);
        expect(screen.getByTestId('automation-a1')).toBeTruthy();
    });

    it('SET-AUTO-04: confirming the sheet sends DELETE /api/automations/{id}, and only that card leaves the list', async () => {
        const { writes } = await mountPane();
        await fireEvent.press(await screen.findByTestId('automation-remove-a1'));
        expect(writes()).toEqual([]);
        await fireEvent.press(await screen.findByTestId('confirm-ok'));
        await waitFor(() => expect(screen.queryByTestId('automation-a1')).toBeNull());
        expect(writes()).toEqual(['DELETE /api/automations/a1']);
        expect(screen.getByTestId('automation-b2')).toBeTruthy();
    });
});
