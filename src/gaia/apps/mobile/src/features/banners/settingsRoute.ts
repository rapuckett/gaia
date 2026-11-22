// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Settings screens carry the model server's state in their own pane, so no server-down banner sits above them. */
export const isSettingsRoute = (pathname: string | undefined): boolean => pathname === '/settings' || !!pathname?.startsWith('/settings/');
