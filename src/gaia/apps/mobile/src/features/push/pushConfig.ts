// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { gaiaPush } from '../../../modules/gaia-push';
import type { PushBuildConfig } from './pushRegistration';

interface ExtraPush {
    relayUrl: string;
    ios: { appId: string; environment: 'sandbox' | 'production' } | null;
    android: { appId: string } | null;
}

/** This platform's push settings from the build (app.config.ts `extra.push`); null in a build without push. */
export function pushBuildConfig(): PushBuildConfig | null {
    const push = (Constants.expoConfig?.extra as { push?: ExtraPush | null } | undefined)?.push;
    if (!push) return null;
    if (Platform.OS === 'ios' && push.ios) return { relayUrl: push.relayUrl, platform: 'apns', appId: push.ios.appId, environment: push.ios.environment };
    // FCM has one environment; the relay ignores it.
    if (Platform.OS === 'android' && push.android) return { relayUrl: push.relayUrl, platform: 'fcm', appId: push.android.appId, environment: 'production' };
    return null;
}

/** Whether this build can receive push: settings from the build, and the native store to keep its keys in. */
export function pushAvailable(): boolean {
    return pushBuildConfig() !== null && gaiaPush() !== null;
}
