// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

import { DEVELOPMENT_SCHEME } from '@/features/dev/devGallery';

import { seedUrl } from './connection';

describe('the development PC address', () => {
    it('never reaches a production phone build, which pairs over pinned TLS instead', () => {
        expect(seedUrl('http://192.168.1.5:4200', false, 'ios')).toBeNull();
        expect(seedUrl('http://192.168.1.5:4200', false, 'android')).toBeNull();
        expect(seedUrl('http://127.0.0.1:4200', true, 'ios')).toBe('http://127.0.0.1:4200');
        expect(seedUrl('http://127.0.0.1:4200', false, 'web')).toBe('http://127.0.0.1:4200');
        expect(seedUrl(undefined, true, 'ios')).toBeNull();
    });
});

const SEED = 'http://127.0.0.1:9';
const runtime = globalThis as unknown as { __DEV__: boolean };
const PRODUCTION_SCHEME = 'ai.amd.gaia.mobile';

/** The connection a freshly loaded app starts with, for a build with these flags and this embedded scheme. */
function seededAt({ dev, gallery, scheme }: { dev: boolean; gallery: boolean; scheme: string }): string | null {
    const saved = { dev: runtime.__DEV__, url: process.env.EXPO_PUBLIC_GAIA_URL, flag: process.env.EXPO_PUBLIC_DEV_GALLERY };
    let baseUrl: string | null = null;
    try {
        runtime.__DEV__ = dev;
        process.env.EXPO_PUBLIC_GAIA_URL = SEED;
        if (gallery) process.env.EXPO_PUBLIC_DEV_GALLERY = '1';
        else delete process.env.EXPO_PUBLIC_DEV_GALLERY;
        jest.isolateModules(() => {
            jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { scheme } } }));
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useConnectionStore } = require('./connection') as typeof import('./connection');
            baseUrl = useConnectionStore.getState().connection?.baseUrl ?? null;
        });
    } finally {
        runtime.__DEV__ = saved.dev;
        for (const [name, value] of [['EXPO_PUBLIC_GAIA_URL', saved.url], ['EXPO_PUBLIC_DEV_GALLERY', saved.flag]] as const) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    }
    return baseUrl;
}

describe('a gallery build (EXPO_PUBLIC_DEV_GALLERY=1)', () => {
    const native = Platform.OS !== 'web';

    it('takes the development address only in a development-env release build', () => {
        expect(seededAt({ dev: false, gallery: true, scheme: DEVELOPMENT_SCHEME })).toBe(SEED);
    });

    it('is ignored by a production-env build, which still starts unconnected on a phone', () => {
        expect(seededAt({ dev: false, gallery: true, scheme: PRODUCTION_SCHEME })).toBe(native ? null : SEED);
    });

    it('leaves builds without the flag as they were', () => {
        expect(seededAt({ dev: false, gallery: false, scheme: DEVELOPMENT_SCHEME })).toBe(native ? null : SEED);
        expect(seededAt({ dev: true, gallery: false, scheme: DEVELOPMENT_SCHEME })).toBe(SEED);
    });
});
