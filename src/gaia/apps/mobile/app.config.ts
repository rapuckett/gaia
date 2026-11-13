// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ExpoConfig } from 'expo/config';

export type AppEnv = 'development' | 'production';

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
const FACE_ID_USE = 'GAIA uses Face ID to protect the key that connects this phone to your PC.';

export function readAppEnv(value: string | undefined): AppEnv {
    if (value === 'development' || value === 'production') return value;
    throw new Error(
        `APP_ENV must be "development" or "production", but it is ${value === undefined ? 'not set' : `"${value}"`}. ` +
            'Set it on every Expo command, for example `APP_ENV=development npx expo start`; see src/gaia/apps/mobile/README.md.',
    );
}

export default function appConfig(): ExpoConfig {
    const env = readAppEnv(process.env.APP_ENV);
    const dev = env === 'development';
    const id = APP_IDS[env];
    return {
        name: 'GAIA',
        slug: 'gaia-mobile',
        version: '0.1.0',
        scheme: id,
        userInterfaceStyle: 'automatic',
        ios: {
            bundleIdentifier: id,
            supportsTablet: true,
            infoPlist: {
                NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: dev },
                NSLocalNetworkUsageDescription: LOCAL_NETWORK_USE,
                NSPhotoLibraryAddUsageDescription: PHOTOS_ADD_USE,
            },
        },
        android: { package: id },
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
            ['expo-notifications', { mode: env, enableBackgroundRemoteNotifications: true }],
            ['expo-secure-store', { faceIDPermission: FACE_ID_USE }],
            'expo-background-task',
            ['./plugins/withCleartextHosts', { hosts: dev ? DEV_HTTP_HOSTS : [] }],
            './plugins/withNinjaJobs',
        ],
    };
}
