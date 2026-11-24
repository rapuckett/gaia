// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Pure rules for setup's chat-model list and the plan's agent line, shared by the desktop and the phone app. */

import type { MessageKey } from '../../i18n/registry';
import type { AgentPrograms, SetupCatalogEntry } from '../../types';
import { isEmbedding, isNpu } from './selection';

export interface ChatRows {
    /** Tested models, listed first. */
    verified: SetupCatalogEntry[];
    /** Everything else, folded behind "Show untested models". */
    untested: SetupCatalogEntry[];
    /** The chosen chat model is untested, so the fold starts open. */
    untestedPicked: boolean;
}

/** The chat models offered for where chat runs, tested ones first and the rest folded. */
export function chatRows(catalog: SetupCatalogEntry[], defaultChat: string | null | undefined): ChatRows {
    const chat = catalog.find((e) => e.id === defaultChat);
    const onNpu = !!chat && isNpu(chat);
    const rows = catalog.filter((e) => e.chat_choice && !isEmbedding(e) && (e.gaia_model || e.downloaded) && isNpu(e) === onNpu
        && (e.setup_offer || e.id === defaultChat));
    return {
        verified: rows.filter((e) => e.support === 'verified'),
        untested: rows.filter((e) => e.support !== 'verified'),
        untestedPicked: chat?.support === 'untested',
    };
}

/** The agent the plan names, or null when there is no choice to make (no gaiacpp that is here or can be had) or the agent is unknown. */
export function planAgentLabel(agents: AgentPrograms | undefined, pickedId?: string | null): MessageKey | null {
    const cpp = agents?.programs.find((p) => p.id === 'gaiacpp');
    if (!cpp || !(cpp.installed || cpp.can_download)) return null;
    const shown = pickedId ?? agents?.current;
    return shown === 'gaiapy' ? 'setup.agent.gaiapy' : shown === 'gaiacpp' ? 'setup.agent.gaiacpp' : null;
}
