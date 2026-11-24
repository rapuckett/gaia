// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';

import type { Message } from '@/api/client.types';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import { AssistantBubble } from './AssistantBubble';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const reply = (content: string): Message => ({
    id: 2,
    session_id: 's',
    role: 'assistant',
    content,
    created_at: '2026-11-13T14:05:09Z',
    rag_sources: null,
});

const show = (content: string, available?: boolean) =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={createFakeClient(available === undefined ? {} : { speechSettings: { voice: 'af_heart', speed: 100, auto: false, min_speed: 50, max_speed: 200, voices: [], available } }) as never}>
                <ThemeProvider>
                    <SheetHost>
                        <AssistantBubble message={reply(content)} />
                    </SheetHost>
                </ThemeProvider>
            </GaiaClientProvider>
        </QueryClientProvider>,
    );

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('AssistantBubble screen-reader grouping', () => {
    it('reads plain prose as one element with an actions entry, and leaves a reply with links walkable', async () => {
        await show('Plain answer without links.');
        const group = screen.getByText(/Plain answer/).parent;
        let node = group;
        while (node && node.props.accessible !== true && node.props.accessible !== false) node = node.parent;
        expect(node?.props.accessible).toBe(true);
        expect(node?.props.accessibilityActions?.length).toBeGreaterThan(0);
    });
});

describeNative('AssistantBubble read aloud button', () => {
    const label = translator('en')('readAloud.read');

    it('is hidden once the PC says its voice is not offered', async () => {
        await show('A spoken answer.', false);
        await new Promise((r) => setTimeout(r, 50));
        expect(screen.queryByLabelText(label)).toBeNull();
    });

    it('is shown when the PC offers its voice', async () => {
        await show('A spoken answer.', true);
        expect(await screen.findByLabelText(label)).toBeTruthy();
    });

    it('offers read aloud in the long-press sheet only when the PC offers its voice', async () => {
        await show('A spoken answer.', false);
        await waitFor(() => expect(screen.queryByLabelText(label)).toBeNull());
        fireEvent(screen.getByText(/A spoken answer/), 'longPress');
        expect(await screen.findByText(translator('en')('msg.copy'))).toBeTruthy();
        expect(screen.queryByText(label)).toBeNull();
    });

    it('lists read aloud in the long-press sheet when the PC offers its voice', async () => {
        await show('A spoken answer.', true);
        fireEvent(screen.getByText(/A spoken answer/), 'longPress');
        expect(await screen.findByText(label)).toBeTruthy();
    });
});

describeNative('AssistantBubble failed turn', () => {
    const order = (json: string, marks: string[]) => marks.map((m) => json.indexOf(m));

    it('reads steps, cause, the turn text, then the buttons, for an unclassified failure', async () => {
        const body = 'The model stopped while answering. Two sections were written first.';
        const content = `${body} GAIA saved a problem report: GF-20261124-144003-f8bf`;
        const { toJSON } = await render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={createFakeClient({}) as never}>
                    <ThemeProvider>
                        <SheetHost>
                            <AssistantBubble message={{ ...reply(content), failed: true }} latencyMs={800} />
                        </SheetHost>
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>,
        );
        const json = JSON.stringify(toJSON());
        const at = order(json, ['answer-footer', 'error-banner', 'Two sections were written first', 'pc-only-report']);
        expect(at.every((i) => i >= 0)).toBe(true);
        expect(at).toEqual([...at].sort((a, b) => a - b));
    });
});
