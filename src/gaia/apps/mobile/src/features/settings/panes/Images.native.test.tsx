// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createHttpClient } from '@/api/http';
import type { ImageModel, ImageSettings } from '@/api/client.types';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import Images from './Images';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
const mockOpenSettings = jest.fn();
jest.mock('../openSettings', () => ({ openSettings: (...args: unknown[]) => mockOpenSettings(...args) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const model = (id: string, extra: Partial<ImageModel> = {}): ImageModel => ({
    id, recipe: null, downloaded: true, downloads_on_first_use: false, size_gb: null, default_size: '1280x720', default_steps: 9,
    sizes: ['512x512', '1024x1024', '1280x720'], ...extra,
});
const SETTINGS: ImageSettings = {
    model: 'Z-Image-Turbo', size: null, steps: null, max_steps: 50,
    models: [model('Z-Image-Turbo'), model('SDXL-Turbo', { downloaded: false, downloads_on_first_use: true, size_gb: 6.9 })],
    model_available: true, chat_model: 'Gemma-4-E4B-it-GGUF', chat_model_creates_images: true,
};
const LOCAL = { provider: 'local', models: [{ id: 'Gemma-4-E4B-it-GGUF', display_name: 'Gemma 4 E4B (Multimodal)' }] };

const mount = async (settings: ImageSettings = SETTINGS, respond?: (method: string | undefined) => ReturnType<typeof jsonResponse>) => {
    const { fetch, calls } = createRecordingFetch((call) => {
        if (respond && call.url.includes('/images/settings')) return respond(call.method);
        if (call.url.includes('/images/settings')) return jsonResponse(call.method === 'PUT' ? { ...settings, ...JSON.parse(call.body!) } : settings);
        return jsonResponse(LOCAL);
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
    await render(<Images />, { wrapper });
    return calls;
};

const puts = (calls: Awaited<ReturnType<typeof mount>>) => calls.filter((c) => c.method === 'PUT').map((c) => ({ url: c.url, body: JSON.parse(c.body!) }));

describeNative('Settings > Image creation', () => {
    beforeEach(() => mockOpenSettings.mockClear());

    it('normal: lede, the three pickers, the hint and the shared note', async () => {
        await mount();
        await screen.findByTestId('images-model');
        expect(screen.getByText(t('images.settings.lede'))).toBeTruthy();
        expect(screen.getByTestId('images-size')).toBeTruthy();
        expect(screen.getByTestId('images-steps')).toBeTruthy();
        expect(screen.getByText(t('images.settings.stepsHint'))).toBeTruthy();
        expect(screen.getByText(t('images.settings.shared'))).toBeTruthy();
        expect(screen.queryByTestId('images-chat-model-cannot')).toBeNull();
    });

    it('a size, steps or model change sends the desktop PUT body', async () => {
        const calls = await mount();
        await fireEvent.press(await screen.findByTestId('images-size'));
        await fireEvent.press(await screen.findByText(/1024x1024/));
        await waitFor(() => expect(puts(calls)).toHaveLength(1));
        await fireEvent.press(screen.getByTestId('images-steps'));
        await fireEvent.press(await screen.findByText(/^⁦?12⁩?$/));
        await waitFor(() => expect(puts(calls)).toHaveLength(2));
        await fireEvent.press(screen.getByTestId('images-model'));
        await fireEvent.press(await screen.findByText(/SDXL-Turbo \(downloads on first use/));
        await waitFor(() => expect(puts(calls)).toHaveLength(3));
        expect(puts(calls)).toEqual([
            { url: 'http://192.168.1.20:4200/api/images/settings', body: { size: '1024x1024' } },
            { url: 'http://192.168.1.20:4200/api/images/settings', body: { steps: 12 } },
            { url: 'http://192.168.1.20:4200/api/images/settings', body: { model: 'SDXL-Turbo' } },
        ]);
    });

    it('choosing Automatic sends null', async () => {
        const calls = await mount({ ...SETTINGS, size: '512x512' });
        await fireEvent.press(await screen.findByTestId('images-size'));
        await fireEvent.press(await screen.findByText(/Automatic/));
        await waitFor(() => expect(puts(calls)).toHaveLength(1));
        expect(puts(calls)[0]!.body).toEqual({ size: null });
    });

    it('chat model too small: names it by display name and opens Agent & model', async () => {
        await mount({ ...SETTINGS, chat_model_creates_images: false });
        expect(await screen.findByText(t('images.settings.chatModelCannot', { model: 'Gemma 4 E4B (Multimodal)' }))).toBeTruthy();
        await fireEvent.press(screen.getByText(t('images.settings.chooseChatModel')));
        expect(mockOpenSettings).toHaveBeenCalledWith('model');
    });

    it('no models: the note replaces the pickers', async () => {
        await mount({ ...SETTINGS, models: [] });
        expect(await screen.findByText(t('images.settings.noModels'))).toBeTruthy();
        expect(screen.queryByTestId('images-model')).toBeNull();
    });

    it('model gone: the red line, and the picker has no value but still lists the others', async () => {
        await mount({ ...SETTINGS, model: 'Flux-Schnell-GGUF', model_available: false });
        expect(await screen.findByText(t('images.settings.modelGone', { model: 'Flux-Schnell-GGUF' }))).toBeTruthy();
        expect(screen.getByTestId('images-model')).toBeTruthy();
        expect(screen.queryByTestId('images-size')).toBeNull();
    });

    it('a 503 says Lemonade is not answering, with the server text on its own line, and retries', async () => {
        let n = 0;
        const calls = await mount(SETTINGS, (method) => (method === 'GET' && n++ === 0 ? jsonResponse({ detail: 'Lemonade is not running at :13305' }, 503) : jsonResponse(SETTINGS)));
        expect(await screen.findByText(t('images.settings.unreachable'))).toBeTruthy();
        expect(screen.getByText('Lemonade is not running at :13305')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('images-retry'));
        await screen.findByTestId('images-model');
        expect(calls.filter((c) => c.method === 'GET' && c.url.includes('/images/settings'))).toHaveLength(2);
    });

    it('a PC that refuses the save shows the PC-only note, not an error', async () => {
        await mount(SETTINGS, (method) => (method === 'PUT' ? jsonResponse({ detail: 'PC only' }, 403) : jsonResponse(SETTINGS)));
        await fireEvent.press(await screen.findByTestId('images-size'));
        await fireEvent.press(await screen.findByText(/1024x1024/));
        expect(await screen.findByTestId('images-pc-only')).toBeTruthy();
        expect(screen.queryByTestId('images-save-error')).toBeNull();
    });
});
