// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { usePathname } from 'expo-router';

import { ConnectionBanner } from './ConnectionBanner';
import { isSettingsRoute } from './settingsRoute';

/** The root layout's banner for every `Screen`. The `/dev` gallery has no real PC, so it shows none; scenes mount their own. */
export function AppBanner() {
    const pathname = usePathname();
    if (pathname === '/dev' || pathname.startsWith('/dev/')) return null;
    return <ConnectionBanner hideServerDown={isSettingsRoute(pathname)} />;
}
