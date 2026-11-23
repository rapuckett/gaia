// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { gaiaPush } from '../../../modules/gaia-push';
import type { PushBuildConfig } from './pushRegistration';

interface ExtraPush {
    relayUrl?: unknown;
    ios?: { appId?: unknown; environment?: unknown };
    android?: { appId?: unknown };
}

const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** This platform's push settings from the build (app.config.ts `extra.push`); null in a build without push. */
export function pushBuildConfig(): PushBuildConfig | null {
    const push = (Constants.expoConfig?.extra as { push?: ExtraPush } | undefined)?.push;
    if (!push || !isText(push.relayUrl)) return null;
    const { ios, android } = push;
    if (Platform.OS === 'ios' && isText(ios?.appId) && (ios.environment === 'sandbox' || ios.environment === 'production')) {
        return { relayUrl: push.relayUrl, platform: 'apns', appId: ios.appId, environment: ios.environment };
    }
    // FCM has one environment; the relay ignores it.
    if (Platform.OS === 'android' && isText(android?.appId)) return { relayUrl: push.relayUrl, platform: 'fcm', appId: android.appId, environment: 'production' };
    return null;
}

/** Whether this build can receive push: settings from the build, and the native store to keep its keys in. */
export function pushAvailable(): boolean {
    return pushBuildConfig() !== null && gaiaPush() !== null;
}
