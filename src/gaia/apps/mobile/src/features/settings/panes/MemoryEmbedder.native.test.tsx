// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createHttpClient } from '@/api/http';
import type { EmbedderView } from '@/api/client.types';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import MemoryEmbedder from './MemoryEmbedder';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const GPU_OPTION = { device: 'gpu', model: 'g', display_name: 'Nomic GPU', proven: true, present: true, available: true, reason: null, downloaded: true } as const;
const NPU_OPTION = { device: 'npu', model: 'n', display_name: 'Nomic NPU', proven: true, present: true, available: true, reason: null, downloaded: true } as const;
const VIEW: EmbedderView = { device: 'gpu', chosen: false, default_device: 'gpu', options: [NPU_OPTION, GPU_OPTION] };
const UNPROVEN: EmbedderView = { ...VIEW, options: [{ ...NPU_OPTION, proven: false, available: false, reason: 'unproven' }, GPU_OPTION] };

const mount = async (view: EmbedderView | 'hang', put?: () => ReturnType<typeof jsonResponse>) => {
    const { fetch, calls } = createRecordingFetch((call) => {
        if (call.method === 'PUT') {
            if (put) return put();
            const device = JSON.parse(call.body!).device;
            return jsonResponse({ ...(view as EmbedderView), device: device ?? 'gpu', chosen: device !== null, changed: true });
        }
        if (view === 'hang') return new Promise(() => undefined) as never;
        return jsonResponse(view);
    });
    const client = createHttpClient({ baseUrl: 'http://192.168.1.20:4200', token: null, fetch });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetHost>{children}</SheetHost>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<MemoryEmbedder />, { wrapper });
    return calls;
};

const puts = (calls: Awaited<ReturnType<typeof mount>>) => calls.filter((c) => c.method === 'PUT').map((c) => ({ url: c.url, body: JSON.parse(c.body!) }));

describeNative('Settings > Memory > Embedding model', () => {
    it('checking: says so until the PC answers', async () => {
        await mount('hang');
        expect(await screen.findByText(t('settings.memory.embedder.checking'))).toBeTruthy();
    });

    it('normal: the default device, where it runs and why', async () => {
        await mount(VIEW);
        await screen.findByTestId('memory-embedder');
        expect(screen.getByText(/Default \(GPU\)/)).toBeTruthy();
        expect(screen.getByTestId('memory-embedder-runs-on').props.children.join('')).toContain('Nomic GPU');
        expect(screen.queryByTestId('memory-embedder-npu-unproven')).toBeNull();
        expect(screen.queryByTestId('memory-embedder-not-downloaded')).toBeNull();
    });

    it('unproven: the NPU is listed as not supported yet, cannot be chosen, and the hint shows', async () => {
        const calls = await mount(UNPROVEN);
        expect(await screen.findByText(t('settings.memory.embedder.npuUnproven'))).toBeTruthy();
        await fireEvent.press(screen.getByTestId('memory-embedder'));
        await fireEvent.press(await screen.findByText(t.bare('settings.memory.embedder.unproven', { device: 'NPU' })));
        expect(puts(calls)).toEqual([]);
    });

    it('unavailable: a device this PC lacks is named as not available', async () => {
        await mount({ ...VIEW, options: [{ ...NPU_OPTION, present: false, available: false, reason: 'No NPU' }, GPU_OPTION] });
        await fireEvent.press(await screen.findByTestId('memory-embedder'));
        expect(await screen.findByText(t.bare('settings.memory.embedder.unavailable', { device: 'NPU' }))).toBeTruthy();
    });

    it('not downloaded: says it downloads on first use', async () => {
        await mount({ ...VIEW, options: [NPU_OPTION, { ...GPU_OPTION, downloaded: false }] });
        expect(await screen.findByText(t('settings.memory.embedder.notDownloaded'))).toBeTruthy();
    });

    it('choosing a device sends the desktop PUT body, shows applying, then the new value', async () => {
        let release: (() => void) | undefined;
        const calls = await mount(VIEW, () => {
            const device = 'npu';
            return new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
                release = () => resolve(jsonResponse({ ...VIEW, device, chosen: true, changed: true }));
            }) as never;
        });
        await fireEvent.press(await screen.findByTestId('memory-embedder'));
        await fireEvent.press(await screen.findByText('NPU'));
        expect(await screen.findByTestId('memory-embedder-applying')).toBeTruthy();
        expect(puts(calls)).toEqual([{ url: 'http://192.168.1.20:4200/api/memory/embedder', body: { device: 'npu' } }]);
        release!();
        expect(await screen.findByTestId('memory-embedder-changed')).toBeTruthy();
        await waitFor(() => expect(screen.queryByTestId('memory-embedder-applying')).toBeNull());
        expect(screen.getByTestId('memory-embedder-runs-on').props.children.join('')).toContain('NPU');
    });

    it('choosing the default sends null', async () => {
        const calls = await mount({ ...VIEW, device: 'npu', chosen: true });
        await fireEvent.press(await screen.findByTestId('memory-embedder'));
        await fireEvent.press(await screen.findByText(/Default \(GPU\)/));
        await waitFor(() => expect(puts(calls)).toHaveLength(1));
        expect(puts(calls)[0]!.body).toEqual({ device: null });
    });

    it('a refused change shows the PC\'s error', async () => {
        await mount(VIEW, () => jsonResponse({ detail: 'A reply is running. Change the embedder once it finishes.' }, 409));
        await fireEvent.press(await screen.findByTestId('memory-embedder'));
        await fireEvent.press(await screen.findByText('NPU'));
        expect(await screen.findByTestId('memory-embedder-error')).toBeTruthy();
        expect(screen.getByText('A reply is running. Change the embedder once it finishes.')).toBeTruthy();
        expect(screen.queryByText(/409|answered with an error/)).toBeNull();
    });
});
