// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

let reopen: (() => void) | null = null;

/** The setup gate registers how to reopen setup while it is mounted, and clears it when it unmounts. */
export function registerReopenSetup(open: () => void): () => void {
    reopen = open;
    return () => {
        if (reopen === open) reopen = null;
    };
}

/** Reopens setup in re-run mode from outside the gate (Settings > Setup > Run setup again). */
export function reopenSetup(): void {
    if (!reopen) throw new Error('Setup cannot reopen: the setup gate is not mounted.');
    reopen();
}
