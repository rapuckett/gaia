// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BackHandler, Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

import { createFakePairingService } from './fakePairingService';
import { PairingGate } from './PairingGate';
import { setPairingService } from './registry';
import type { PairingService, RedeemResult } from './service';

const describeAndroid = Platform.OS === 'android' ? describe : describe.skip;

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
let service: PairingService;

/** Android's back: the newest handler first; false means none took it, so the system leaves the app. */
async function pressBack(): Promise<boolean> {
    let handled = false;
    await act(async () => {
        handled = [...backHandlers].reverse().some((handler) => handler());
    });
    return handled;
}

async function renderGate() {
    await render(
        <PairingGate>
            <Text>app</Text>
        </PairingGate>,
        { wrapper: wrap },
    );
}

async function openConfirm() {
    await fireEvent.press(screen.getByText('Pair with my PC'));
    await fireEvent.press(await screen.findByText('Paste the link or code instead'));
    await fireEvent.changeText(await screen.findByTestId('pairing-input'), INVITE);
    await fireEvent.press(screen.getByText('Pair'));
    await screen.findByText('Pair with Office PC?');
}

describeAndroid('PairingGate on Android', () => {
    beforeEach(() => {
        backHandlers = [];
        jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
            backHandlers.push(handler as () => boolean);
            return { remove: () => (backHandlers = backHandlers.filter((h) => h !== handler)) };
        });
        service = createFakePairingService({ pendingPolls: 1000 });
        setPairingService(service);
        useConnectionStore.setState({ connection: null, restored: true });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('shows the pairing screens when no PC is connected, and the app once one is', async () => {
        await renderGate();
        expect(await screen.findByText('Pair with my PC')).toBeTruthy();
        expect(screen.queryByText('app')).toBeNull();

        await act(async () => {
            useConnectionStore.setState({ connection: { baseUrl: 'https://192.168.1.20:4243', pcId: 'a1'.repeat(16), pinned: true } });
        });
        expect(screen.getByText('app')).toBeTruthy();
        expect(screen.queryByText('Pair with my PC')).toBeNull();
    });

    it('walks back one step per press, and leaves from the first screen', async () => {
        await renderGate();
        await fireEvent.press(await screen.findByText('Pair with my PC'));
        await fireEvent.press(await screen.findByText('Paste the link or code instead'));
        await screen.findByTestId('pairing-input');

        expect(await pressBack()).toBe(true);
        expect(screen.getByText('How to pair')).toBeTruthy();
        expect(await pressBack()).toBe(true);
        expect(screen.getByText('Pair with my PC')).toBeTruthy();
        expect(await pressBack()).toBe(false);
    });

    it('takes back a request waiting for Allow, leaving nothing staged', async () => {
        const cancel = jest.spyOn(service, 'cancel');
        await renderGate();
        await screen.findByText('Pair with my PC');
        await openConfirm();

        expect(await pressBack()).toBe(true);
        expect(screen.getByTestId('pairing-input')).toBeTruthy();
        expect(cancel).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByText('Pair'));
        await fireEvent.press(await screen.findByTestId('pairing-confirm'));
        await screen.findByText('Waiting for your PC');
        expect(await pressBack()).toBe(true);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(screen.getByText('How to pair')).toBeTruthy();
        expect(await service.status()).toEqual({ state: 'none' });
    });

    it('takes back a code still being redeemed when back is pressed', async () => {
        let answer: (result: RedeemResult) => void = () => undefined;
        jest.spyOn(service, 'redeem').mockImplementation(() => new Promise((resolve) => (answer = resolve)));
        const cancel = jest.spyOn(service, 'cancel');
        await renderGate();
        await screen.findByText('Pair with my PC');
        await openConfirm();

        await fireEvent.press(screen.getByTestId('pairing-confirm'));
        expect(await pressBack()).toBe(true);
        expect(screen.getByTestId('pairing-input')).toBeTruthy();

        await act(async () => answer({ state: 'pending', pcName: 'Office PC' }));
        await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
        expect(screen.queryByText('Waiting for your PC')).toBeNull();
    });
});
