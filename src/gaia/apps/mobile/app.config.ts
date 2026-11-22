// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { readFileSync } from 'fs';

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
// bgPrimary light and dark in src/ui/tokens/generated.ts; Expo's config loader can't import it, so src/appConfig.test.ts checks the copies.
const BACKGROUND_LIGHT = '#FAF9F7';
const BACKGROUND_DARK = '#1A1917';

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

/** The Android application id, from GAIA_ANDROID_APP_ID (production) or GAIA_ANDROID_APP_ID_DEV (development); unset or empty keeps the default. */
export function readAndroidAppId(env: AppEnv, source: Record<string, string | undefined> = process.env): string {
    const name = env === 'development' ? 'GAIA_ANDROID_APP_ID_DEV' : 'GAIA_ANDROID_APP_ID';
    const value = source[name];
    if (value === undefined || value === '') return APP_IDS[env];
    if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(value)) return value;
    throw new Error(
        `${name} must be an Android application id such as "com.example.gaia", but it is "${value}". ` +
            'Unset it to keep the default; see src/gaia/apps/mobile/README.md.',
    );
}

export type ApsEnvironment = 'development' | 'production' | 'none';

/** The push entitlement, from GAIA_APS_ENVIRONMENT: unset follows APP_ENV, and `none` leaves iOS push out (a sideload profile without push). */
export function readApsEnvironment(value: string | undefined, env: AppEnv): ApsEnvironment {
    if (value === undefined || value === '') return env;
    if (value === 'development' || value === 'production' || value === 'none') return value;
    throw new Error(
        `GAIA_APS_ENVIRONMENT must be "development", "production" or "none", but it is "${value}". ` +
            'Leave it unset to follow APP_ENV; see src/gaia/apps/mobile/README.md.',
    );
}

/** What the app registers with the push relay; the JavaScript reads it from `extra.push`. Secrets never go here. */
export interface PushConfig {
    relayUrl: string;
    /** Null when iOS push is off (GAIA_APS_ENVIRONMENT=none). */
    ios: { appId: string; environment: 'sandbox' | 'production' } | null;
    /** Null when the build has no Firebase project (GAIA_FCM_SENDER_ID and GAIA_GOOGLE_SERVICES_FILE unset). */
    android: { appId: string; googleServicesFile: string } | null;
}

/**
 * Push, from GAIA_PUSH_RELAY_URL and the platform settings; null (push off on both) when the relay URL is unset.
 * Android needs a Firebase project: GAIA_FCM_SENDER_ID and GAIA_GOOGLE_SERVICES_FILE together, the sender id matching the file's.
 */
export function readPushConfig(
    env: AppEnv,
    ids: { ios: string; android: string },
    source: Record<string, string | undefined> = process.env,
    readFile: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): PushConfig | null {
    const raw = source.GAIA_PUSH_RELAY_URL;
    if (raw === undefined || raw === '') return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        url = new URL('invalid:');
    }
    if (url.protocol !== 'https:' || !url.hostname || url.search || url.hash || url.username || url.password) {
        throw new Error(
            `GAIA_PUSH_RELAY_URL must be an https URL such as "https://push.example.net", with no query or credentials, but it is "${raw}". ` +
                'Unset it for a build without push; see src/gaia/apps/mobile/README.md.',
        );
    }
    const aps = readApsEnvironment(source.GAIA_APS_ENVIRONMENT, env);
    const ios = aps === 'none' ? null : { appId: ids.ios, environment: aps === 'development' ? ('sandbox' as const) : ('production' as const) };

    const sender = source.GAIA_FCM_SENDER_ID || undefined;
    const file = source.GAIA_GOOGLE_SERVICES_FILE || undefined;
    let android: PushConfig['android'] = null;
    if (sender || file) {
        if (!sender || !file) {
            throw new Error(
                `Android push needs both GAIA_FCM_SENDER_ID and GAIA_GOOGLE_SERVICES_FILE, but only ${sender ? 'GAIA_FCM_SENDER_ID' : 'GAIA_GOOGLE_SERVICES_FILE'} is set. ` +
                    'Set both from the Firebase project, or neither for a build without Android push.',
            );
        }
        if (!/^[0-9]+$/.test(sender)) throw new Error(`GAIA_FCM_SENDER_ID must be the Firebase project number (digits only), but it is "${sender}".`);
        let projectNumber: unknown;
        try {
            projectNumber = (JSON.parse(readFile(file)) as { project_info?: { project_number?: unknown } }).project_info?.project_number;
        } catch (error) {
            throw new Error(`GAIA_GOOGLE_SERVICES_FILE could not be read as a google-services.json at ${file}: ${String(error)}`);
        }
        if (projectNumber !== sender) {
            throw new Error(`GAIA_FCM_SENDER_ID is ${sender}, but ${file} belongs to Firebase project ${String(projectNumber)}. Use the file for that sender.`);
        }
        android = { appId: ids.android, googleServicesFile: file };
    }
    return { relayUrl: url.href.replace(/\/+$/, ''), ios, android };
}

export default function appConfig(): ExpoConfig {
    const env = readAppEnv(process.env.APP_ENV);
    const dev = env === 'development';
    const id = APP_IDS[env];
    const iosId = readIosBundleId(env);
    const androidId = readAndroidAppId(env);
    const push = readPushConfig(env, { ios: iosId, android: androidId });
    const relayDomain = process.env.EXPO_PUBLIC_GAIA_RELAY_DOMAIN;
    return {
        name: 'GAIA',
        slug: 'gaia-mobile',
        version: '0.1.0',
        scheme: id,
        userInterfaceStyle: 'automatic',
        icon: './assets/icon.png',
        // iOS permission prompts and the app name in Arabic; Expo writes ar.lproj/InfoPlist.strings from it.
        locales: { ar: './locales/ios/ar.json' },
        ios: {
            icon: './assets/icon.png',
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
            package: androidId,
            ...(push?.android ? { googleServicesFile: push.android.googleServicesFile } : {}),
            adaptiveIcon: { foregroundImage: './assets/adaptive-icon-foreground.png', backgroundColor: BACKGROUND_DARK },
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
            // Listed even without push, so Expo's default doesn't add the push entitlement; plugins/withPush strips what's left.
            [
                'expo-notifications',
                push?.ios
                    ? { mode: push.ios.environment === 'sandbox' ? 'development' : 'production', enableBackgroundRemoteNotifications: true }
                    : { enableRemoteNotifications: false },
            ],
            [
                'expo-splash-screen',
                {
                    image: './assets/splash-logo.png',
                    imageWidth: 200,
                    resizeMode: 'contain',
                    backgroundColor: BACKGROUND_LIGHT,
                    dark: { backgroundColor: BACKGROUND_DARK },
                },
            ],
            // Without the system's contrast scrim, the transparent button bar takes the style GAIA's theme sets.
            ['expo-navigation-bar', { enforceContrast: false }],
            ['./plugins/withCleartextHosts', { hosts: dev ? DEV_HTTP_HOSTS : [] }],
            './plugins/withBackupExclusions',
            ['./plugins/withRelayDomain', { domain: relayDomain || null }],
            './plugins/withNinjaJobs',
            './plugins/withWorkManagerKeep',
            ['./plugins/withPush', { ios: push?.ios ? { bundleId: iosId } : null, android: push?.android ? { scheme: id } : null }],
        ],
        // Expo's config turns a null in `extra` into {}, so a platform without push is left out instead.
        extra: push
            ? { push: { relayUrl: push.relayUrl, ...(push.ios ? { ios: push.ios } : {}), ...(push.android ? { android: { appId: push.android.appId } } : {}) } }
            : {},
    };
}
