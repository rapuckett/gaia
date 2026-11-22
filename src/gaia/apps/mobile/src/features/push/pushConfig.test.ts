// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

import { pushBuildConfig } from './pushConfig';

const mockExtra: { push?: unknown } = {};
jest.mock('expo-constants', () => ({ __esModule: true, default: { get expoConfig() { return { extra: mockExtra }; } } }));
const extra = mockExtra;

describe("this platform's push settings from the build", () => {
    it('reads none from a build without push, which Expo serializes as {}', () => {
        extra.push = undefined;
        expect(pushBuildConfig()).toBeNull();
        extra.push = {};
        expect(pushBuildConfig()).toBeNull();
        extra.push = { relayUrl: 'https://relay.example', ios: {}, android: {} };
        expect(pushBuildConfig()).toBeNull();
    });

    it("reads this platform's registration", () => {
        extra.push = { relayUrl: 'https://relay.example', ios: { appId: 'com.example.ios', environment: 'sandbox' }, android: { appId: 'com.example.droid' } };
        const expected =
            Platform.OS === 'ios'
                ? { relayUrl: 'https://relay.example', platform: 'apns', appId: 'com.example.ios', environment: 'sandbox' }
                : Platform.OS === 'android'
                  ? { relayUrl: 'https://relay.example', platform: 'fcm', appId: 'com.example.droid', environment: 'production' }
                  : null;
        expect(pushBuildConfig()).toEqual(expected);
    });
});
