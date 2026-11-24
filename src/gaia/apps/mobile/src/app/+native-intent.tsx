// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isOAuthDoneLink } from '@/features/connectors/browserSignInDeps';
import { pushLinkRoute } from '@/features/push/pushRoutes';

/**
 * A browser sign-in's way back to the app is no screen: stay where the sign-in was, or open Connectors on a cold start.
 * A tapped Android notification's push link opens its route, checked against the allow-list.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
    const pushed = pushLinkRoute(path);
    if (pushed !== null) return pushed;
    if (!isOAuthDoneLink(path)) return path;
    return initial ? '/connectors' : null;
}
