// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

/** The `dev/*` gallery routes render in development builds, in a web export made with EXPO_PUBLIC_DEV_GALLERY=1, and in a native gallery build (the flag plus the development config). */
export function devGalleryEnabled(): boolean {
    if (__DEV__) return true;
    // On a native binary the flag alone is not enough: a production binary built with it by mistake stays closed.
    return Platform.OS === 'web' ? process.env.EXPO_PUBLIC_DEV_GALLERY === '1' : galleryBuild();
}

/** app.config.ts's URL scheme for APP_ENV=development; it is the same id on both platforms and never changes. */
export const DEVELOPMENT_SCHEME = 'ai.amd.gaia.mobile.dev';

/** True for a gallery build of the development app only: EXPO_PUBLIC_DEV_GALLERY=1 and a config built with APP_ENV=development. */
export function isGalleryBuild(galleryFlag: string | undefined, scheme: () => unknown): boolean {
    return galleryFlag === '1' && scheme() === DEVELOPMENT_SCHEME;
}

/**
 * A release build made for device checks without Metro, which may take EXPO_PUBLIC_GAIA_URL and open `/dev/*` with no PC.
 * A production config ignores the flag. The scheme comes from the config embedded in the build, so it matches the APP_ENV it was built with.
 */
export function galleryBuild(): boolean {
    return isGalleryBuild(process.env.EXPO_PUBLIC_DEV_GALLERY, embeddedScheme);
}

// Loaded only once the flag is set, so the state modules that call galleryBuild() don't read the app config in tests.
function embeddedScheme(): unknown {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = (require('expo-constants') as typeof import('expo-constants')).default;
    return Constants.expoConfig?.scheme;
}
