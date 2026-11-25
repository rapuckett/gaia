// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { StreamEvent } from '@/api/client.types';
import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { ModelNeededHost } from '@/features/model/ModelNeededHost';
import { translator } from '@/i18n/useT';
import { forgetModelChecks } from '@/state/modelNeeded';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { ActivityTimeline } from './ActivityTimeline';
import { stepsFromEvents } from './stepsFromEvents';

// The PC's routes: GET /api/setup/needs/{job} (setup.py `setup_model_need`), then POST /api/setup/models/download
// with {model_id, acknowledge_low_disk, keep_trying} (`setup_download_model`). The phone sends exactly those, as the
// web's ensureModel does. The matrix row names /api/system/download-model; that is stale, not a phone mismatch.

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const BASE = 'http://192.168.1.20:4200';
const AUTH = { Authorization: 'Bearer tok-1' };
const MODEL = { id: 'Gemma-4-E4B-it-GGUF', name: 'Gemma 4 E4B', size_gb: 5, source: 'lemonade' };

function mount() {
    const { fetch, calls } = createRecordingFetch((call) => {
        const url = new URL(call.url);
        if (call.method === 'GET' && url.pathname === '/api/setup/needs/vision') return jsonResponse({ job: 'vision', needed: true, model: MODEL, disk_free_gb: 100 });
        if (call.method === 'POST' && url.pathname === '/api/setup/models/download') return jsonResponse({ state: 'running' }, 202);
        if (url.pathname === '/api/setup/status') return jsonResponse({ models: [{ id: MODEL.id, state: 'downloading', bytes_done: 1, bytes_total: 10 }] });
        return jsonResponse({ detail: 'unexpected' }, 404);
    });
    const client = createHttpClient({ baseUrl: BASE, token: 'tok-1', fetch });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>
                            {children}
                            <ModelNeededHost />
                        </SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    return { calls, queryClient, wrapper };
}

const visionEvents = (): StreamEvent[] =>
    [
        { type: 'tool_start', tool: 'analyze_image', detail: 'path: photo.jpg', narration: 'Reading photo.jpg' },
        { type: 'tool_result', success: false, summary: 'A vision model is needed.', needs_model: 'vision' },
    ] as StreamEvent[];

describeNative('CV-49: the vision offer inside a step, against the real client', () => {
    beforeEach(() => forgetModelChecks());

    it('shows the offer for a step that needed the vision model, and sends nothing until it is pressed', async () => {
        const { calls, queryClient, wrapper } = mount();
        const steps = stepsFromEvents(visionEvents(), translator('en'));
        expect(steps[0]).toMatchObject({ needsModel: 'vision' });
        await render(<ActivityTimeline steps={steps} />, { wrapper });
        expect(await screen.findByTestId('vision-offer')).toBeTruthy();
        expect(screen.getByText("Reading images needs the vision model, which isn't on your PC yet.")).toBeTruthy();
        expect(screen.queryByText('A vision model is needed.')).toBeNull();
        expect(calls).toEqual([]);
        queryClient.clear();
    });

    it('pressing Get the vision model asks the PC GET /api/setup/needs/vision, then Download sends POST /api/setup/models/download for that model', async () => {
        const { calls, queryClient, wrapper } = mount();
        await render(<ActivityTimeline steps={stepsFromEvents(visionEvents(), translator('en'))} />, { wrapper });
        await fireEvent.press(await screen.findByText('Get the vision model'));
        await waitFor(() => expect(calls).toHaveLength(1));
        expect(calls[0]).toMatchObject({ method: 'GET', url: `${BASE}/api/setup/needs/vision`, headers: AUTH });

        await fireEvent.press(await screen.findByText('Download and continue'));
        await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
        const posts = calls.filter((c) => c.method === 'POST');
        expect(posts).toHaveLength(1);
        expect(posts[0]).toMatchObject({ url: `${BASE}/api/setup/models/download`, headers: AUTH });
        expect(JSON.parse(posts[0]!.body!)).toEqual({ model_id: MODEL.id, acknowledge_low_disk: false, keep_trying: false });
        queryClient.clear();
    });
});
