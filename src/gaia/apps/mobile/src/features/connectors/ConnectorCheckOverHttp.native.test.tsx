// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ReadableStream as NodeReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { TextEncoder } from 'node:util';
import { useCallback, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ConnectorRow, GaiaClient } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { createHttpClient } from '@/api/http';
import { GaiaClientProvider, useSessionSync } from '@/data';
import { KEY_STORE_LOCKED_DETAIL, useDevicePromptStore } from '@/features/devices/devicePrompts';
import type { FetchResponseLike } from '@/platform/fetch.types';
import { createRecordingFetch, jsonResponse } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';

import { ConnectorsScreen } from './ConnectorsScreen';

jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const brave = {
    id: 'mcp-brave-search',
    display_name: 'Brave Search',
    type: 'mcp_server',
    description: 'Web search.',
    configured: true,
    configurable: true,
    enabled: true,
    account_id: null,
    mcp_env_keys: ['BRAVE_API_KEY'],
    activations: {},
} as unknown as ConnectorRow;

const CHECK_PATH = '/api/connectors/mcp-brave-search/test';
const CHECK = 'connector-check-mcp-brave-search';
const ASKING = /asking to unlock its key store/;
const CANT_REACH = /Can't reach GAIA on your PC/;
// The PC holds a device's Check up to its prompt timeout (5 minutes) before it answers 504.
const PAST_THE_PROMPT_TIMEOUT_MS = 6 * 60_000;

/**
 * A paired PC: the Check's POST and the chat-list events go through the real HTTP client, the rest is the fake.
 * The events stream stays open and carries what `emit` sends; each Check's POST waits until the test answers it.
 */
