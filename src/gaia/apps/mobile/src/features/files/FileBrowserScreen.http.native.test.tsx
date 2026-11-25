// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@webui/i18n/translator';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';

import { FileBrowserScreen } from './FileBrowserScreen';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-image', () => ({ Image: () => null }));

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const BASE = 'http://192.168.1.20:4200';
const HOME = '/Users/me';

const LISTING = {
    current_path: HOME,
    parent_path: '/Users',
    quick_links: [],
    entries: [
        { name: 'notes.txt', path: `${HOME}/notes.txt`, type: 'file', size: 2048, extension: '.txt', modified: null },
        { name: '.zshrc', path: `${HOME}/.zshrc`, type: 'file', size: 1200, extension: '', modified: null },
    ],
};
const FOUND = { query: 'board', total: 1, truncated: false, searched_locations: [HOME], results: [{ name: 'q3-board.pdf', path: `${HOME}/q3-board.pdf`, directory: HOME, size: 481_000, size_display: '470 KB', extension: '.pdf', modified: null }] };

async function mountScreen() {
    const { fetch, calls } = createRecordingFetch((call) => {
        const path = new URL(call.url).pathname;
        if (path === '/api/files/search') return jsonResponse(FOUND);
        if (path === '/api/files/browse') return jsonResponse(LISTING);
        return jsonResponse({});
    });
    const client = createHttpClient({ baseUrl: BASE, token: null, fetch });
    await render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <FileBrowserScreen chatId="chat-1" onClose={() => {}} initial={{ path: HOME }} />
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );
    const searches = () => calls.filter((c) => new URL(c.url).pathname === '/api/files/search');
    return { calls, searches };
}

describeNative('FileBrowserScreen search and hidden files over HTTP', () => {
    it('has no Search button; submitting the field runs the search with the typed query', async () => {
        const { searches } = await mountScreen();
        const field = await screen.findByLabelText(t('fileBrowser.searchAria'));
        expect(screen.queryByText(t('fileBrowser.search'))).toBeNull();
        expect(field.props.returnKeyType).toBe('search');
        expect(searches()).toHaveLength(0);

        await fireEvent.changeText(field, 'board');
        expect(searches()).toHaveLength(0);
        await fireEvent(field, 'submitEditing');

        await waitFor(() => expect(searches()).toHaveLength(1));
        const call = searches()[0]!;
        const url = new URL(call.url);
        expect(call.method ?? 'GET').toBe('GET');
        expect(url.origin + url.pathname).toBe(`${BASE}/api/files/search`);
        expect(url.searchParams.get('query')).toBe('board');
        expect(url.searchParams.get('session_id')).toBe('chat-1');
        expect(url.searchParams.has('file_types')).toBe(false);
        expect(await screen.findByText('q3-board.pdf')).toBeTruthy();
    });

    it('does not search on an empty field', async () => {
        const { searches } = await mountScreen();
        const field = await screen.findByLabelText(t('fileBrowser.searchAria'));
        await fireEvent.changeText(field, '   ');
        await fireEvent(field, 'submitEditing');
        expect(searches()).toHaveLength(0);
    });

    it('the Show hidden chip is a checkbox that lists dotfiles without another request', async () => {
        const { calls } = await mountScreen();
        const chip = await screen.findByTestId('file-show-hidden');
        await screen.findByText('notes.txt');
        expect(chip.props.accessibilityRole).toBe('checkbox');
        expect(chip).not.toBeChecked();
        expect(screen.queryByText('.zshrc')).toBeNull();
        const browseCalls = calls.filter((c) => new URL(c.url).pathname === '/api/files/browse').length;

        await fireEvent.press(chip);
        expect(await screen.findByText('.zshrc')).toBeTruthy();
        expect(screen.getByTestId('file-show-hidden')).toBeChecked();
        // The PC lists everything; hiding is the phone's filter, so the browse query carries no hidden flag.
        expect(calls.filter((c) => new URL(c.url).pathname === '/api/files/browse')).toHaveLength(browseCalls);
        for (const c of calls) expect(new URL(c.url).searchParams.has('show_hidden')).toBe(false);
        expect(new URL(calls.find((c) => c.url.includes('/api/files/browse'))!.url).searchParams.get('path')).toBe(HOME);

        await fireEvent.press(screen.getByTestId('file-show-hidden'));
        await waitFor(() => expect(screen.queryByText('.zshrc')).toBeNull());
    });
});
