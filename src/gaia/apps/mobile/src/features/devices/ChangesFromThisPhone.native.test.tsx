// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { DeviceChange } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { Screen, ScreenBannerProvider, UIProvider } from '@/ui';

import { CHANGES_SHOWN, ChangesFromThisPhone } from './ChangesFromThisPhone';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const t = translator('en');

function rows(n: number, kind = 'localOnlyOff'): DeviceChange[] {
    return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, kind, params: {}, at: new Date(Date.now() - i * 60_000).toISOString() }));
}

async function show(deviceChanges: DeviceChange[]) {
    const client = createFakeClient({ deviceChanges });
    const spy = jest.spyOn(client, 'listDeviceChanges');
    await render(
        <SafeAreaProvider initialMetrics={METRICS}>
            <QueryClientProvider client={new QueryClient()}>
                <GaiaClientProvider client={client}>
                    <UIProvider>
                        <ScreenBannerProvider banner={null}>
                            <Screen scroll>
                                <ChangesFromThisPhone deviceId="d1" pcName="Studio PC" />
                            </Screen>
                        </ScreenBannerProvider>
                    </UIProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        </SafeAreaProvider>,
    );
    return spy;
}

describeNative('Changes made from this phone', () => {
    it('reads nothing until opened, then shows the newest 20 and offers Show all only past 20', async () => {
        const spy = await show(rows(25));
        expect(spy).not.toHaveBeenCalled();
        await fireEvent.press(screen.getByTestId('device-changes-toggle'));
        expect(await screen.findByTestId('device-change-0')).toBeTruthy();
        expect(spy).toHaveBeenCalledWith('d1', CHANGES_SHOWN, expect.anything());
        expect(screen.getAllByText(t('settings.devices.change.localOnlyOff'))).toHaveLength(CHANGES_SHOWN);
        expect(screen.getByTestId('device-changes-show-all')).toBeTruthy();
    });

    it('has no Show all at exactly 20, and says so when there are none', async () => {
        await show(rows(CHANGES_SHOWN));
        await fireEvent.press(screen.getByTestId('device-changes-toggle'));
        await screen.findByTestId('device-change-0');
        expect(screen.queryByTestId('device-changes-show-all')).toBeNull();
    });

    it('shows a kind it does not know as "Changed a setting" with the kind id under it', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        await show(rows(1, 'cameraEnabled'));
        await fireEvent.press(screen.getByTestId('device-changes-toggle'));
        expect(await screen.findByText(t('settings.devices.change.unknown'))).toBeTruthy();
        expect(screen.getByText('cameraEnabled')).toBeTruthy();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('cameraEnabled'));
        warn.mockRestore();
    });
});
