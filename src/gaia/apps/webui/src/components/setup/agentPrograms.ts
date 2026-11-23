// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Which agent program can be picked, shared by the Agent choice in setup and Settings and the phone app's. */

import type { MessageKey } from '../../i18n/registry';
import type { AgentProgram, FlagshipAgent } from '../../types';

export interface AgentOption {
    id: FlagshipAgent;
    label: MessageKey;
    more: MessageKey;
    tag: MessageKey;
}

export const AGENT_OPTIONS: AgentOption[] = [
    { id: 'gaiapy', label: 'setup.agent.gaiapy', more: 'setup.agent.gaiapyMore', tag: 'setup.offer.recommended' },
    { id: 'gaiacpp', label: 'setup.agent.gaiacpp', more: 'setup.agent.gaiacppMore', tag: 'setup.agent.beta' },
];

export const AGENT_WHY: Record<NonNullable<AgentProgram['unavailable_code']>, MessageKey> = {
    no_release: 'setup.agent.why.noRelease',
    unreachable: 'setup.agent.why.unreachable',
    unverifiable: 'setup.agent.why.unverifiable',
};

/** Setup's pick: saved on Continue, and downloaded first when `download` is set. */
export interface AgentPick {
    id: FlagshipAgent;
    download: boolean;
    /** The agent saved now (possibly one this version can't run), which setup carries on with if the pick can't be had. */
    current: string;
}

/** Where setup keeps the pick across a reload. */
export const AGENT_PICK_KEY = 'gaia.setup.agentPick';

/** gaiapy is always selectable, whatever the listing says, so nobody is locked out of switching back. */
export function agentInstalled(p: AgentProgram): boolean {
    return p.id === 'gaiapy' || p.installed;
}

/** Not here and can't be had: the row is shown but can't be picked. */
export function agentOff(p: AgentProgram | undefined): boolean {
    return !!p && !agentInstalled(p) && !p.can_download;
}

/** In Settings a gaiacpp that isn't here is had through its Download button, never by selecting it. */
export function agentNeedsDownload(p: AgentProgram | undefined, inSettings: boolean): boolean {
    return !!p && inSettings && !agentInstalled(p) && p.can_download;
}
