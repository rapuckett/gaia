// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LocalNetworkReason } from '../../../modules/gaia-transport';
import { DENIED_FAST_MS, localNetworkDenied, localNetworkStep, looksDenied, markAllowed, markExplained } from './localNetwork';

const mockNetwork = { type: 'WIFI', isConnected: true };
jest.mock('expo-network', () => ({
    getNetworkStateAsync: async () => mockNetwork,
    NetworkStateType: { WIFI: 'WIFI', ETHERNET: 'ETHERNET', CELLULAR: 'CELLULAR', NONE: 'NONE' },
}));

const mockTransport: { check?: jest.Mock<Promise<LocalNetworkReason>, [string]> } = {};
jest.mock('../../../modules/gaia-transport', () => ({
    GaiaTransport: {
        get checkLocalNetwork() {
            return mockTransport.check;
        },
    },
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

describe('localNetworkDenied', () => {
    const fast = { elapsedMs: 20, leftForeground: false, retrying: false };

    beforeEach(() => {
        delete mockTransport.check;
        mockNetwork.type = 'WIFI';
        mockNetwork.isConnected = true;
    });

    it('asks iOS about each home address only, and takes any denial as the setting being off', async () => {
        mockTransport.check = jest.fn(async (origin: string): Promise<LocalNetworkReason> => (origin.includes('10.0.0.5') ? 'local_network_denied' : 'refused'));
        expect(await localNetworkDenied([...HOME, 'https://10.0.0.5:4243', 'https://100.101.102.103:4243'], fast, 'ios')).toBe(true);
        expect(mockTransport.check.mock.calls).toEqual([[HOME[0]], ['https://10.0.0.5:4243']]);
    });

    it("trusts iOS's answer over the guess, even for a fast failure on Wi-Fi", async () => {
        mockTransport.check = jest.fn(async (_origin: string): Promise<LocalNetworkReason> => 'refused');
        expect(await localNetworkDenied(HOME, fast, 'ios')).toBe(false);
        expect(await localNetworkDenied(HOME, { ...fast, retrying: true }, 'ios')).toBe(false);
    });

    it('guesses without the native check, and never calls it off iOS', async () => {
        expect(await localNetworkDenied(HOME, fast, 'ios')).toBe(true);
        expect(await localNetworkDenied(HOME, { elapsedMs: 8000, leftForeground: false, retrying: true }, 'ios')).toBe(true);
        expect(await localNetworkDenied(HOME, { elapsedMs: 8000, leftForeground: false, retrying: false }, 'ios')).toBe(false);
        mockTransport.check = jest.fn(async (_origin: string): Promise<LocalNetworkReason> => 'local_network_denied');
        await localNetworkDenied(HOME, fast, 'web');
        expect(mockTransport.check).not.toHaveBeenCalled();
    });
});
