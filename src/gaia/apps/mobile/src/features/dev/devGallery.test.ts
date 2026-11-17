// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

import { DEVELOPMENT_SCHEME, devGalleryEnabled } from './devGallery';

let mockScheme = 'ai.amd.gaia.mobile';
jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        get expoConfig() {
            return { scheme: mockScheme };
        },
    },
}));

const originalOS = Platform.OS;
const originalFlag = process.env.EXPO_PUBLIC_DEV_GALLERY;
const globals = globalThis as unknown as { __DEV__: boolean };
const originalDev = globals.__DEV__;

function setup(os: 'ios' | 'web', flag: string | undefined, configScheme: string) {
    Platform.OS = os;
    mockScheme = configScheme;
    globals.__DEV__ = false;
    if (flag === undefined) delete process.env.EXPO_PUBLIC_DEV_GALLERY;
    else process.env.EXPO_PUBLIC_DEV_GALLERY = flag;
}

afterEach(() => {
    Platform.OS = originalOS;
    globals.__DEV__ = originalDev;
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_DEV_GALLERY;
    else process.env.EXPO_PUBLIC_DEV_GALLERY = originalFlag;
});

describe('devGalleryEnabled', () => {
    it('stays closed on a native production binary built with the flag', () => {
        setup('ios', '1', 'ai.amd.gaia.mobile');
        expect(devGalleryEnabled()).toBe(false);
    });

    it('opens on a native development-config build with the flag', () => {
        setup('ios', '1', DEVELOPMENT_SCHEME);
        expect(devGalleryEnabled()).toBe(true);
    });

    it('stays closed on native with no flag outside __DEV__', () => {
        setup('ios', undefined, DEVELOPMENT_SCHEME);
        expect(devGalleryEnabled()).toBe(false);
    });

    it('opens on web with the flag alone', () => {
        setup('web', '1', 'ai.amd.gaia.mobile');
        expect(devGalleryEnabled()).toBe(true);
    });
});
