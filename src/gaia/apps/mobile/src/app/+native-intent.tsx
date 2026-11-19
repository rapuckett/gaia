// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isOAuthDoneLink } from '@/features/connectors/browserSignInDeps';

/** A browser sign-in's way back to the app is no screen: stay where the sign-in was, or open Connectors on a cold start. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
    if (!isOAuthDoneLink(path)) return path;
    return initial ? '/connectors' : null;
}
