// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Notifications from 'expo-notifications';

import { sweepStale, syncAll } from './pushRegistration';
import { syncPush } from './pushService';
import { usePushStore } from './pushStore';

jest.mock('expo-crypto', () => ({ getRandomBytes: jest.fn() }));
jest.mock('expo-notifications', () => ({
    getPermissionsAsync: jest.fn(),
    getDevicePushTokenAsync: jest.fn(),
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    PermissionStatus: { DENIED: 'denied' },
}));
jest.mock('@/features/pairing/registry', () => ({ getPairingService: () => ({ list: async () => [] }) }));
jest.mock('@/features/pairing/unpairListeners', () => ({ onUnpair: jest.fn(), onWipeAll: jest.fn() }));
jest.mock('@/platform/pinnedFetch', () => ({ pinnedFetch: jest.fn() }));
jest.mock('../../../modules/gaia-push', () => ({ gaiaPush: () => ({}) }));
jest.mock('./pushConfig', () => ({
    pushAvailable: () => true,
    pushBuildConfig: () => ({ relayUrl: 'https://relay.example', platform: 'apns', appId: 'com.example.gaia', environment: 'sandbox' }),
}));
jest.mock('./pushRegistration', () => ({ sweepStale: jest.fn(), syncAll: jest.fn(), unregisterAll: jest.fn(), unregisterPc: jest.fn() }));

const permissions = Notifications.getPermissionsAsync as jest.Mock;

describe('syncPush', () => {
    let error: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        usePushStore.setState({ relay: 'ok', permission: null });
    });
    afterEach(() => jest.restoreAllMocks());

    it('warns, and leaves the relay row alone, when the sweep before Allow fails', async () => {
        permissions.mockResolvedValue({ granted: false, status: 'undetermined' });
        const failure = new Error('relay delete rejected');
        (sweepStale as jest.Mock).mockRejectedValue(failure);

        await expect(syncPush()).resolves.toBeUndefined();

        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Deleting push handles of unpaired PCs failed'), failure);
        expect(usePushStore.getState().relay).toBe('ok');
    });

    it('logs an error and marks the relay unreachable when registration fails after Allow', async () => {
        permissions.mockResolvedValue({ granted: true, status: 'granted' });
        (Notifications.getDevicePushTokenAsync as jest.Mock).mockResolvedValue({ data: 'token' });
        const failure = new Error('register rejected');
        (syncAll as jest.Mock).mockRejectedValue(failure);

        await expect(syncPush()).resolves.toBeUndefined();

        expect(error).toHaveBeenCalledWith(expect.stringContaining('Registering this phone'), failure);
        expect(warn).not.toHaveBeenCalled();
        expect(usePushStore.getState().relay).toBe('unreachable');
    });
});
