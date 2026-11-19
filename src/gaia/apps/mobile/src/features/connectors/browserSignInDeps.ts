// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { oauthLoopback } from '../../../modules/gaia-oauth-loopback';

import type { BrowserSignInDeps } from './browserSignIn';

/** Where the listener's answer page sends the browser back to the app; `+native-intent` keeps the router where it is. */
export const OAUTH_DONE_HOST = 'oauth-done';

/** True for the app link the answer page opens, `<scheme>://oauth-done`, whatever the router hands over. */
export function isOAuthDoneLink(path: string): boolean {
    return new RegExp(`^(?:[a-z][a-z0-9+.-]*:)?/*${OAUTH_DONE_HOST}/?(?:[?#]|$)`, 'i').test(path);
}

// Read once a sign-in starts, so modules that import this don't load the app config in tests.
function appReturnUrl(): string | null {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = (require('expo-constants') as typeof import('expo-constants')).default;
    const scheme = Constants.expoConfig?.scheme;
    const first = Array.isArray(scheme) ? scheme[0] : scheme;
    return first ? `${first}://${OAUTH_DONE_HOST}` : null;
}

const PLATFORM: BrowserSignInDeps = {
    loopback: oauthLoopback(),
    returnUrl: appReturnUrl,
    openAuthSession: (url, returnUrl) => WebBrowser.openAuthSessionAsync(url, returnUrl),
    // Android's Custom Tab can't be closed from the app; the answer page brings GAIA back instead.
    dismissAuthSession: () => {
        if (Platform.OS === 'ios') WebBrowser.dismissAuthSession();
    },
};

export function platformBrowserSignInDeps(): BrowserSignInDeps {
    return PLATFORM;
}
