// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import { useNotificationStore } from '@/state/notifications';
import { tooSmall, touchables, unnamed, walk } from '@/test-support/a11y';
import { ThemeProvider } from '@/ui';

import { NOTIFICATION_SCENES, resolveSceneItems } from './devScenes';
import { NotificationCenterScreen } from './NotificationCenterScreen';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const mount = async (scene = 'permission-pending') => {
    const spec = NOTIFICATION_SCENES[scene]!;
    useNotificationStore.setState({ items: resolveSceneItems(spec, t), filter: spec.filter ?? null });
    useChatStreamStore.setState({
        turns: Object.fromEntries((spec.waiting ?? []).map((id) => [`s-chat`, { pendingPermission: { confirm_id: id } }])),
    } as never);
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={createFakeClient({})}>
                    <ThemeProvider>
                        <NotificationCenterScreen onBack={jest.fn()} onOpenChat={jest.fn()} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        </SafeAreaProvider>,
    );
};

afterEach(() => {
    useNotificationStore.setState({ items: [], filter: null });
    useChatStreamStore.setState({ turns: {} } as never);
});

describeNative('the notification center accessibility', () => {
    it('every control is named, has a role and holds 44 pt', async () => {
        await mount();
        const list = touchables();
        expect(list.length).toBeGreaterThanOrEqual(8);
        expect(unnamed(list)).toEqual([]);
        expect(tooSmall(list)).toEqual([]);
    });

    it('the filters expose which one is selected, and pressing one moves it', async () => {
        await mount();
        const chips = () => touchables().filter((x) => x.name === t('notifications.filter.all') || x.name === t('notifications.filter.errors'));
        expect(chips().map((c) => c.selected)).toEqual([true, false]);
        expect(chips().map((c) => c.role)).toEqual(['tab', 'tab']);
        expect(walk().some((n) => n.props.accessibilityRole === 'tablist')).toBe(true);
        await fireEvent.press(screen.getByText(t('notifications.filter.errors')));
        expect(chips().map((c) => c.selected)).toEqual([false, true]);
    });

    it('an approval reads agent, title, message, then Approve and Deny', async () => {
        await mount();
        const order = walk().map((n) => n.props.testID);
        const card = order.indexOf('ntf-confirm-1');
        expect(card).toBeGreaterThanOrEqual(0);
        expect(order.indexOf('ntf-approve')).toBeGreaterThan(card);
        expect(order.indexOf('ntf-approve')).toBeLessThan(order.indexOf('ntf-deny'));
        expect(touchables().find((x) => x.testID === 'ntf-approve')?.role).toBe('button');
    });

    it('a notification is read as one element that says when it is unread', async () => {
        await mount();
        const row = touchables().find((x) => x.name.includes('GAIA needs your OK'));
        expect(row?.name).toContain(t('row.unread'));
    });

    it('the buttons inside a row are reachable by screen-reader actions, since iOS reads the row as one element', async () => {
        await mount();
        const row = touchables().find((x) => x.name.includes('GAIA needs your OK'));
        const names = ((row!.node.props.accessibilityActions ?? []) as { name: string }[]).map((a) => a.name);
        expect(names).toEqual(expect.arrayContaining(['dismiss', 'approve', 'deny']));
    });

    it('an answered or expired approval offers only Dismiss', async () => {
        await mount('permission-answered');
        const row = touchables().find((x) => x.name.includes('GAIA needs your OK'));
        const names = ((row!.node.props.accessibilityActions ?? []) as { name: string }[]).map((a) => a.name);
        expect(names).toEqual(['dismiss']);
    });

    it('Mark all read says it is disabled when nothing is unread', async () => {
        await mount('all-read');
        expect(touchables().find((x) => x.testID === 'ntf-mark-all')?.disabled).toBe(true);
        expect(touchables().find((x) => x.testID === 'ntf-clear')?.disabled).toBe(false);
    });
});
