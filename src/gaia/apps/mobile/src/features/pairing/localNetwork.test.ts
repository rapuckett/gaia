// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DENIED_FAST_MS, localNetworkStep, looksDenied, markAllowed, markExplained } from './localNetwork';

const mockNetwork = { type: 'WIFI', isConnected: true };
jest.mock('expo-network', () => ({
    getNetworkStateAsync: async () => mockNetwork,
    NetworkStateType: { WIFI: 'WIFI', ETHERNET: 'ETHERNET', CELLULAR: 'CELLULAR', NONE: 'NONE' },
}));

const HOME = ['https://192.168.1.20:4243'];

describe('localNetworkStep', () => {
    beforeEach(() => AsyncStorage.clear());

    it('explains first on iOS for a home address, and on no other platform', async () => {
        expect(await localNetworkStep(HOME, false, 'ios')).toBe('explain');
        expect(await localNetworkStep(HOME, false, 'android')).toBe('known');
        expect(await localNetworkStep(HOME, false, 'web')).toBe('known');
    });

    it('asks nothing for an address off the local network, or on a phone already paired', async () => {
        expect(await localNetworkStep(['https://100.101.102.103:4243'], false, 'ios')).toBe('known');
        expect(await localNetworkStep(HOME, true, 'ios')).toBe('known');
    });

    it('watches for a denial once explained, and stops once a home address has answered', async () => {
        await markExplained();
        expect(await localNetworkStep(HOME, false, 'ios')).toBe('watch');
        await markAllowed();
        expect(await localNetworkStep(HOME, false, 'ios')).toBe('known');
    });
});

describe('looksDenied', () => {
    beforeEach(() => {
        mockNetwork.type = 'WIFI';
        mockNetwork.isConnected = true;
    });

    it('takes a fast failure on Wi-Fi, or one while the prompt was up, for the permission', async () => {
        expect(await looksDenied({ elapsedMs: 20, leftForeground: false })).toBe(true);
        expect(await looksDenied({ elapsedMs: 8000, leftForeground: true })).toBe(true);
    });

    it('leaves a slow failure, or any failure off Wi-Fi, to the generic message', async () => {
        expect(await looksDenied({ elapsedMs: DENIED_FAST_MS, leftForeground: false })).toBe(false);
        mockNetwork.type = 'CELLULAR';
        expect(await looksDenied({ elapsedMs: 20, leftForeground: false })).toBe(false);
        mockNetwork.type = 'WIFI';
        mockNetwork.isConnected = false;
        expect(await looksDenied({ elapsedMs: 20, leftForeground: false })).toBe(false);
    });
});
