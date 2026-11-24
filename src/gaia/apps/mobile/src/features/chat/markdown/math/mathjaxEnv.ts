// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// MathJax reads `navigator.appVersion` and `navigator.userAgent` as it loads, to name the OS; React Native's navigator
// has neither, so loading would throw. Imported before MathJax; texToSvg puts the navigator back once MathJax has loaded.
type Nav = Record<string, unknown>;
const FIELDS = ['appVersion', 'userAgent'] as const;

const host = globalThis as unknown as { window?: { navigator?: Nav }; navigator?: Nav };
const navigator = host.window?.navigator ?? host.navigator;
const added = navigator ? FIELDS.filter((field) => typeof navigator[field] !== 'string') : [];
for (const field of added) navigator![field] = '';

/** Takes back the fields added for MathJax. */
export function restoreNavigator(): void {
    for (const field of added) delete navigator![field];
}
