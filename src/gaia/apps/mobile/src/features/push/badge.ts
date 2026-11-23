// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ActiveRuns, Session } from '@webui/types';

/**
 * The app-icon badge, counted by chat (Design's rule): chats waiting on the user (an approval or a question) plus
 * chats with a finished or failed run not opened since. Eval and scheduled chats never alert, so they never count.
 */
export function chatBadgeCount(sessions: readonly Session[] | undefined, active: ActiveRuns | undefined): number {
    const skip = new Set((sessions ?? []).filter((s) => s.kind === 'eval' || s.kind === 'scheduled').map((s) => s.id));
    const chats = new Set<string>();
    for (const id of Object.keys(active?.awaiting_user ?? {})) if (!skip.has(id)) chats.add(id);
    for (const s of sessions ?? []) if (s.unread && !skip.has(s.id)) chats.add(s.id);
    return chats.size;
}
