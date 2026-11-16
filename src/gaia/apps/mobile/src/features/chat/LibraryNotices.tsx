// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Message, StreamEvent } from '@/api/client.types';
import { Notice, Stack } from '@/ui';

/** Notices on a saved reply; the PC keeps them with the message, under either name. */
export function libraryNoticesOf(message: Message): string[] {
    const m = message as { libraryNotices?: string[] | null; library_notices?: string[] | null };
    return m.libraryNotices ?? m.library_notices ?? [];
}

/** Notices from a finished turn's `done`, shown until the saved reply carries them. */
export function libraryNoticesFromEvents(events: readonly StreamEvent[]): string[] {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i] as { type: string; library_notices?: string[] | null };
        if (e.type === 'done') return e.library_notices ?? [];
    }
    return [];
}

/** What the PC said about files it kept or could not add, one quiet notice each, in its own words. */
export function LibraryNotices({ notices }: { notices: readonly string[] }) {
    if (notices.length === 0) return null;
    return (
        <Stack gap="xs" testID="library-notices">
            {notices.map((text, i) => (
                <Notice key={`${i}-${text}`} tone="warning" role="note" message={text} />
            ))}
        </Stack>
    );
}
