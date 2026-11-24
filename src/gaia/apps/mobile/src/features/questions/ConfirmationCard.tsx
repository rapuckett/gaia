// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { isMessageKey, isolateUnit } from '@webui/i18n/registry';

import type { StreamEvent } from '@/api/client.types';
import { useT, type Translate } from '@/i18n/useT';
import { Button, Row, Stack, Surface, Text } from '@/ui';

export interface ConfirmationCardProps {
    /** The machine tool name; shown as a step name. */
    action: string;
    /** Can carry tool arguments derived from untrusted content: shown only as plain text. */
    summary: string;
    onDismiss?: () => void;
}

/** The card's props from a needs_confirmation event; null when it lacks an action or summary. */
export function confirmationProps(event: Pick<StreamEvent, 'type' | 'action' | 'summary'>): ConfirmationCardProps | null {
    if (event.type !== 'needs_confirmation' || typeof event.action !== 'string' || typeof event.summary !== 'string') return null;
    return { action: event.action, summary: event.summary };
}

/** The step in the UI language ("Writing file"); a tool with no entry reads as its own words, isolated. */
export function stepName(action: string, t: Translate): string {
    const key = `tool.${action}.active`;
    if (isMessageKey(key)) return t(key);
    const words = action.replace(/[_-]+/g, ' ').trim();
    return words ? t('tool.named.active', { what: isolateUnit(words) }) : t('tool.default.active');
}

/** What is left when the agent is too old to ask: the step did not run. Dismiss just hides the card. */
export function ConfirmationCard({ action, summary, onDismiss }: ConfirmationCardProps) {
    const t = useT();
    const [dismissed, setDismissed] = useState(false);
    const step = stepName(action, t);

    if (dismissed) {
        return (
            <Surface tone="secondary" radius="md" padding="md" border>
                <Text role="caption" tone="muted">
                    {t('confirmCard.dismissed', { step })}
                </Text>
            </Surface>
        );
    }

    return (
        <Surface tone="card" radius="md" padding="md" border>
            <Stack gap="md">
                <Row gap="sm" wrap>
                    <Text role="caption" weight="semibold" tone="warning">
                        {t('confirmCard.badge')}
                    </Text>
                    <Text role="label" weight="semibold">
                        {step}
                    </Text>
                </Row>
                <Surface tone="recessed" radius="sm" padding="sm" border>
                    <Text role="caption" mono selectable>
                        {summary}
                    </Text>
                </Surface>
                <Text role="caption" tone="secondary">
                    {t('confirmCard.agentTooOld')}
                </Text>
                <Row justify="end">
                    <Button
                        label={t('confirmCard.dismiss')}
                        variant="ghost"
                        size="sm"
                        onPress={() => {
                            setDismissed(true);
                            onDismiss?.();
                        }}
                    />
                </Row>
            </Stack>
        </Surface>
    );
}
