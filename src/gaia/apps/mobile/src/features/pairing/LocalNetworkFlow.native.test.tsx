// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus, Linking, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

import { createFakePairingService } from './fakePairingService';
import type { PairingInvite } from './invite';
import { localNetworkStep, markAllowed, markExplained } from './localNetwork';
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

const mockNetwork = { type: 'WIFI', isConnected: true };
jest.mock('expo-network', () => ({
    getNetworkStateAsync: async () => mockNetwork,
    NetworkStateType: { WIFI: 'WIFI', ETHERNET: 'ETHERNET', CELLULAR: 'CELLULAR', NONE: 'NONE' },
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const itIos = Platform.OS === 'ios' ? it : it.skip;
const itAndroid = Platform.OS === 'android' ? it : it.skip;
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

/** A fake pairing service that logs every call that would reach the PC; `answers` are redeem's results, in turn. */
function recordingService(answers: RedeemResult[]) {
    const reached: string[] = [];
    const service: PairingService = createFakePairingService();
    service.redeem = async (invite: PairingInvite) => {
        reached.push(`redeem ${invite.origins.join(',')}`);
        return answers.length > 1 ? answers.shift()! : answers[0]!;
    };
    setPairingService(service);
    return reached;
}

let appStateListeners: ((state: AppStateStatus) => void)[] = [];

/** The app leaving for `away` and coming back, as iOS's prompt (inactive) or a trip to Settings (background) does. */
async function leaveAndReturn(away: AppStateStatus = 'background') {
    await act(async () => {
        for (const state of [away, 'active'] as AppStateStatus[]) {
            Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
            [...appStateListeners].forEach((listener) => listener(state));
        }
    });
}

async function scanAndPair() {
    await fireEvent.press(await screen.findByText(t('mobileApp.pairing.how.scan')));
    await screen.findByTestId('camera-view');
    await act(async () => mockCamera.current!.onBarcodeScanned({ data: INVITE }));
    await fireEvent.press(await screen.findByTestId('pairing-confirm'));
}

describeNative('the local network explainer and denied card', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        mockNetwork.type = 'WIFI';
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

    itIos('shows the explainer after a scan, and nothing reaches the PC until Continue makes the first connection', async () => {
        const reached = recordingService([{ state: 'pending', pcName: 'Office PC' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();

        expect(await screen.findByText(t('mobileApp.localNetwork.title'))).toBeTruthy();
        expect(screen.getByText(t('mobileApp.localNetwork.privacy'))).toBeTruthy();
        expect(screen.getByText(t('mobileApp.localNetwork.next'))).toBeTruthy();
        expect(reached).toEqual([]);

        await fireEvent.press(screen.getByTestId('local-network-continue'));
        expect(await screen.findByText(t('mobileApp.pairing.waiting.title'))).toBeTruthy();
        expect(reached).toEqual(['redeem https://192.168.1.20:4243']);
    });

    itAndroid('goes straight to the first connection on Android, which asks nothing at the target SDK in use', async () => {
        const reached = recordingService([{ state: 'pending', pcName: 'Office PC' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();

        expect(await screen.findByText(t('mobileApp.pairing.waiting.title'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.localNetwork.title'))).toBeNull();
        expect(reached).toHaveLength(1);
    });

    itIos('shows the denied card for a fast failure on Wi-Fi, and Open Settings opens the app’s page', async () => {
        recordingService([{ state: 'unreachable' }]);
        const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();
        await fireEvent.press(await screen.findByTestId('local-network-continue'));

        expect(await screen.findByText(t('mobileApp.localNetwork.deniedBody'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.pairing.off.title'))).toBeNull();
        await fireEvent.press(screen.getByTestId('local-network-settings'));
        expect(openSettings).toHaveBeenCalledTimes(1);
    });

    itIos('keeps the generic "can’t reach your PC" off Wi-Fi, where the permission isn’t the cause', async () => {
        mockNetwork.type = 'CELLULAR';
        recordingService([{ state: 'unreachable' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();
        await fireEvent.press(await screen.findByTestId('local-network-continue'));

        expect(await screen.findByText(t('mobileApp.pairing.off.title'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.localNetwork.deniedBody'))).toBeNull();
    });

    itIos('tries once each time the app comes back, keeps the card on failure with no loop, and moves on once the PC answers', async () => {
        const reached = recordingService([{ state: 'unreachable' }, { state: 'unreachable' }, { state: 'pending', pcName: 'Office PC' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();
        await fireEvent.press(await screen.findByTestId('local-network-continue'));
        await screen.findByText(t('mobileApp.localNetwork.deniedBody'));
        expect(reached).toHaveLength(1);

        await leaveAndReturn();
        expect(reached).toHaveLength(2);
        await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
        expect(reached).toHaveLength(2);
        expect(screen.getByText(t('mobileApp.localNetwork.deniedBody'))).toBeTruthy();

        await leaveAndReturn('inactive');
        expect(await screen.findByText(t('mobileApp.pairing.waiting.title'))).toBeTruthy();
        expect(reached).toHaveLength(3);
    });

    itIos('shows the explainer once per install: once it was shown, a pairing goes straight to the first connection', async () => {
        await markExplained();
        const reached = recordingService([{ state: 'unreachable' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();

        expect(await screen.findByText(t('mobileApp.localNetwork.deniedBody'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.localNetwork.title'))).toBeNull();
        expect(reached).toHaveLength(1);
    });

    itIos('remembers that a PC at home answered', async () => {
        recordingService([{ state: 'refused' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();
        await fireEvent.press(await screen.findByTestId('local-network-continue'));
        await screen.findByText(t('mobileApp.pairing.refused.title'));
        expect(await localNetworkStep(['https://192.168.1.20:4243'], false)).toBe('known');
    });

    itIos('once a PC at home has answered, goes straight to the first connection and keeps the generic message on a failure', async () => {
        await markAllowed();
        const reached = recordingService([{ state: 'unreachable' }]);
        await render(<PairingFlow initialStep="how" />, { wrapper: wrap });
        await scanAndPair();

        expect(await screen.findByText(t('mobileApp.pairing.off.title'))).toBeTruthy();
        expect(screen.queryByText(t('mobileApp.localNetwork.title'))).toBeNull();
        expect(reached).toHaveLength(1);
    });
});
