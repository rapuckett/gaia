// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// The same rules as the native notification code (PushPayload.clean in PushMessage.swift and PushMessage.kt).
const DROPPED = /[‪-‮⁦-⁩]/g;
const BREAKS = /[\u0000-\u001F\u007F-\u009F\s]+/g;

/** A PC's text made safe to show: bidi overrides dropped, controls and whitespace collapsed to one space, at most `max` characters. */
export function cleanPcText(text: string, max: number): string {
    const clean = text.replace(DROPPED, '').replace(BREAKS, ' ').trim();
    const chars = Array.from(clean);
    return chars.length <= max ? clean : `${chars.slice(0, max - 1).join('')}…`;
}
