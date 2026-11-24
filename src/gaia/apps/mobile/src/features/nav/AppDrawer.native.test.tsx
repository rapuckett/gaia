// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { translator } from '@webui/i18n/translator';

import { activeRunsKey } from '@/data/activeRuns';
import { buildChatSections, rowText } from '@/features/chats/chatList';
import { useComposerQueueStore } from '@/features/composer/composerQueue';
import { ThemeProvider } from '@/ui';

import { AppDrawer } from './AppDrawer';

jest.mock('expo-router/drawer', () => ({ useDrawerStatus: () => 'closed' }));
jest.mock('expo-router', () => ({ usePathname: () => '/', useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
type DrawerProps = { onClose?: () => void; live?: import('@/features/chats/chatList').LiveRuns; queues?: Record<string, { state: string }[]> };
const mockContent = jest.fn((_props: DrawerProps) => null);
jest.mock('@/features/chats/ChatDrawerContent', () => ({ ChatDrawerContent: (props: DrawerProps) => mockContent(props) }));

function mount(width: number, navigation: { closeDrawer: jest.Mock }, seed?: (client: QueryClient) => void) {
    const client = new QueryClient();
    seed?.(client);
    Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
    const props = { navigation, state: { routeNames: [] } } as unknown as ComponentProps<typeof AppDrawer>;
    const ui = (
        <QueryClientProvider client={client}>
            <ThemeProvider>
                <AppDrawer {...props} />
            </ThemeProvider>
        </QueryClientProvider>
    );
    return render(ui);
}

describe('AppDrawer rotation', () => {
    it('closes an open overlay when a rotation makes the drawer permanent', async () => {
        const navigation = { closeDrawer: jest.fn() };
        await mount(768, navigation);
        expect(navigation.closeDrawer).not.toHaveBeenCalled();
        await act(async () => Dimensions.set({ window: { width: 1024, height: 768, scale: 2, fontScale: 1 } }));
        expect(navigation.closeDrawer).toHaveBeenCalledTimes(1);
    });

    it('marks the sidebar container for audits', async () => {
        const { getByTestId } = await mount(1024, { closeDrawer: jest.fn() });
        expect(getByTestId('app-sidebar')).toBeTruthy();
    });

    it('draws our themed divider on the inline-end edge whenever the sidebar is permanent, and none on the overlay', async () => {
        const permanent = await mount(1024, { closeDrawer: jest.fn() });
        const style = StyleSheet.flatten(permanent.getByTestId('app-sidebar').props.style);
        expect(style.borderEndWidth).toBe(StyleSheet.hairlineWidth);
        expect(style.borderEndColor).toBeTruthy();
        expect(style.borderStartWidth).toBeUndefined();
        await permanent.unmount();
        const overlay = await mount(768, { closeDrawer: jest.fn() });
        expect(StyleSheet.flatten(overlay.getByTestId('app-sidebar').props.style).borderEndWidth).toBeUndefined();
    });

    it('gives the overlay a close button and the permanent sidebar none', async () => {
        await mount(768, { closeDrawer: jest.fn() });
        expect(mockContent.mock.lastCall?.[0].onClose).toEqual(expect.any(Function));
        await mount(1024, { closeDrawer: jest.fn() });
        expect(mockContent.mock.lastCall?.[0].onClose).toBeUndefined();
    });
});

describe('AppDrawer row data', () => {
    it("carries the PC's place in line and the composer queue to the row's note", async () => {
        useComposerQueueStore.setState({ byChat: { q: [{ id: 1, text: 'a', state: 'queued' }, { id: 2, text: 'b', state: 'queued' }], f: [{ id: 3, text: 'c', state: 'failed' }] }, drafts: {} });
        await mount(768, { closeDrawer: jest.fn() }, (c) => c.setQueryData(activeRunsKey, { session_ids: ['r'], queued: ['q'], awaiting_user: {} }));
        const props = mockContent.mock.lastCall![0];
        const now = new Date(2026, 10, 12, 12, 0, 0);
        const session = (id: string) => ({ id, title: id, created_at: now.toISOString(), updated_at: now.toISOString(), model: 'm', system_prompt: null, message_count: 1, document_ids: [] });
        const rows = buildChatSections({ sessions: ['q', 'f'].map(session), live: props.live, queues: props.queues, now }).flatMap((g) => g.data);
        const t = translator('en');
        expect(props.live?.running).toContain('r');
        expect(rowText(rows.find((r) => r.id === 'q')!, t).note).toBe('1st in line · 2 to send');
        expect(rowText(rows.find((r) => r.id === 'f')!, t)).toMatchObject({ note: '1 not sent', noteFailed: true });
        useComposerQueueStore.setState({ byChat: {}, drafts: {} });
    });
});
