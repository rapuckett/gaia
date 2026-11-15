// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Pure parsing and validation of the generic render cards (issue #2108), shared by the web and phone UIs. */

import type { AgentStep, RenderCardData, StreamEvent } from '../types';

/** Render cap for table rows and columns, list items, and key_value items. */
export const MAX_ITEMS = 500;

/** Above this length (JSON.stringify(data).length), skip the pretty-printed dump. */
export const MAX_PAYLOAD_JSON_LENGTH = 2_000_000;

export type Scalar = string | number | boolean | null;

export function isScalar(value: unknown): value is Scalar {
    return (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    );
}

/** Render a scalar payload value as plain text. */
export function scalarText(value: Scalar): string {
    return value === null ? '' : String(value);
}

export function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

/** How many items past the cap a payload holds. */
export function overflowCount(total: number): number {
    return total - MAX_ITEMS;
}

/** The visible `+N more (truncated)` row shown when a cap kicks in. */
export function truncationLabel(total: number): string {
    return `+${overflowCount(total)} more (truncated)`;
}

export interface TablePayload {
    title?: string;
    columns: string[];
    rows: Scalar[][];
}

export function isTablePayload(value: unknown): value is TablePayload {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        isOptionalString(v.title) &&
        Array.isArray(v.columns) &&
        v.columns.every((c) => typeof c === 'string') &&
        Array.isArray(v.rows) &&
        v.rows.every((r) => Array.isArray(r) && r.every(isScalar))
    );
}

export interface KeyValuePayload {
    title?: string;
    items: Array<{ key: string; value: Scalar }>;
}

export function isKeyValuePayload(value: unknown): value is KeyValuePayload {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        isOptionalString(v.title) &&
        Array.isArray(v.items) &&
        v.items.every(
            (item) =>
                item &&
                typeof item === 'object' &&
                typeof (item as Record<string, unknown>).key === 'string' &&
                isScalar((item as Record<string, unknown>).value),
        )
    );
}

export interface ListPayload {
    title?: string;
    ordered?: boolean;
    items: Array<string | number>;
}

export function isListPayload(value: unknown): value is ListPayload {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        isOptionalString(v.title) &&
        (v.ordered === undefined || typeof v.ordered === 'boolean') &&
        Array.isArray(v.items) &&
        v.items.every((item) => typeof item === 'string' || typeof item === 'number')
    );
}

/** The cards a reloaded answer drew, from the steps that persisted them. */
export function cardsFromSteps(steps: AgentStep[] | undefined): RenderCardData[] | undefined {
    const cards = (steps || [])
        .filter((s) => typeof s.render === 'string' && s.render.length > 0)
        .map((s) => ({ render: s.render as string, data: s.data }));
    return cards.length > 0 ? cards : undefined;
}

/** The cards a running turn has drawn so far: each `tool_result` with a non-empty render key. */
export function cardsFromEvents(events: readonly StreamEvent[]): RenderCardData[] {
    const cards: RenderCardData[] = [];
    for (const e of events) {
        if (e.type === 'tool_result' && typeof e.render === 'string' && e.render.length > 0) cards.push({ render: e.render, data: e.data });
    }
    return cards;
}

export interface UnsupportedView {
    variant: 'unknown' | 'invalid';
    /** The payload, pretty-printed; null when it is too large to show. */
    pretty: string | null;
    /** The compact JSON's length, for the too-large notice. */
    bytes: number;
}

/** What the fallback card shows of a payload: a JSON dump, or its size when it would freeze the screen. */
export function unsupportedView(variant: 'unknown' | 'invalid', data: unknown): UnsupportedView {
    let rawJson: string;
    try {
        rawJson = JSON.stringify(data);
    } catch {
        rawJson = String(data);
    }
    // JSON.stringify(undefined) is undefined, not a string.
    if (typeof rawJson !== 'string') rawJson = String(data);
    if (rawJson.length > MAX_PAYLOAD_JSON_LENGTH) return { variant, pretty: null, bytes: rawJson.length };
    let pretty = rawJson;
    try {
        pretty = JSON.stringify(data, null, 2) ?? rawJson;
    } catch {
        pretty = rawJson;
    }
    return { variant, pretty, bytes: rawJson.length };
}
