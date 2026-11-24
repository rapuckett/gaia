// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Root } from 'mdast';

export type MathModule = typeof import('./renderer');

/** Whether the tree holds a formula. */
export function hasMath(node: { type: string; children?: unknown[] }): boolean {
    if (node.type === 'math' || node.type === 'inlineMath') return true;
    return (node.children ?? []).some((child) => hasMath(child as Root));
}

/** The formula renderer, for an answer with formulas; null for one without, which never loads it. */
export function mathRenderer(needed: boolean): MathModule | null {
    // Required here, not imported: the bundle runs MathJax only when the first formula draws.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return needed ? (require('./renderer') as MathModule) : null;
}
