// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import type { SystemStatus } from '@/api/client.types';
import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { MODEL_SCENES } from './devScenes';
import { ModelServerDownNotice } from './ModelServerDownNotice';

const t = translator('en');

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const RUNNING = { lemonade_running: true } as SystemStatus;
const NEEDS_SETUP = { lemonade_running: false, start_command: 'gaia init' } as SystemStatus;

/** The fake's model status never changes by itself: after a switch it reads as up, as the PC's would. */
async function mount(data: FakeClientData) {
    const client = createFakeClient({ status: RUNNING, ...data });
    const stopped = client.getLocalModelStatus;
    client.getLocalModelStatus = async (o) => ({ ...(await stopped(o)), ...(client.targetSets.length ? { state: 'idle' as const, owner: 'gaia' } : {}) });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>{children}</ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ModelServerDownNotice />, { wrapper: wrap });
    return client;
}

// A copy: the fake client replaces the target on a switch, and scenes are shared.
const scene = (name: string): FakeClientData => ({ ...MODEL_SCENES[name].data });
const CHECK = t('settings.key.checkAgain');

describeNative('ModelServerDownNotice offers', () => {
    it("Start for GAIA's own server, with Check again", async () => {
        await mount(scene('down-ours'));
        expect(await screen.findByText(t('serverDown.start'))).toBeTruthy();
        expect(screen.getByText(CHECK)).toBeTruthy();
        expect(screen.queryByText(t('serverDown.useOwn'))).toBeNull();
        expect(screen.queryByText(t('mobileApp.serverDown.notOurs'))).toBeNull();
    });

    it("Use GAIA's own server for another server the PC may leave", async () => {
        await mount(scene('down-switch'));
        expect(await screen.findByText(t('serverDown.useOwn'))).toBeTruthy();
        expect(screen.getByText(CHECK)).toBeTruthy();
        expect(screen.queryByText(t('serverDown.start'))).toBeNull();
        expect(screen.queryByText(t('mobileApp.serverDown.notOurs'))).toBeNull();
    });

    it('only the PC-side explanation when the environment pins the server', async () => {
        await mount(scene('down-switch-env'));
        expect(await screen.findByText(t('mobileApp.serverDown.notOurs'))).toBeTruthy();
        expect(screen.queryByText(t('serverDown.useOwn'))).toBeNull();
        expect(screen.queryByText(t('serverDown.start'))).toBeNull();
        expect(screen.getByText(CHECK)).toBeTruthy();
    });
});

describeNative('ModelServerDownNotice switching', () => {
    it('sends gaia only, then shows the success notice and announces it once on iOS', async () => {
        const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
        const os = Platform.OS;
        Platform.OS = 'ios';
        try {
            const client = await mount(scene('down-switch'));
            fireEvent.press(await screen.findByText(t('serverDown.useOwn')));
            expect(await screen.findByTestId('server-down-back')).toBeTruthy();
            expect(screen.getByText(t('serverDown.back'))).toBeTruthy();
            expect(client.targetSets).toEqual([{ mode: 'gaia' }]);
            expect(announce).toHaveBeenCalledTimes(1);
            expect(announce).toHaveBeenCalledWith(t('serverDown.back'));
        } finally {
            Platform.OS = os;
            announce.mockRestore();
        }
    });

    it("shows no 'back' notice while GAIA's own server still needs setting up on the PC", async () => {
        const client = await mount({ ...scene('down-switch'), status: NEEDS_SETUP });
        fireEvent.press(await screen.findByText(t('serverDown.useOwn')));
        await waitFor(() => expect(client.targetSets).toEqual([{ mode: 'gaia' }]));
        await waitFor(() => expect(screen.queryByTestId('server-down-notice')).toBeNull());
        expect(screen.queryByTestId('server-down-back')).toBeNull();
        expect(screen.queryByText(t('serverDown.back'))).toBeNull();
    });

    it("a 403 reads as the PC-only notice, not an error", async () => {
        await mount({ ...scene('down-switch'), serverChangeError: new GaiaApiError(403, 'Forbidden') });
        fireEvent.press(await screen.findByText(t('serverDown.useOwn')));
        expect(await screen.findByText(t('mobileApp.settings.pcOnly'))).toBeTruthy();
        expect(screen.queryByTestId('server-down-switch-error')).toBeNull();
    });

    it('another failure shows a sentence with the raw cause on its own line', async () => {
        await mount({ ...scene('down-switch'), serverChangeError: new GaiaApiError(500, 'port 13305 is in use') });
        fireEvent.press(await screen.findByText(t('serverDown.useOwn')));
        expect(await screen.findByTestId('server-down-switch-error')).toBeTruthy();
        expect(screen.getByText('port 13305 is in use')).toBeTruthy();
        expect(screen.queryByTestId('server-down-back')).toBeNull();
    });
});
