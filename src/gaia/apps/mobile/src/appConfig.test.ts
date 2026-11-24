// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import type { ExpoConfig } from 'expo/config';

import { DEVELOPMENT_SCHEME } from '@/features/dev/devGallery';
import { LOCALES } from '@webui/i18n/registry';
import { colors } from '@/ui/tokens/generated';

import appConfig, { readAndroidAppId, readApsEnvironment, readIosBundleId, readAppEnv, readPushConfig, type AppEnv } from '../app.config';

function configFor(env: AppEnv): ExpoConfig {
    const saved = process.env.APP_ENV;
    process.env.APP_ENV = env;
    try {
        return appConfig();
    } finally {
        if (saved === undefined) delete process.env.APP_ENV;
        else process.env.APP_ENV = saved;
    }
}

function pluginOptions(config: ExpoConfig, name: string): Record<string, unknown> {
    for (const plugin of config.plugins ?? []) {
        if (Array.isArray(plugin) && plugin[0] === name) return (plugin as [string, Record<string, unknown>])[1];
    }
    throw new Error(`app.config.ts no longer applies ${name}`);
}

describe('app config', () => {
    it('takes the iOS bundle id from the environment and keeps the URL scheme fixed', () => {
        expect(readIosBundleId('production', {})).toBe('ai.amd.gaia.mobile');
        expect(readIosBundleId('development', { GAIA_IOS_BUNDLE_ID_DEV: '' })).toBe('ai.amd.gaia.mobile.dev');
        expect(readIosBundleId('production', { GAIA_IOS_BUNDLE_ID: 'com.example.gaia' })).toBe('com.example.gaia');
        expect(() => readIosBundleId('production', { GAIA_IOS_BUNDLE_ID: 'not a id' })).toThrow(/GAIA_IOS_BUNDLE_ID .* "not a id"/);

        const saved = process.env.GAIA_IOS_BUNDLE_ID;
        process.env.GAIA_IOS_BUNDLE_ID = 'com.example.gaia';
        try {
            const config = configFor('production');
            expect(config.ios?.bundleIdentifier).toBe('com.example.gaia');
            expect(config.scheme).toBe('ai.amd.gaia.mobile');
        } finally {
            if (saved === undefined) delete process.env.GAIA_IOS_BUNDLE_ID;
            else process.env.GAIA_IOS_BUNDLE_ID = saved;
        }
    });

    it('turns push off when GAIA_PUSH_RELAY_URL is unset, and leaves the push entitlement out', () => {
        const ids = { ios: 'com.example.gaia', android: 'com.example.gaia' };
        expect(readPushConfig('production', ids, {})).toBeNull();
        expect(readPushConfig('production', ids, { GAIA_PUSH_RELAY_URL: '' })).toBeNull();
        const config = configFor('production');
        expect(config.extra?.push).toBeUndefined();
        expect(pluginOptions(config, 'expo-notifications')).toEqual({ enableRemoteNotifications: false });
        expect(pluginOptions(config, './plugins/withPush')).toEqual({ ios: null, android: null });
    });

    it('reads push from the environment: https only, the APNs environment, and Android only with a Firebase project', () => {
        const ids = { ios: 'com.example.gaia', android: 'com.example.droid' };
        const relay = { GAIA_PUSH_RELAY_URL: 'https://push.example.net/' };
        expect(readPushConfig('development', ids, relay)).toEqual({
            relayUrl: 'https://push.example.net',
            ios: { appId: 'com.example.gaia', environment: 'sandbox' },
            android: null,
        });
        expect(readPushConfig('production', ids, relay)?.ios?.environment).toBe('production');
        expect(readPushConfig('production', ids, { ...relay, GAIA_APS_ENVIRONMENT: 'none' })?.ios).toBeNull();
        expect(() => readPushConfig('production', ids, { GAIA_PUSH_RELAY_URL: 'http://push.example.net' })).toThrow(/https URL/);
        expect(() => readPushConfig('production', ids, { GAIA_PUSH_RELAY_URL: 'https://push.example.net?x=1' })).toThrow(/no query/);
        expect(() => readApsEnvironment('prod', 'production')).toThrow(/GAIA_APS_ENVIRONMENT .* "prod"/);

        const file = (number: string) => () => JSON.stringify({ project_info: { project_number: number } });
        const fcm = { ...relay, GAIA_FCM_SENDER_ID: '1234', GAIA_GOOGLE_SERVICES_FILE: '/x/google-services.json' };
        expect(readPushConfig('production', ids, fcm, file('1234'))?.android).toEqual({ appId: 'com.example.droid', googleServicesFile: '/x/google-services.json' });
        expect(() => readPushConfig('production', ids, fcm, file('9999'))).toThrow(/belongs to Firebase project 9999/);
        expect(() => readPushConfig('production', ids, { ...relay, GAIA_FCM_SENDER_ID: '1234' })).toThrow(/needs both/);
    });

    it('takes the Android application id from the environment', () => {
        expect(readAndroidAppId('production', {})).toBe('ai.amd.gaia.mobile');
        expect(readAndroidAppId('development', { GAIA_ANDROID_APP_ID_DEV: 'com.example.dev' })).toBe('com.example.dev');
        expect(() => readAndroidAppId('production', { GAIA_ANDROID_APP_ID: '1bad' })).toThrow(/GAIA_ANDROID_APP_ID .* "1bad"/);
    });

    it('gives the development build the scheme a gallery build checks for', () => {
        expect(configFor('development').scheme).toBe(DEVELOPMENT_SCHEME);
        expect(configFor('production').scheme).not.toBe(DEVELOPMENT_SCHEME);
    });

    it('refuses to load without a known APP_ENV', () => {
        expect(() => readAppEnv(undefined)).toThrow(/APP_ENV .* not set/);
        expect(() => readAppEnv('staging')).toThrow(/"staging"/);
    });

    it('allows plain HTTP only in development', () => {
        const dev = configFor('development');
        const prod = configFor('production');

        expect(dev.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
            NSAllowsArbitraryLoads: false,
            NSAllowsLocalNetworking: true,
        });
        expect(pluginOptions(dev, './plugins/withCleartextHosts').hosts).toEqual(['10.0.2.2', '127.0.0.1', 'localhost']);

        // Production reaches the paired PC only over pinned https, which needs no ATS exception.
        expect(prod.ios?.infoPlist?.NSAppTransportSecurity).toEqual({ NSAllowsArbitraryLoads: false });
        expect(pluginOptions(prod, './plugins/withCleartextHosts').hosts).toEqual([]);
    });

    it('trusts only system CAs on Android and turns off cloud backup', () => {
        const { securityConfig } = require('../plugins/withCleartextHosts') as { securityConfig: (hosts: string[]) => string };
        const release = securityConfig([]);
        expect(release).toContain('<base-config cleartextTrafficPermitted="false">');
        expect(release).toContain('<certificates src="system" />');
        expect(release).not.toMatch(/src="user"|debug-overrides|cleartextTrafficPermitted="true"/);
        expect(securityConfig(['10.0.2.2'])).toContain('<domain includeSubdomains="false">10.0.2.2</domain>');
        expect(configFor('production').android?.allowBackup).toBe(false);
        expect(configFor('development').android?.allowBackup).toBe(false);
    });

    it('keeps every storage domain out of cloud backup and device-to-device transfer', () => {
        const { extractionRules } = require('../plugins/withBackupExclusions') as { extractionRules: () => string };
        const rules = extractionRules();
        expect(rules).not.toContain('<include');
        for (const section of ['cloud-backup', 'device-transfer']) {
            const body = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(rules)?.[1] ?? '';
            const domains = [...body.matchAll(/<exclude domain="(\w+)" path="\." \/>/g)].map((m) => m[1]);
            expect(domains.sort()).toEqual(
                ['database', 'device_database', 'device_file', 'device_root', 'device_sharedpref', 'external', 'file', 'root', 'sharedpref'],
            );
        }
        expect(configFor('production').plugins).toContain('./plugins/withBackupExclusions');
    });

    it('declares the web UI languages to iOS and Android', () => {
        expect(pluginOptions(configFor('development'), 'expo-localization').supportedLocales).toEqual(
            LOCALES.map((locale) => locale.meta.code),
        );
    });

    it('uses existing icon files, an opaque iOS icon, and the theme backgrounds', () => {
        const config = configFor('production');
        const file = (path: string | undefined): string => {
            const full = resolve(__dirname, '..', path ?? '');
            expect(existsSync(full)).toBe(true);
            return full;
        };
        // IHDR colour type, byte 25: 2 is RGB with no alpha, 6 is RGBA.
        const colorType = (full: string): number => readFileSync(full)[25];

        expect(config.icon).toBe(config.ios?.icon);
        expect(colorType(file(config.icon))).toBe(2);
        const adaptive = config.android?.adaptiveIcon;
        expect(colorType(file(adaptive?.foregroundImage))).toBe(6);
        expect(adaptive?.backgroundColor).toBe(colors.dark.bgPrimary);

        const splash = pluginOptions(config, 'expo-splash-screen') as {
            image: string;
            backgroundColor: string;
            dark: { backgroundColor: string };
        };
        expect(colorType(file(splash.image))).toBe(6);
        expect(splash.backgroundColor).toBe(colors.light.bgPrimary);
        expect(splash.dark.backgroundColor).toBe(colors.dark.bgPrimary);
    });

    it('localizes every iOS permission prompt and the app name in Arabic', () => {
        const config = configFor('development');
        const file = (config.locales as Record<string, string> | undefined)?.ar;
        expect(file).toBeDefined();
        const path = resolve(__dirname, '..', file as string);
        expect(existsSync(path)).toBe(true);
        const locale = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
        // Under `ios` only: Expo writes top-level keys to Android strings too, where they break release lint.
        expect(Object.keys(locale)).toEqual(['ios']);
        const arabic = locale.ios as Record<string, string>;

        const keys = new Set<string>(['CFBundleDisplayName']);
        for (const key of Object.keys(config.ios?.infoPlist ?? {})) {
            if (/^NS\w+UsageDescription$/.test(key)) keys.add(key);
        }
        const pluginKeys: Record<string, string> = {
            cameraPermission: 'NSCameraUsageDescription',
            microphonePermission: 'NSMicrophoneUsageDescription',
            photosPermission: 'NSPhotoLibraryUsageDescription',
        };
        for (const plugin of ['expo-camera', 'expo-image-picker', 'expo-audio']) {
            for (const option of Object.keys(pluginOptions(config, plugin))) {
                if (pluginKeys[option]) keys.add(pluginKeys[option]);
            }
        }
        expect(Object.keys(arabic).sort()).toEqual([...keys].sort());
        for (const [key, value] of Object.entries(arabic)) {
            expect({ key, ok: value.trim() !== '' }).toEqual({ key, ok: true });
            // GAIA and Wi-Fi (plain or with the non-breaking hyphen U+2011) are names, kept in Latin as the in-app Arabic catalog keeps them.
            expect({ key, latin: value.replace(/GAIA|Wi[-\u2011]Fi/g, '').match(/[A-Za-z]/g) }).toEqual({ key, latin: null });
        }
        expect(arabic.NSLocalNetworkUsageDescription).toContain('Wi\u2011Fi');
        expect(arabic.NSLocalNetworkUsageDescription).not.toContain('Wi-Fi');
    });
});
