// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BackHandler, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaPinMismatchError } from '@/api/errors';
import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

import { createFakePairingService } from './fakePairingService';
import { PairingFlow } from './PairingFlow';
import { setPairingService } from './registry';

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const t = translator('en');

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <UIProvider>{children}</UIProvider>
    </SafeAreaProvider>
);

const INVITE = JSON.stringify({
    v: 1,
    name: 'Office PC',
    pc_id: 'a1'.repeat(16),
    origins: ['https://192.168.1.20:4243'],
    pin: 'ab'.repeat(32),
    invite: 'abc123_-xyz',
    exp: Math.floor(Date.now() / 1000) + 600,
});

let backHandlers: (() => boolean)[] = [];

async function pressBack(): Promise<boolean> {
    let handled = false;
    await act(async () => {
        handled = [...backHandlers].reverse().some((handler) => handler());
    });
    return handled;
}

describeNative('PairingFlow', () => {
    beforeEach(() => {
        backHandlers = [];
        jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
            backHandlers.push(handler as () => boolean);
            return { remove: () => (backHandlers = backHandlers.filter((h) => h !== handler)) };
        });
        useConnectionStore.setState({ connection: null, restored: true });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        setPairingService(null);
    });

    it('goes back to the screen it was opened from at its first step, one step per press (Android back)', async () => {
        setPairingService(createFakePairingService());
        const onExit = jest.fn();
        await render(<PairingFlow initialStep="how" onExit={onExit} />, { wrapper: wrap });
        await fireEvent.press(await screen.findByText(t('mobileApp.pairing.how.paste')));
        await screen.findByTestId('pairing-input');

        expect(await pressBack()).toBe(true);
        expect(onExit).not.toHaveBeenCalled();
        expect(await pressBack()).toBe(true);
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('shows a platform-labeled up control at step 1 only when opened from another screen, and it returns there', async () => {
        setPairingService(createFakePairingService());
        const onExit = jest.fn();
        const label = t(Platform.OS === 'ios' ? 'mobileApp.nav.back' : 'mobileApp.nav.up');
        await render(<PairingFlow initialStep="how" onExit={onExit} />, { wrapper: wrap });
        await screen.findByText(t('mobileApp.pairing.how.title'));
        expect(screen.queryByText(t('mobileApp.pairing.manual.back'))).toBeNull();
        await fireEvent.press(screen.getByLabelText(label));
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('stretches the how-to-pair page to the gutter in English, not to its text', async () => {
        setPairingService(createFakePairingService());
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await screen.findByText(t('mobileApp.pairing.how.step4'));
        expect(StyleSheet.flatten(screen.getByTestId('pairing-page').props.style)).toMatchObject({ width: '100%', maxWidth: 560, alignSelf: 'center' });
    });

    it('has no up control on first run', async () => {
        setPairingService(createFakePairingService());
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await screen.findByText(t('mobileApp.pairing.how.title'));
        expect(screen.queryByTestId('pairing-up')).toBeNull();
    });

    it('leaves back to the system when nothing opened it', async () => {
        setPairingService(createFakePairingService());
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await screen.findByText(t('mobileApp.pairing.how.title'));
        expect(await pressBack()).toBe(false);
    });

    it('says a first pairing with a wrong pin did not pair, not that the phone stopped connecting', async () => {
        const service = createFakePairingService();
        service.list = async () => [];
        service.redeem = async () => {
            throw new GaiaPinMismatchError();
        };
        setPairingService(service);
        await render(<PairingFlow initialStep="manual" />, { wrapper: wrap });
        await fireEvent.changeText(await screen.findByTestId('pairing-input'), INVITE);
        await fireEvent.press(screen.getByText(t('mobileApp.pairing.manual.submit')));
        await fireEvent.press(await screen.findByTestId('pairing-confirm'));
        expect(await screen.findByText(t('mobileApp.pairing.pinMismatch.first'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.pairing.pinMismatch'))).toBeNull();
    });
});
