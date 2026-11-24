// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { AGENT_WHY, agentInstalled } from '@webui/components/setup/agentPrograms';
import { isolate, type MessageKey, type Params, type Say } from '@webui/i18n/registry';

import type { AgentProgram } from '@/api/client.types';
import { GaiaApiError, GaiaError } from '@/api/errors';
import { serverText, type Translate } from '@/i18n/useT';

/** A sentence the person reads, and the PC's own text for the muted line under it. */
export interface AgentLine {
    text: string;
    detail?: string;
    /** Secondary text for a line that explains rather than reports a failure; red when unset. */
    tone?: 'secondary';
}

/** Our own words for a failure, for an `{error}` slot; the PC's text never goes inside the sentence. */
export function reasonFreeWith(err: unknown, say: Say): string {
    if (err instanceof GaiaApiError && err.messageKey === 'mobileApp.error.auth') return say('mobileApp.error.authNoDetail');
    if (err instanceof GaiaError) return say(err.messageKey, err.params);
    return say('msg.error');
}

/** `key`'s sentence with our words for the failure in `{error}`, and the PC's text, if any, as the detail. */
export function failureLine(key: MessageKey, err: unknown, t: Translate, params: Params = {}): AgentLine {
    return { text: t.compose((say) => say(key, { ...params, error: reasonFreeWith(err, say) })), detail: serverText(err) };
}

/** The name of an agent program inside a sentence, kept whole in Arabic. */
export function programName(id: string): string {
    return isolate(id, 'ltr');
}

/** Why gaiacpp can't be picked: our words for a reason the PC coded, else its own text on the detail line. */
export function blockedLine(cpp: AgentProgram, t: Translate): AgentLine {
    const code = cpp.unavailable_code;
    if (code) return { text: t.compose((say) => say('setup.agent.cantDownload', { reason: say(AGENT_WHY[code]) })) };
    return { text: t('setup.agent.notInstalledMore'), detail: cpp.unavailable_reason ?? undefined };
}

/** What a gaiacpp that isn't here but can be downloaded does, in Settings (its Download button) or setup (the Download step). */
export function downloadNote(cpp: AgentProgram | undefined, inSettings: boolean, t: Translate): string | null {
    if (!cpp || agentInstalled(cpp) || !cpp.can_download) return null;
    return t(inSettings ? 'setup.agent.downloadsOnButton' : 'setup.agent.downloadsLater');
}
