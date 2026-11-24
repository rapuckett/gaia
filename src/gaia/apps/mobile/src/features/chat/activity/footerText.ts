// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolateUnit, type MessageKey } from '@webui/i18n/registry';
import type { DurationWords } from '@webui/utils/agentActivity.core';
import { composeSummary, exactStats } from '@webui/utils/answerStats.core';
import type { InferenceStats } from '@webui/types';
import type { TurnEnding } from '@webui/utils/turnEnding.core';

import type { Translate } from '@/i18n/useT';

export interface AnswerFooterText {
    /** "Answered in 12 s on this PC · first word in 2 s"; null when there is nothing to say. */
    summary: string | null;
    /** The measured numbers behind it, one per line. */
    exact: string[];
}

/** The phone says "your PC" and, in Arabic, spells the duration units. */
const PHONE_WORDS: Partial<Record<MessageKey, MessageKey>> = {
    'answer.place.thisPc': 'mobileApp.answer.place.thisPc',
    'answer.duration.sec': 'mobileApp.answer.duration.sec',
    'answer.duration.min': 'mobileApp.answer.duration.min',
    'answer.duration.minSec': 'mobileApp.answer.duration.minSec',
    'answer.duration.ms': 'mobileApp.answer.duration.ms',
};
const phone = (key: MessageKey): MessageKey => PHONE_WORDS[key] ?? key;

/** Latin units stay left to right inside right-to-left text; Arabic units read naturally. */
const ltr = isolateUnit;

/** The same duration words for the thinking header. */
export const PHONE_DURATION: DurationWords = { mark: ltr, variant: phone };

export function answerFooterText(
    latencyMs: number | undefined,
    stats: InferenceStats | undefined,
    ended: TurnEnding | undefined,
    t: Translate,
): AnswerFooterText {
    return {
        summary: composeSummary(latencyMs, stats, ended, t, ltr, phone),
        exact: exactStats(latencyMs, stats, t, ltr, ended, phone),
    };
}
