// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { useT } from '../i18n/useT';
import type { InferenceStats } from '../types';
import { answerSummary, composeSummary, exactStats } from '../utils/answerStats.core';
import type { TurnEnding } from '../utils/turnEnding.core';
import { spokenDuration, type Mark } from '../utils/spokenDuration.core';
import { MarkedText, markLtr as marked } from './MarkedText';
import './AnswerStats.css';

const plain: Mark = (text) => text;

export { answerSummary, exactStats, spokenDuration };

export type { TurnEnding };

/** The answer footer in plain words; a click shows the exact numbers. */
export function AnswerStats({ latencyMs, stats, ended }: { latencyMs?: number; stats?: InferenceStats; ended?: TurnEnding }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const summary = composeSummary(latencyMs, stats, ended, t, marked);
    const exact = exactStats(latencyMs, stats, t, marked, ended);
    if (!summary && exact.length === 0) return null;
    return (
        <>
            <span>
                <button
                    type="button"
                    className="msg-stats-summary"
                    aria-expanded={open}
                    title={exactStats(latencyMs, stats, t, plain, ended).join('\n')}
                    onClick={() => setOpen((v) => !v)}
                >
                    {summary ? <MarkedText text={summary} /> : t('answer.details')}
                </button>
            </span>
            {open && exact.map((line) => <span key={line}><MarkedText text={line} /></span>)}
        </>
    );
}
