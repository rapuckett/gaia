// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { InferenceStats } from '@webui/types';
import type { TurnEnding } from '@webui/utils/turnEnding.core';
import { shortModelName } from '@webui/utils/modelList.core';
import { useState } from 'react';

import { useT } from '@/i18n/useT';
import { Disclosure, Ltr, Notice, Stack, Text } from '@/ui';

import { answerFooterText } from './footerText';

export interface AnswerFooterProps {
    latencyMs?: number;
    stats?: InferenceStats;
    ended?: TurnEnding;
}

/** Under a finished answer: how long it took and where, with the exact numbers one tap away. */
export function AnswerFooter({ latencyMs, stats, ended }: AnswerFooterProps) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const { summary, exact } = answerFooterText(latencyMs, stats, ended, t);
    // A retried answer names its own model elsewhere, so the router's pick is not shown.
    const route = stats?.retried ? undefined : stats?.route;
    const notice = stats?.route?.degraded && stats.route.notice ? stats.route.notice : null;
    if (!summary && exact.length === 0 && !route?.model && !notice) return null;
    return (
        <Stack gap="xs">
            {route?.model ? (
                <Text role="caption" tone="muted" testID="answer-route">
                    <Ltr>{shortModelName(route.model)}</Ltr>
                </Text>
            ) : null}
            {summary || exact.length > 0 || route?.model ? (
                <Disclosure title={summary ?? t('answer.details')} open={open} onToggle={() => setOpen((v) => !v)} testID="answer-footer" headerTestID="answer-footer-toggle">
                    <Stack gap="xs">
                        {route?.model ? (
                            <Text role="caption" tone="muted">
                                {t('msg.route', { reason: '' }).trim()}
                            </Text>
                        ) : null}
                        {route?.model && route.reason ? (
                            <Text role="caption" tone="muted" dir="ltr" align="start" testID="answer-route-reason">
                                {route.reason}
                            </Text>
                        ) : null}
                        {exact.map((line) => (
                            <Text key={line} role="caption" tone="muted">
                                {line}
                            </Text>
                        ))}
                    </Stack>
                </Disclosure>
            ) : null}
            {notice ? <Notice tone="warning" message={notice} testID="answer-route-notice" /> : null}
        </Stack>
    );
}
