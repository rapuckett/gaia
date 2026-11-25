// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';
import { create } from 'zustand';
import './setup/setup.css';

/**
 * One app-wide polite live region. Screen readers often skip a region inserted
 * already holding text but reliably read text changes in one that exists, so
 * transient confirmations go through announce() instead of carrying their own role.
 */
const useAnnouncerStore = create<{ text: string }>(() => ({ text: '' }));

let pending: ReturnType<typeof setTimeout> | undefined;

/** Reads `text` aloud politely. The same text twice is read twice. */
export function announce(text: string): void {
    if (!text) return;
    if (pending !== undefined) clearTimeout(pending);
    // Clear first so an identical message is a change, then set it on the next tick.
    useAnnouncerStore.setState({ text: '' });
    pending = setTimeout(() => {
        pending = undefined;
        useAnnouncerStore.setState({ text });
    }, 0);
}

/** Announces `text` each time it becomes a new non-empty value (null or '' says nothing). */
export function useAnnounce(text: string | null | undefined): void {
    useEffect(() => {
        if (text) announce(text);
    }, [text]);
}

export function LiveAnnouncer() {
    const text = useAnnouncerStore((s) => s.text);
    return (
        <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden" data-testid="live-announcer">
            {text}
        </div>
    );
}
