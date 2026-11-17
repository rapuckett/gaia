// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ExpoConfig } from 'expo/config';

export type AppEnv = 'development' | 'production';

// Also the URL scheme, which stays fixed because pairing links use it.
const APP_IDS: Record<AppEnv, string> = {
    development: 'ai.amd.gaia.mobile.dev',
    production: 'ai.amd.gaia.mobile',
};

// Android's dev build allows plain HTTP only to this computer: the emulator's alias for it, and loopback.
const DEV_HTTP_HOSTS = ['10.0.2.2', '127.0.0.1', 'localhost'];

// webui's LOCALES codes; Expo's config loader can't import its TypeScript, so src/appConfig.test.ts checks the copy.
const LOCALE_CODES = ['en', 'ar'];

// One text per permission, passed to every plugin that writes it, so plugin order can't change it.
const CAMERA_USE = 'GAIA uses the camera to scan the pairing code on your PC and to take photos you attach to a chat.';
const MICROPHONE_USE = 'GAIA uses the microphone to record voice messages.';
const PHOTOS_USE = 'GAIA opens your photo library so you can attach photos to a chat.';
const PHOTOS_ADD_USE = 'GAIA saves the images you choose to your photo library.';
const LOCAL_NETWORK_USE = 'GAIA uses your local network to connect to GAIA on your PC.';

export function readAppEnv(value: string | undefined): AppEnv {
    if (value === 'development' || value === 'production') return value;
    throw new Error(
        `APP_ENV must be "development" or "production", but it is ${value === undefined ? 'not set' : `"${value}"`}. ` +
            'Set it on every Expo command, for example `APP_ENV=development npx expo start`; see src/gaia/apps/mobile/README.md.',
    );
}

const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** The iOS bundle id, from GAIA_IOS_BUNDLE_ID (production) or GAIA_IOS_BUNDLE_ID_DEV (development); unset or empty keeps the default. */
export function readIosBundleId(env: AppEnv, source: Record<string, string | undefined> = process.env): string {
    const name = env === 'development' ? 'GAIA_IOS_BUNDLE_ID_DEV' : 'GAIA_IOS_BUNDLE_ID';
    const value = source[name];
    if (value === undefined || value === '') return APP_IDS[env];
    if (BUNDLE_ID_PATTERN.test(value)) return value;
    throw new Error(
        `${name} must be a reverse-DNS bundle id such as "com.example.gaia", but it is "${value}". ` +
            'Unset it to keep the default; see src/gaia/apps/mobile/README.md.',
    );
}

export default function appConfig(): ExpoConfig {
    const env = readAppEnv(process.env.APP_ENV);
    const dev = env === 'development';
    const id = APP_IDS[env];
    const iosId = readIosBundleId(env);
    const relayDomain = process.env.EXPO_PUBLIC_GAIA_RELAY_DOMAIN;
    return {
        name: 'GAIA',
        slug: 'gaia-mobile',
        version: '0.1.0',
        scheme: id,
        userInterfaceStyle: 'automatic',
        // iOS permission prompts and the app name in Arabic; Expo writes ar.lproj/InfoPlist.strings from it.
        locales: { ar: './locales/ios/ar.json' },
        ios: {
            bundleIdentifier: iosId,
            supportsTablet: true,
            infoPlist: {
                // Only the dev client needs plain HTTP (Metro on the home network); the paired PC is pinned https in every build.
                NSAppTransportSecurity: dev
                    ? { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true }
                    : { NSAllowsArbitraryLoads: false },
                NSLocalNetworkUsageDescription: LOCAL_NETWORK_USE,
                NSPhotoLibraryAddUsageDescription: PHOTOS_ADD_USE,
                // The native transport's copy of the relay domain, so it checks relay origins without trusting JavaScript.
                ...(relayDomain ? { GAIARelayDomain: relayDomain } : {}),
            },
        },
        android: {
            package: id,
            // No cloud backup. plugins/withBackupExclusions also keeps every app file out of device-to-device
            // transfer, so a paired PC's records never reach another phone, where its Keystore key can't follow.
            allowBackup: false,
            // Android 14+ previews where back leads; React Native's BackHandler runs through OnBackPressedDispatcher.
            predictiveBackGestureEnabled: true,
        },
        plugins: [
            'expo-router',
            'expo-dev-client',
            ['expo-localization', { supportsRTL: true, supportedLocales: LOCALE_CODES }],
            [
                'expo-camera',
                { cameraPermission: CAMERA_USE, microphonePermission: MICROPHONE_USE, barcodeScannerEnabled: true },
            ],
            [
                'expo-image-picker',
                { photosPermission: PHOTOS_USE, cameraPermission: CAMERA_USE, microphonePermission: MICROPHONE_USE },
            ],
            [
                'expo-audio',
                { microphonePermission: MICROPHONE_USE, enableBackgroundPlayback: true, enableBackgroundRecording: false },
            ],
            'expo-background-task',
            // Without the system's contrast scrim, the transparent button bar takes the style GAIA's theme sets.
            ['expo-navigation-bar', { enforceContrast: false }],
            ['./plugins/withCleartextHosts', { hosts: dev ? DEV_HTTP_HOSTS : [] }],
            './plugins/withBackupExclusions',
            ['./plugins/withRelayDomain', { domain: relayDomain || null }],
            './plugins/withNinjaJobs',
            './plugins/withWorkManagerKeep',
        ],
    };
}
