// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The folder part of an example file path, for the phone's narrow path box. */
export function phonePathExample(filePath: string): string {
    const cut = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return cut > 0 ? filePath.slice(0, cut) : filePath;
}
