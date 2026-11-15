// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
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

/** Numbers with units keep their own direction inside right-to-left text. */
const ltr = (text: string): string => isolate(text, 'ltr');

export function answerFooterText(
    latencyMs: number | undefined,
    stats: InferenceStats | undefined,
    ended: TurnEnding | undefined,
    t: Translate,
): AnswerFooterText {
    return {
        summary: composeSummary(latencyMs, stats, ended, t, ltr),
        exact: exactStats(latencyMs, stats, t, ltr, ended),
    };
}
