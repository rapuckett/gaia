// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The `code` of a JSON error answer; undefined for any other body. */
export function errorCode(text: string): unknown {
    try {
        return (JSON.parse(text) as { code?: unknown } | null)?.code;
    } catch {
        return undefined;
    }
}

/** Whether the PC's device gate refused this phone's token: 401, `WWW-Authenticate: Bearer` and `code: device_unknown`. Other layers send Bearer 401s too. */
export function isDeviceUnknown(status: number, wwwAuthenticate: string | null, text: string): boolean {
    return status === 401 && /^bearer\b/i.test(wwwAuthenticate ?? '') && errorCode(text) === 'device_unknown';
}
