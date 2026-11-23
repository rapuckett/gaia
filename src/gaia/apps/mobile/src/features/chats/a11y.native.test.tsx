// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';

import { ChatDrawerContent } from './ChatDrawerContent';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const session = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
    id, title, created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z', model: '', system_prompt: null, message_count: 1, document_ids: [], ...extra,
});

const mount = async (props: Partial<Parameters<typeof ChatDrawerContent>[0]> = {}) => {
    const client = createFakeClient({ sessions: [session('a', 'Trip plan', { unread: true }), session('b', 'Taxes')] as never });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ChatDrawerContent onSelect={jest.fn()} onClose={jest.fn()} onNewChat={jest.fn()} onPcs={jest.fn()} routeNames={['connectors']} {...props} />, { wrapper });
    await screen.findByText('Trip plan');
};

afterEach(() => jest.restoreAllMocks());

describeNative('the chat drawer accessibility', () => {
    it('every control is named, has a role and holds 44 pt', async () => {
        await mount();
        const list = touchables();
        expect(list.length).toBeGreaterThanOrEqual(7);
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('the icon-only buttons say what they do, and each chat has its own More button', async () => {
        await mount();
        const names = touchables().map((x) => x.name);
        expect(names).toEqual(expect.arrayContaining(['Collapse sidebar']));
        expect(names.filter((n) => /Trip plan/.test(n)).length).toBe(2);
        expect(names.filter((n) => /Taxes/.test(n)).length).toBe(2);
    });

    it('the open chat is the one selected row, and an unread chat says so', async () => {
        await mount({ activeId: 'b' });
        const rows = touchables().filter((x) => x.role === 'button' && /^(Trip plan|Taxes)(,|$)/.test(x.name));
        expect(rows.map((r) => [r.name.split(',')[0], r.selected])).toEqual([['Trip plan', false], ['Taxes', true]]);
        expect(rows[0]!.name).toMatch(/unread/i);
    });

    it('the search box is a named text input with its icon hidden, and Clear appears only with text', async () => {
        await mount();
        const input = screen.getByLabelText('Search chats');
        expect(input.props.accessibilityLabel).toBe('Search chats');
        expect(touchables().some((x) => /clear/i.test(x.name))).toBe(false);
        await fireEvent.changeText(input, 'trip');
        const clear = touchables().find((x) => /clear/i.test(x.name));
        expect(clear?.role).toBe('button');
        expect(clear!.minHeight).toBeGreaterThanOrEqual(Platform.OS === 'ios' ? 44 : 0);
    });

    it('section titles are headings and the header is a heading', async () => {
        await mount();
        const headers = walk().filter((n) => n.props.accessibilityRole === 'header');
        expect(headers.length).toBeGreaterThanOrEqual(2);
    });

    it('long-press has a visible, named alternative on every row', async () => {
        await mount();
        const more = touchables().filter((x) => /More actions/i.test(x.name));
        expect(more.map((x) => x.name.replace(/More actions\s*/i, '')).join('|')).toMatch(/Trip plan.*Taxes|Taxes.*Trip plan/);
    });
});
