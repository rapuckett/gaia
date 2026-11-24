// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

import type { LocalNetworkReason } from '../../../modules/gaia-transport';
import { createFakePairingService } from './fakePairingService';
import { PairingFlow } from './PairingFlow';
import { setPairingService } from './registry';
import type { PairingService, RedeemResult } from './service';

const mockCamera: { current: { onBarcodeScanned: (r: { data: string }) => void } | null } = { current: null };
jest.mock('expo-camera', () => ({
    CameraView: (props: { onBarcodeScanned: (r: { data: string }) => void }) => {
        mockCamera.current = props;
        return jest.requireActual('react').createElement('View', { testID: 'camera-view' });
    },
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

// On Wi-Fi with fast failures, the guess alone would always say "denied"; these tests show the native answer wins.
jest.mock('expo-network', () => ({
    getNetworkStateAsync: async () => ({ type: 'WIFI', isConnected: true }),
    NetworkStateType: { WIFI: 'WIFI', ETHERNET: 'ETHERNET', CELLULAR: 'CELLULAR', NONE: 'NONE' },
}));

/** The native check, or undefined for a build made before it. */
const mockTransport: { check?: jest.Mock<Promise<LocalNetworkReason>, [string]> } = {};
jest.mock('../../../modules/gaia-transport', () => ({
    transportAvailable: true,
    GaiaTransport: {
        get checkLocalNetwork() {
            return mockTransport.check;
        },
    },
}));

const itIos = Platform.OS === 'ios' ? it : it.skip;
const t = translator('en');
const ORIGIN = 'https://192.168.1.20:4243';

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <UIProvider>{children}</UIProvider>
    </SafeAreaProvider>
);

const INVITE = JSON.stringify({
    v: 1,
    name: 'Office PC',
    pc_id: 'a1'.repeat(16),
    origins: [ORIGIN],
    pin: 'ab'.repeat(32),
    invite: 'abc123_-xyz',
    exp: Math.floor(Date.now() / 1000) + 600,
});

/** `answers` are redeem's results, in turn; the last one repeats. */
function answering(answers: RedeemResult[]) {
    const service: PairingService = createFakePairingService();
    service.redeem = async () => (answers.length > 1 ? answers.shift()! : answers[0]!);
    setPairingService(service);
}

function nativeSays(...reasons: LocalNetworkReason[]) {
    const check = jest.fn<Promise<LocalNetworkReason>, [string]>();
    for (const reason of reasons) check.mockResolvedValueOnce(reason);
    check.mockResolvedValue(reasons[reasons.length - 1]!);
    mockTransport.check = check;
    return check;
}

let appStateListeners: ((state: AppStateStatus) => void)[] = [];

async function leaveAndReturn() {
    await act(async () => {
        for (const state of ['background', 'active'] as AppStateStatus[]) {
            Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
            [...appStateListeners].forEach((listener) => listener(state));
        }
    });
}

async function scanAndConfirm() {
    await fireEvent.press(await screen.findByText(t('mobileApp.pairing.how.scan')));
    await screen.findByTestId('camera-view');
    await act(async () => mockCamera.current!.onBarcodeScanned({ data: INVITE }));
    await fireEvent.press(await screen.findByTestId('pairing-confirm'));
    await screen.findByTestId('local-network-continue');
}

describe("iOS's native local network check", () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        delete mockTransport.check;
        appStateListeners = [];
        Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
        jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: AppStateStatus) => void) => {
            appStateListeners.push(listener);
            return { remove: () => (appStateListeners = appStateListeners.filter((l) => l !== listener)) };
        }) as unknown as typeof AppState.addEventListener);
        useConnectionStore.setState({ connection: null, restored: true });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        setPairingService(null);
        mockCamera.current = null;
    });

    itIos('shows the denied card when iOS reports the setting off, checking only after Continue’s connection failed', async () => {
        answering([{ state: 'unreachable' }]);
        const check = nativeSays('local_network_denied');
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndConfirm();
        expect(check).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByTestId('local-network-continue'));
        expect(await screen.findByText(t('mobileApp.localNetwork.deniedBody'))).toBeTruthy();
        expect(check).toHaveBeenCalledTimes(1);
        expect(check).toHaveBeenCalledWith(ORIGIN);
    });

    itIos.each<LocalNetworkReason>(['refused', 'timeout', 'unreachable'])('keeps the generic message when the native check says %s', async (reason) => {
        answering([{ state: 'unreachable' }]);
        nativeSays(reason);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndConfirm();
        await fireEvent.press(screen.getByTestId('local-network-continue'));

        expect(await screen.findByText(t('mobileApp.pairing.off.title'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.localNetwork.deniedBody'))).toBeNull();
    });

    itIos('never checks when the PC answered', async () => {
        answering([{ state: 'pending', pcName: 'Office PC' }]);
        const check = nativeSays('local_network_denied');
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndConfirm();
        await fireEvent.press(screen.getByTestId('local-network-continue'));

        expect(await screen.findByText(t('mobileApp.pairing.waiting.title'))).toBeTruthy();
        expect(check).not.toHaveBeenCalled();
    });

    itIos('after access is turned on but the PC is closed, the retry leaves the denied card for the generic message', async () => {
        answering([{ state: 'unreachable' }]);
        nativeSays('local_network_denied', 'refused');
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndConfirm();
        await fireEvent.press(screen.getByTestId('local-network-continue'));
        await screen.findByText(t('mobileApp.localNetwork.deniedBody'));

        await leaveAndReturn();
        expect(await screen.findByText(t('mobileApp.pairing.off.title'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.localNetwork.deniedBody'))).toBeNull();
    });

    itIos('falls back to the guess in a build without the native check: a fast failure on Wi-Fi shows the denied card', async () => {
        answering([{ state: 'unreachable' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndConfirm();
        await fireEvent.press(screen.getByTestId('local-network-continue'));

        expect(await screen.findByText(t('mobileApp.localNetwork.deniedBody'))).toBeTruthy();
    });
});
