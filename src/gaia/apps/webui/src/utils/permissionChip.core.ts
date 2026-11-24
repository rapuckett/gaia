// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * What the permission chip shows. A chat's saved mode is unknown until it is
 * read, and "Ask" shown early would promise a question that may never come.
 * No DOM, so the phone derives the same states.
 */

import type { PermissionMode } from '../types';

export type PermissionChipState = 'checking' | 'unknown' | 'ask' | 'full_access';

export interface PermissionChipView {
    state: PermissionChipState;
    /** The chip's visible label key. */
    labelKey: 'perm.checking' | 'perm.unknown' | 'env.ask' | 'perm.full';
    /** Full access (lasting) and a failed read use the warning icon and tone. */
    warning: boolean;
    /** The mode is not known yet, so the accessible label names the state, not a mode. */
    unread: boolean;
    /** The mode named in the accessible label once it is known. */
    modeKey: 'perm.fullLower' | 'perm.askLower';
}

/** `mode` is null while the saved mode is unread; `error` is set when that read failed. */
export function permissionChipView(mode: PermissionMode | null, error: boolean): PermissionChipView {
    const full = mode === 'full_access';
    const unread = mode === null;
    const state: PermissionChipState = full ? 'full_access' : unread ? (error ? 'unknown' : 'checking') : 'ask';
    const labelKey = full ? 'perm.full' : unread ? (error ? 'perm.unknown' : 'perm.checking') : 'env.ask';
    return { state, labelKey, warning: full || (unread && error), unread, modeKey: full ? 'perm.fullLower' : 'perm.askLower' };
}
