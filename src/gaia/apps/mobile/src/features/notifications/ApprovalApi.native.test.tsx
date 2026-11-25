// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { APPROVAL_ARM_MS } from '@webui/utils/permissionPrompts.core';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import { useNotificationStore } from '@/state/notifications';
import { createRecordingFetch, jsonResponse, type RecordedCall } from '@/test-support/fakeFetch';
import { ThemeProvider } from '@/ui';

import { NOTIFICATION_SCENES, resolveSceneItems } from './devScenes';
import { NotificationCenterScreen } from './NotificationCenterScreen';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

// The PC's route (src/gaia/ui/routers/chat.py `confirm_tool`, model ToolConfirmRequest): POST /api/chat/confirm-tool
// with session_id, approved, always and confirm_id. Those four names match the phone's body. The PC also accepts an
// optional `source: "notification"` that only changes its audit line; the phone leaves it out, which is harmless.

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');
const BASE = 'http://192.168.1.20:4200';

async function mount() {
    const { fetch, calls } = createRecordingFetch(() => jsonResponse({ status: 'ok', approved: true, granted: null }));
    const client = createHttpClient({ baseUrl: BASE, token: 'tok-1', fetch });
    const spec = NOTIFICATION_SCENES['permission-pending']!;
    useNotificationStore.setState({ items: resolveSceneItems(spec, t), filter: spec.filter ?? null });
    useChatStreamStore.setState({ turns: { 's-chat': { pendingPermission: { confirm_id: 'confirm-1' } } } } as never);
    await render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <GaiaClientProvider client={client}>
                    <ThemeProvider>
                        <NotificationCenterScreen onBack={jest.fn()} onOpenChat={jest.fn()} />
                    </ThemeProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        </SafeAreaProvider>,
    );
    return calls;
}

const armed = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, APPROVAL_ARM_MS + 50)); });
const confirms = (calls: RecordedCall[]) => calls.filter((c) => c.url.endsWith('/api/chat/confirm-tool'));

afterEach(() => {
    useNotificationStore.setState({ items: [], filter: null });
    useChatStreamStore.setState({ turns: {} } as never);
});

describeNative('NTF-04: Approve and Deny in the notification center', () => {
    it('a press before the arm wait is over sends nothing', async () => {
        const calls = await mount();
        await fireEvent.press(screen.getByTestId('ntf-approve'));
        await fireEvent.press(screen.getByTestId('ntf-deny'));
        await armed();
        expect(confirms(calls)).toEqual([]);
        expect(screen.getByTestId('ntf-approve')).toBeTruthy();
    });

    it('Approve posts approved:true for that request id and the item leaves the pending state', async () => {
        const calls = await mount();
        await armed();
        await fireEvent.press(screen.getByTestId('ntf-approve'));
        await waitFor(() => expect(confirms(calls)).toHaveLength(1));
        expect(confirms(calls)[0]).toMatchObject({ method: 'POST', url: `${BASE}/api/chat/confirm-tool`, headers: { Authorization: 'Bearer tok-1' } });
        expect(JSON.parse(confirms(calls)[0]!.body as string)).toEqual({ session_id: 's-chat', approved: true, always: false, confirm_id: 'confirm-1' });
        await waitFor(() => expect(screen.queryByTestId('ntf-approve')).toBeNull());
        expect(screen.queryByTestId('ntf-deny')).toBeNull();
        expect(screen.getByText(t('notifications.approved'))).toBeTruthy();
    });

    it('Deny posts approved:false for that request id and the item leaves the pending state', async () => {
        const calls = await mount();
        await armed();
        await fireEvent.press(screen.getByTestId('ntf-deny'));
        await waitFor(() => expect(confirms(calls)).toHaveLength(1));
        expect(confirms(calls)[0]).toMatchObject({ method: 'POST', url: `${BASE}/api/chat/confirm-tool` });
        expect(JSON.parse(confirms(calls)[0]!.body as string)).toEqual({ session_id: 's-chat', approved: false, always: false, confirm_id: 'confirm-1' });
        await waitFor(() => expect(screen.queryByTestId('ntf-deny')).toBeNull());
        expect(screen.getByText(t('notifications.denied'))).toBeTruthy();
    });
});
