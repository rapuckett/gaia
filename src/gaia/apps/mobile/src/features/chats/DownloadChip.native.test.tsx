// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { SetupModelProgress, SetupRunStatus } from '@webui/types';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { settingsHref } from '@/features/settings/settingsHref';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';

import { ChatDrawerContent } from './ChatDrawerContent';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
    router: { push: (href: unknown) => mockPush(href) },
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

const BASE = 'http://192.168.1.20:4200';
const model = (state: SetupModelProgress['state']): SetupModelProgress => ({
    id: 'Gemma-4-E4B-it-GGUF', roles: ['chat'], state, bytes_done: 2_100_000_000, bytes_total: 5_000_000_000,
    speed_bps: 40_000_000, eta_s: 70, error: null, error_kind: null, can_retry: false, retrying_until: null, downloaded_before_gb: null,
});
const overall = (percent: number, failed = 0) => ({ bytes_done: 2_100_000_000, bytes_total: 5_000_000_000, speed_bps: 0, eta_s: null, percent, failed });
const DOWNLOADING: SetupRunStatus = { state: 'running', models: [model('downloading')], overall: overall(42) };
const FAILED: SetupRunStatus = { state: 'failed', models: [model('failed')], overall: overall(42, 1) };
const DONE: SetupRunStatus = { state: 'ready', models: [model('ready')], overall: overall(100) };

/** The drawer on the real HTTP client; `status` is what the PC's /api/setup/status says next. */
async function mountDrawer(status: { current: SetupRunStatus }, onClose = jest.fn()) {
    const { fetch, calls } = createRecordingFetch((call) => {
        const path = call.url.slice(BASE.length);
        if (path === '/api/setup/status') return jsonResponse(status.current);
        if (path === '/api/providers/local/status') return jsonResponse({ state: 'idle', active_model: null, active_display_name: null, active_remote: false, model: null, display_name: null, placement: null, ctx_size: null, memory: null, memory_error: null, error: null });
        if (path.startsWith('/api/sessions')) return jsonResponse({ sessions: [], total: 0 });
        return jsonResponse({});
    });
    const client = createHttpClient({ baseUrl: BASE, token: null, fetch });
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <ThemeProvider>
                    <ChatDrawerContent onSelect={() => {}} onClose={onClose} />
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    return { calls, onClose };
}

beforeEach(() => mockPush.mockClear());

(Platform.OS === 'web' ? describe.skip : describe)('SB-25 download chip in the drawer', () => {
    it('SB-25: shows progress from GET /api/setup/status, and tapping it closes the drawer and opens Settings > Model', async () => {
        const { calls, onClose } = await mountDrawer({ current: DOWNLOADING });
        await fireEvent.press(await screen.findByTestId('download-chip'));
        expect(screen.getByText('Downloading 1 of 1 · 42%')).toBeTruthy();
        expect(calls.some((c) => c.method === 'GET' && c.url === `${BASE}/api/setup/status`)).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith(settingsHref('model'));
    });

    it('SB-25: keeps a chip that says the download failed, and it opens the same place', async () => {
        await mountDrawer({ current: FAILED });
        expect(await screen.findByText('A download failed')).toBeTruthy();
        expect(screen.queryByText(/^Downloading/)).toBeNull();
        await fireEvent.press(screen.getByTestId('download-chip'));
        expect(mockPush).toHaveBeenCalledWith(settingsHref('model'));
    });

    it('SB-25: the chip leaves once the next poll reports the download finished', async () => {
        const status = { current: DOWNLOADING };
        await mountDrawer(status);
        expect(await screen.findByTestId('download-chip')).toBeTruthy();
        status.current = DONE;
        await waitFor(() => expect(screen.queryByTestId('download-chip')).toBeNull(), { timeout: 4000 });
    }, 10_000);

    it('SB-25: no chip while nothing downloads', async () => {
        await mountDrawer({ current: DONE });
        await act(async () => {});
        expect(screen.queryByTestId('download-chip')).toBeNull();
    });
});
