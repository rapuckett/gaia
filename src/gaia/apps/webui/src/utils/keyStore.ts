// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The OS key store's states as the PC's API reports them (`gaia/ui/key_store.py`); shared by the desktop and the phone. */

export type KeyStoreState = 'waiting' | 'locked';

/** An error detail's `code` while the key store's prompt holds a request up (409). */
export const KEY_STORE_WAITING_CODE = 'key_store_waiting';
/** An error detail's `code` once the locked key store refused a request (423). */
export const KEY_STORE_LOCKED_CODE = 'key_store_locked';

/**
 * A provider row's key-store state. A PC from before `key_store` sends only `key_state`; reading that is the
 * versioned contract's one-release alias, not a guess, and goes with `key_state`.
 */
export function keyStoreOf(row: { key_store?: KeyStoreState | null; key_state?: string | null }): KeyStoreState | null {
    if (row.key_store !== undefined) return row.key_store;
    if (row.key_state === 'waiting_for_os_permission') return 'waiting';
    if (row.key_state === 'store_locked') return 'locked';
    return null;
}

/** The key-store state an error's structured detail names by its `code`; null for any other error. */
export function keyStoreErrorOf(body: Record<string, unknown> | null | undefined): KeyStoreState | null {
    const code = body?.code;
    if (code === KEY_STORE_WAITING_CODE) return 'waiting';
    if (code === KEY_STORE_LOCKED_CODE) return 'locked';
    return null;
}

/**
 * Whether a 409 is the key store's prompt holding the request up. A PC from before the codes sends plain text, so a
 * 409 without any `code` keeps its old meaning there (`legacyWait`); with codes, only `key_store_waiting` is a wait.
 */
export function isKeyStoreWait(status: number, body: Record<string, unknown> | null | undefined, legacyWait = true): boolean {
    if (status !== 409) return false;
    if (keyStoreErrorOf(body) === 'waiting') return true;
    return legacyWait && typeof body?.code !== 'string';
}

/** Whether a 423 is the locked key store; a PC from before the codes sent its 423s only for that. */
export function isKeyStoreLocked(status: number, body: Record<string, unknown> | null | undefined): boolean {
    if (status !== 423) return false;
    return keyStoreErrorOf(body) === 'locked' || typeof body?.code !== 'string';
}
