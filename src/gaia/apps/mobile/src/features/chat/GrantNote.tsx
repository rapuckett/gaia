// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '@/i18n/useT';
import { Notice } from '@/ui';

/** The PC's reply when an account is connected but the agent isn't granted it. */
export function isAgentNotGranted(content: string): boolean {
    return content.includes('AGENT_NOT_GRANTED:');
}

/** Granting an agent an account stays on the PC, so a Connect button here would loop. */
export function GrantNote() {
    const t = useT();
    return <Notice tone="info" role="status" message={t('mobileApp.agentNotGranted.note')} testID="agent-not-granted" />;
}
