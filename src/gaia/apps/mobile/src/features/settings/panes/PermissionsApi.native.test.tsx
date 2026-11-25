// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { createRecordingFetch, jsonResponse, type RecordedCall } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import Permissions from './Permissions';

// The PC's route (src/gaia/ui/routers/chat.py `revoke_grants`): DELETE /api/chat/permissions/{session_id}/grants,
// with `?key=` for one grant and no query for all of the chat's. It takes no body, and the phone sends the same,
// so there is no mismatch. Revoke all has no confirm step on the phone: the action sheet's row is the one tap.

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const BASE = 'http://192.168.1.20:4200';
const g = (key: string) => ({ key, label: key.replace('shell:', '') });

function mount() {
    const state: Record<string, { mode: string; grants: { key: string; label: string }[] }> = {
        'chat a': { mode: 'ask', grants: [g('shell:ls'), g('shell:pwd'), g('shell:cat')] },
        'chat-b': { mode: 'ask', grants: [g('shell:git status')] },
    };
    const view = (id: string) => ({ session_id: id, ...state[id]! });
    const { fetch, calls } = createRecordingFetch((call) => {
        const url = new URL(call.url);
        const del = /^\/api\/chat\/permissions\/(.+)\/grants$/.exec(url.pathname);
        if (call.method === 'DELETE' && del) {
            const id = decodeURIComponent(del[1]!);
            const key = url.searchParams.get('key');
            state[id]!.grants = key === null ? [] : state[id]!.grants.filter((x) => x.key !== key);
            return jsonResponse(view(id));
        }
        if (url.pathname === '/api/chat/permissions') {
            return jsonResponse({ default_mode: 'ask', sessions: Object.keys(state).filter((id) => state[id]!.grants.length).map(view) });
        }
        if (url.pathname === '/api/sessions') {
            return jsonResponse({ sessions: [{ id: 'chat a', title: 'Alpha chat' }, { id: 'chat-b', title: 'Beta chat' }], total: 2 });
        }
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

// A grant label is wrapped in direction marks, so match around them.
const grant = (label: string) => new RegExp(`^\\W*${label}\\W*$`);
const deletes = (calls: RecordedCall[]) => calls.filter((c) => c.method === 'DELETE');

describeNative('Settings > Permissions against the real client', () => {
    it('SET-PERM-05: lists each chat that holds grants, by title, with every grant', async () => {
        const { calls, queryClient, wrapper } = mount();
        await render(<Permissions />, { wrapper });
        expect(await screen.findByText('Alpha chat')).toBeTruthy();
        expect(screen.getByText('Beta chat')).toBeTruthy();
        for (const label of ['ls', 'pwd', 'cat', 'git status']) expect(screen.getByText(grant(label))).toBeTruthy();
        expect(calls.find((c) => c.url.endsWith('/api/chat/permissions'))).toMatchObject({ method: 'GET', url: `${BASE}/api/chat/permissions` });
        expect(deletes(calls)).toEqual([]);
        queryClient.clear();
    });

    it('SET-PERM-07: revoking one grant sends DELETE .../grants?key=<that key> only, and the others stay', async () => {
        const { calls, queryClient, wrapper } = mount();
        await render(<Permissions />, { wrapper });
        await screen.findByText('Alpha chat');
        await fireEvent.press(screen.getByTestId('perm-grant-revoke-chat a-1'));
        await waitFor(() => expect(deletes(calls)).toHaveLength(1));
        expect(deletes(calls)[0]).toMatchObject({
            method: 'DELETE',
            url: `${BASE}/api/chat/permissions/chat%20a/grants?key=shell%3Apwd`,
            headers: { Authorization: 'Bearer tok-1' },
            body: undefined,
        });
        await waitFor(() => expect(screen.queryByText(grant('pwd'))).toBeNull());
        expect(screen.getByText(grant('ls'))).toBeTruthy();
        expect(screen.getByText(grant('cat'))).toBeTruthy();
        expect(screen.getByText(grant('git status'))).toBeTruthy();
        expect(deletes(calls)).toHaveLength(1);
        expect(screen.queryByTestId('permissions-revoked-all')).toBeNull();
        queryClient.clear();
    });

    it("SET-PERM-08: Revoke all sends one DELETE for that chat with no key, from the chat's menu; opening the menu and closing it sends nothing", async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        const { calls, queryClient, wrapper } = mount();
        await render(<Permissions />, { wrapper });
        await screen.findByText('Alpha chat');
        await fireEvent.press(screen.getByTestId('perm-chat-menu-chat a'));
        expect(await screen.findByTestId('perm-chat-revoke-all')).toBeTruthy();
        expect(deletes(calls)).toEqual([]);
        await fireEvent.press(screen.getByTestId('perm-chat-revoke-all'));
        await waitFor(() => expect(deletes(calls)).toHaveLength(1));
        expect(deletes(calls)[0]).toMatchObject({
            method: 'DELETE',
            url: `${BASE}/api/chat/permissions/chat%20a/grants`,
            headers: { Authorization: 'Bearer tok-1' },
            body: undefined,
        });
        await waitFor(() => expect(screen.queryByText('Alpha chat')).toBeNull());
        expect(screen.getByText('Beta chat')).toBeTruthy();
        expect(screen.getByText(grant('git status'))).toBeTruthy();
        expect(await screen.findByTestId('permissions-revoked-all')).toHaveTextContent("Removed this chat's extra permissions.");
        if (Platform.OS === 'ios') expect(announce).toHaveBeenCalledWith("Removed this chat's extra permissions.");
        announce.mockRestore();
        queryClient.clear();
    });
});
