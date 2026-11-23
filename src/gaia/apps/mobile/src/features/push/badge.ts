// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { attentionCount, chatPhases } from '@webui/utils/chatAlerts.core';
import type { AlertSettings } from '@webui/utils/alertSettings.core';
import type { ActiveRuns, Session } from '@webui/types';

/**
 * The app-icon badge, counted by chat as the desktop's tray badge is (`attentionCount`): chats waiting on the user plus
 * unread finished or failed chats, minus the chat on screen and any event the Notifications pane turned off.
 * Eval and scheduled chats never alert, so they never count.
 */
export function chatBadgeCount(
    sessions: readonly Session[] | undefined,
    active: ActiveRuns | undefined,
    modes: AlertSettings['modes'],
    currentSessionId: string | null,
): number {
    const phases = chatPhases(active?.session_ids ?? [], active?.awaiting_user ?? {}, []);
    return attentionCount(sessions ?? [], phases, modes, currentSessionId);
}
