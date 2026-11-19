// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** What the one redirect brought back: the code and state, the provider's `error`, or no redirect (`lost`: the phone took the port away). */
export type LoopbackOutcome =
    | { outcome: 'code'; code: string; state: string }
    | { outcome: 'error'; error: string }
    | { outcome: 'timeout' }
    | { outcome: 'cancelled' }
    | { outcome: 'lost' };

/**
 * A one-shot HTTP listener on this phone's 127.0.0.1 for one browser sign-in redirect (`GET /callback`).
 * Rejections carry `code`: invalid_return_url, listen_failed, cancelled (ended before it was ready), not_started.
 */
export interface OAuthLoopbackNative {
    /** Binds a port the system picks on loopback; a new start ends the one before. `returnUrl` is this app's own link, where the answer page sends the browser. */
    start(returnUrl: string): Promise<{ port: number }>;
    /**
     * Resolves with the first `/callback` that carries `expectedState`, then closes the port. Other requests are
     * refused and don't use it up. At most 15 minutes after `start`, whatever `timeoutMs` asks.
     */
    waitForRedirect(expectedState: string, timeoutMs: number): Promise<LoopbackOutcome>;
    /** Closes the port; a pending wait resolves `cancelled`. */
    cancel(): void;
}

const native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule<OAuthLoopbackNative>('GaiaOAuthLoopback') : null;

/** The listener; null on the web and in builds made before the module, where browser sign-in stays on the PC. */
export function oauthLoopback(): OAuthLoopbackNative | null {
    return native;
}
