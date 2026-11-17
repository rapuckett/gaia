// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The `dev/*` gallery routes render in development builds, and in a build or web export made with EXPO_PUBLIC_DEV_GALLERY=1 (for design shots and device checks); shipping builds never set it. */
export function devGalleryEnabled(): boolean {
    return __DEV__ || process.env.EXPO_PUBLIC_DEV_GALLERY === '1';
}
