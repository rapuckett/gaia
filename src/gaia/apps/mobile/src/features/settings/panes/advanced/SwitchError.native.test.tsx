// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { SwitchError } from './errors';

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const show = (error: unknown) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <SwitchError error={error} />
            </ThemeProvider>
        </SafeAreaProvider>,
    );

describeNative('SwitchError', () => {
    it('a failed check of your server shows our sentence and none of what the PC sent', async () => {
        const probe = "GAIA couldn't use a Lemonade Server at that address. Check the address and key, and that the PC running GAIA can reach the server.";
        await show(new GaiaApiError(422, probe));

        expect(screen.getByTestId('advanced-server-probe-failed')).toBeTruthy();
        expect(screen.getByText(t('mobileApp.settings.serverProbeFailed'))).toBeTruthy();
        expect(screen.queryByText(probe)).toBeNull();
        expect(screen.queryByText(t('settings.errors.details'))).toBeNull();
    });

    it('a second try within 10 s says to wait, not that the switch failed', async () => {
        await show(new GaiaApiError(429, 'This was just tried. Wait 7 s, then try again.', undefined, undefined, null, 7));

        expect(screen.getByTestId('advanced-server-too-soon')).toBeTruthy();
        expect(screen.getByText(t('mobileApp.approveOnPc.tooSoon'))).toBeTruthy();
        expect(screen.queryByText(t('settings.server.notSwitched'))).toBeNull();
    });

    it('a refusal from the PC shows the PC-only notice', async () => {
        await show(new GaiaApiError(403, 'Do this on the PC running GAIA.'));

        expect(screen.getByTestId('advanced-pc-only')).toBeTruthy();
    });
});
