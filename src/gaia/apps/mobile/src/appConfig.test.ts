// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ExpoConfig } from 'expo/config';

import { LOCALES } from '@webui/i18n/registry';

import appConfig, { readAppEnv, type AppEnv } from '../app.config';

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
    it('refuses to load without a known APP_ENV', () => {
        expect(() => readAppEnv(undefined)).toThrow(/APP_ENV .* not set/);
        expect(() => readAppEnv('staging')).toThrow(/"staging"/);
    });

    it('allows plain HTTP only in development, and only locally', () => {
        const dev = configFor('development');
        const prod = configFor('production');

        expect(dev.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
            NSAllowsArbitraryLoads: false,
            NSAllowsLocalNetworking: true,
        });
        expect(pluginOptions(dev, './plugins/withCleartextHosts').hosts).toEqual(['10.0.2.2', '127.0.0.1', 'localhost']);

        expect(prod.ios?.infoPlist?.NSAppTransportSecurity).toEqual({
            NSAllowsArbitraryLoads: false,
            NSAllowsLocalNetworking: false,
        });
        expect(pluginOptions(prod, './plugins/withCleartextHosts').hosts).toEqual([]);
    });

    it('declares the web UI languages to iOS and Android', () => {
        expect(pluginOptions(configFor('development'), 'expo-localization').supportedLocales).toEqual(
            LOCALES.map((locale) => locale.meta.code),
        );
    });
});
