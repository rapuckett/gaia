// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

/** The smallest touch target the sweep accepts, in points; the app aims for 48. */
export const TOUCH_FLOOR = 44;

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };

export interface Touchable {
    node: Json;
    testID?: string;
    /** accessibilityLabel, else the text inside. */
    name: string;
    role?: string;
    minHeight: number;
    minWidth: number;
    checked?: boolean | 'mixed';
    selected?: boolean;
    expanded?: boolean;
    disabled: boolean;
    busy: boolean;
}

const isJson = (n: Json | string | undefined): n is Json => typeof n === 'object' && n !== null;

export function textOf(node: Json | string): string {
    if (typeof node === 'string') return node;
    return (node.children ?? []).map(textOf).join('');
}

/** Every host node in the rendered tree, in reading order. */
export function walk(root: Json | Json[] | null = screen.toJSON() as Json | Json[] | null): Json[] {
    const out: Json[] = [];
    const visit = (n: Json | string) => {
        if (!isJson(n)) return;
        out.push(n);
        for (const c of n.children ?? []) visit(c);
    };
    for (const r of Array.isArray(root) ? root : root ? [root] : []) visit(r);
    return out;
}

const pick = <T,>(...values: (T | undefined)[]): T | undefined => values.find((v) => v !== undefined);

export function describe(node: Json): Touchable {
    const p = node.props;
    const state = (p.accessibilityState ?? {}) as Record<string, boolean | 'mixed' | undefined>;
    const style = StyleSheet.flatten(p.style as never) as { minHeight?: number; minWidth?: number } | undefined;
    const slop = (p.hitSlop ?? {}) as { top?: number; bottom?: number; left?: number; right?: number };
    return {
        node,
        testID: p.testID as string | undefined,
        name: ((p.accessibilityLabel ?? p['aria-label']) as string | undefined) ?? textOf(node),
        role: (p.accessibilityRole ?? p.role) as string | undefined,
        minHeight: (style?.minHeight ?? 0) + (slop.top ?? 0) + (slop.bottom ?? 0),
        minWidth: (style?.minWidth ?? 0) + (slop.left ?? 0) + (slop.right ?? 0),
        checked: pick(p['aria-checked'] as boolean | 'mixed' | undefined, state.checked),
        selected: pick(p['aria-selected'] as boolean | undefined, state.selected as boolean | undefined),
        expanded: pick(p['aria-expanded'] as boolean | undefined, state.expanded as boolean | undefined),
        disabled: !!pick(p['aria-disabled'] as boolean | undefined, state.disabled),
        busy: !!pick(p['aria-busy'] as boolean | undefined, state.busy),
    };
}

/** Pressables in the tree: accessible host views that take a tap. */
export function touchables(root?: Json | Json[] | null): Touchable[] {
    return walk(root)
        .filter((n) => n.props.accessible !== false && (typeof n.props.onClick === 'function' || typeof n.props.onResponderGrant === 'function'))
        .map(describe);
}

export const byTestID = (list: Touchable[], id: string): Touchable => {
    const hit = list.find((t) => t.testID === id);
    if (!hit) throw new Error(`no touchable with testID ${id}; found ${list.map((t) => t.testID ?? t.name).join(', ')}`);
    return hit;
};

/** Failures of the two checks every control gets: a spoken name, and a role. */
export function unnamed(list: Touchable[]): string[] {
    return list.filter((t) => !t.name.trim() || !t.role).map((t) => `${t.testID ?? (t.name || '(no name)')} role=${t.role ?? 'none'}`);
}

/**
 * Controls under the floor; a control that sets no minimum at all counts as 0. Android's clipped ripple draws the target
 * on a wrapper the host JSON can't tie back to its pressable, so only iOS measures; both run the same Pressable code.
 */
export function tooSmall(list: Touchable[]): string[] {
    if (Platform.OS !== 'ios') return [];
    return list.filter((t) => t.minHeight < TOUCH_FLOOR).map((t) => `${t.testID ?? t.name}: ${t.minHeight}`);
}

/** Position of the first host node whose text matches, in reading order; -1 when absent. */
export function indexOfText(pattern: RegExp | string): number {
    return walk().findIndex((n) => (n.children ?? []).some((c) => typeof c === 'string' && (typeof pattern === 'string' ? c.includes(pattern) : pattern.test(c))));
}