function pairedPc() {
    let events: ReadableStreamDefaultController<Uint8Array> | null = null;
    const answers: ((res: FetchResponseLike) => void)[] = [];
    const encoder = new TextEncoder();
    const { fetch, calls } = createRecordingFetch((call) => {
        if (call.url.endsWith('/api/sessions/events')) {
            let mine: ReadableStreamDefaultController<Uint8Array> | null = null;
            const body = new NodeReadableStream<Uint8Array>({ start: (c) => void (events = mine = c) });
            // As the native transport does, a dropped connection fails the body's read.
            call.signal?.addEventListener('abort', () => mine?.error(new Error('The request was canceled.')));
            return { ok: true, status: 200, headers: { get: () => 'text/event-stream' }, body: body as unknown as ReadableStream<Uint8Array>, text: async () => '' };
        }
        if (call.url.endsWith(CHECK_PATH) && call.method === 'POST') return new Promise<FetchResponseLike>((resolve) => answers.push(resolve));
        return jsonResponse({ detail: 'Not Found' }, 404);
    });
    const http = createHttpClient({ baseUrl: 'https://192.168.1.20:4201', token: 'tok', fetch });
    const client: GaiaClient = { ...createFakeClient({ connectors: [brave] }), testConnector: http.testConnector, watchSessionEvents: http.watchSessionEvents };
    return {
        client,
        checks: () => calls.filter((c) => c.url.endsWith(CHECK_PATH)).length,
        emit: (state: string) =>
            events!.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'device_prompt', device_id: 'd1', kind: 'keyStore', action: 'connectorTest', state })}\n\n`)),
        answer: (res: FetchResponseLike) => answers.shift()!(res),
    };
}

function SessionSync() {
    useSessionSync(useCallback(() => undefined, []));
    return null;
}

async function mount(client: ReturnType<typeof pairedPc>['client']) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SessionSync />
                        {children}
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    const view = await render(<ConnectorsScreen />, { wrapper: wrap });
    fireEvent.press(await screen.findByLabelText('Brave Search'));
    await screen.findByTestId(CHECK);
    return { queryClient, view };
}

describeNative('Connector Check from a paired phone, over HTTP, while the PC asks to unlock its key store', () => {
    beforeEach(() => {
        useDevicePromptStore.setState({ states: {}, notes: {} });
        Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
        jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as unknown as typeof AppState.addEventListener);
    });
    afterEach(() => jest.restoreAllMocks());

    it('shows the notice in the tile from the PC\'s waiting event while the POST is open, then the result once approved', async () => {
        const pc = pairedPc();
        const { queryClient, view } = await mount(pc.client);

        await fireEvent.press(screen.getByTestId(CHECK));
        await act(async () => pc.emit('waiting'));
        expect(await screen.findByText(ASKING)).toBeTruthy();
        expect(screen.queryByTestId(CHECK)).toBeNull();

        await act(async () => {
            pc.emit('approved');
            pc.answer(jsonResponse({ ok: false, detail: "The check didn't pass. Run it again in Settings › Connectors on the PC to see why." }));
        });
        expect(await screen.findByText("Brave Search didn't start. Check the token, then save it again.")).toBeTruthy();
        expect(screen.queryByText(ASKING)).toBeNull();
        expect(screen.getByTestId(CHECK)).toBeTruthy();
        expect(pc.checks()).toBe(1);
        await view.unmount();
        queryClient.clear();
    });

    it('a prompt closed on the PC says it wasn\'t approved, from the denied event and the 423', async () => {
        const pc = pairedPc();
        const { queryClient, view } = await mount(pc.client);

        await fireEvent.press(screen.getByTestId(CHECK));
        await act(async () => pc.emit('waiting'));
        await screen.findByText(ASKING);
        await act(async () => {
            pc.emit('denied');
            pc.answer(jsonResponse({ detail: KEY_STORE_LOCKED_DETAIL }, 423));
        });
        expect(await screen.findByText("It wasn't approved on your PC.")).toBeTruthy();
        expect(screen.queryByText(ASKING)).toBeNull();
        await view.unmount();
        queryClient.clear();
    });

    it('a 423 before its denied event arrives still says it wasn\'t approved', async () => {
        const pc = pairedPc();
        const { queryClient, view } = await mount(pc.client);

        await fireEvent.press(screen.getByTestId(CHECK));
        await act(async () => pc.emit('waiting'));
        await screen.findByText(ASKING);
        await act(async () => pc.answer(jsonResponse({ detail: KEY_STORE_LOCKED_DETAIL }, 423)));
        expect(await screen.findByText("It wasn't approved on your PC.")).toBeTruthy();
        await act(async () => pc.emit('denied'));
        expect(screen.getByText("It wasn't approved on your PC.")).toBeTruthy();
        await view.unmount();
        queryClient.clear();
    });

    it('a store already locked (423, no prompt) shows the locked notice with the PC\'s words on the detail line, and Try again checks again', async () => {
        const pc = pairedPc();
        const { queryClient, view } = await mount(pc.client);

        await fireEvent.press(screen.getByTestId(CHECK));
        await act(async () => pc.answer(jsonResponse({ detail: KEY_STORE_LOCKED_DETAIL }, 423)));
        expect(await screen.findByText("Your PC's key store is locked, so GAIA can't read your saved key.")).toBeTruthy();
        expect(screen.getByText(KEY_STORE_LOCKED_DETAIL)).toBeTruthy();
        expect(screen.queryByText(CANT_REACH)).toBeNull();
        expect(screen.queryByTestId(CHECK)).toBeNull();

        await fireEvent.press(screen.getByText('Try again'));
        await act(async () => pc.answer(jsonResponse({ ok: true, detail: '' })));
        expect(await screen.findByText('Brave Search started without errors.')).toBeTruthy();
        expect(pc.checks()).toBe(2);
        await view.unmount();
        queryClient.clear();
    });

    it('a 409 for the unanswered prompt keeps the waiting notice, not busy or an error, until the PC\'s events end it', async () => {
        const pc = pairedPc();
        const { queryClient, view } = await mount(pc.client);

        await fireEvent.press(screen.getByTestId(CHECK));
        await act(async () => pc.answer(jsonResponse({ detail: KEY_STORE_LOCKED_DETAIL }, 409)));
        expect(await screen.findByText(ASKING)).toBeTruthy();
        expect(screen.queryByText(/already waiting for an answer to another request/)).toBeNull();
        expect(screen.queryByText(KEY_STORE_LOCKED_DETAIL)).toBeNull();
        expect(screen.queryByTestId(CHECK)).toBeNull();

        await act(async () => pc.emit('waiting'));
        expect(screen.getByText(ASKING)).toBeTruthy();
        await act(async () => pc.emit('denied'));
        expect(await screen.findByText("It wasn't approved on your PC.")).toBeTruthy();
        await view.unmount();
        queryClient.clear();
    });

    // Runs last: tests after its fake timers couldn't render the list.
    it('keeps waiting while the PC holds the POST past its prompt timeout, never saying it can\'t reach the PC, then shows the timeout', async () => {
        jest.useFakeTimers();
        try {
            const pc = pairedPc();
            const { queryClient, view } = await mount(pc.client);

            await fireEvent.press(screen.getByTestId(CHECK));
            await act(async () => pc.emit('waiting'));
            await act(async () => jest.advanceTimersByTimeAsync(0));
            expect(screen.getByText(ASKING)).toBeTruthy();
            await act(async () => jest.advanceTimersByTimeAsync(PAST_THE_PROMPT_TIMEOUT_MS));
            expect(screen.getByText(ASKING)).toBeTruthy();
            expect(screen.queryByText(CANT_REACH)).toBeNull();

            await act(async () => pc.answer(jsonResponse({ detail: 'Nobody answered the key store prompt on the PC within 5 minutes.' }, 504)));
            await act(async () => jest.advanceTimersByTimeAsync(0));
            expect(screen.getByText('No one answered on your PC in time.')).toBeTruthy();
            expect(screen.queryByText(CANT_REACH)).toBeNull();
            await view.unmount();
            queryClient.clear();
        } finally {
            jest.useRealTimers();
        }
    });
});
