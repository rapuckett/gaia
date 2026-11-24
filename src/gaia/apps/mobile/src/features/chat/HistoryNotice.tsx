// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { StreamEvent } from '@/api/client.types';
import { Stack, Text } from '@/ui';

/** The PC's text when a turn pushed older turns out of the model's view; null when none did. */
export function historyNoticeText(events: readonly StreamEvent[]): string | null {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i] as { type: string; status?: string; message?: string };
        if (e.type === 'status' && e.status === 'history_cut') return (e.message || '').trim() || null;
    }
    return null;
}

/** One quiet line before the reply. The text comes from the PC in English, as on the desktop, so it stays left-to-right. */
export function HistoryNotice({ text }: { text: string }) {
    return (
        <Stack paddingX="gutter">
            <Text role="caption" tone="secondary" align="center" dir="ltr" testID="history-notice">
                {text}
            </Text>
        </Stack>
    );
}
