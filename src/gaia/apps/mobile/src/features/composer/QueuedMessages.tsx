// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError, GaiaError } from '@/api/errors';
import { describeHttpFailure, useT, type Translate } from '@/i18n/useT';
import { View } from 'react-native';

import { Button, IconButton, Row, Stack, Text, useTheme } from '@/ui';
import { RotateCcw, X } from '@/ui/icons';

import type { HeldMessage } from './composerQueue';

export interface QueuedMessagesProps {
    items: readonly HeldMessage[];
    onRemove(id: number): void;
    onRetry(id: number): void;
    /** Absent when no running reply can take a message. */
    onSteer?(id: number): void;
    /** A reply is running in this chat, so queued messages wait for it. */
    replying: boolean;
}

function stateLine(item: HeldMessage, replying: boolean, t: Translate): string {
    switch (item.state) {
        case 'failed':
            return t('queue.notSent');
        case 'queued':
            if (item.note) return t('queue.steerRefused');
            return t(replying ? 'queue.waiting' : 'queue.sendingNext');
        case 'sending':
            return t('queue.sending');
        default:
            return t('queue.delivered');
    }
}

/** Our own wording for a failure (when it has any) and the PC's or the system's raw text. Rows saved as a plain string show it as the detail. */
function failureLines(item: HeldMessage, t: Translate): { text?: string; detail?: string } {
    const f = item.failure;
    if (!f) return { detail: item.error };
    const error = f.status === undefined ? new GaiaError(f.messageKey, f.params) : new GaiaApiError(f.status, f.detail ?? '', f.messageKey, f.params);
    const { text, detail } = describeHttpFailure(error, t);
    return { text, detail };
}

function FailureDetail({ item, t }: { item: HeldMessage; t: Translate }) {
    const { text, detail } = failureLines(item, t);
    return (
        <>
            {text ? (
                <Text role="caption" tone="muted" testID={`queued-reason-${item.id}`}>
                    {text}
                </Text>
            ) : null}
            {detail ? (
                <Text role="caption" tone="muted" dir="ltr" align="ltr" testID={`queued-error-${item.id}`}>
                    {detail}
                </Text>
            ) : null}
        </>
    );
}

/** Messages typed while GAIA answers, oldest first. */
export function QueuedMessages({ items, onRemove, onRetry, onSteer, replying }: QueuedMessagesProps) {
    const t = useT();
    const { colors, radius, space } = useTheme();
    // A message going out right now already shows in the chat.
    const shown = items.filter((m) => m.state !== 'starting');
    if (shown.length === 0) return null;
    return (
        <Stack gap="sm" paddingX="lg" testID="queued-messages" accessibilityRole="list">
            {shown.map((item) => (
                <View
                    key={item.id}
                    testID={`queued-${item.id}`}
                    style={{
                        backgroundColor: colors.bgSecondary,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: item.state === 'failed' ? colors.danger : colors.border,
                        borderStyle: item.state === 'queued' ? 'dashed' : 'solid',
                        paddingHorizontal: space.sm,
                        paddingVertical: space.xs,
                    }}
                >
                    <Stack gap="xs">
                        <Row gap="sm" align="center">
                            <Stack flex={1}>
                                <Text role="ui" numberOfLines={1} largeLines={2}>
                                    {item.text}
                                </Text>
                            </Stack>
                            {item.state === 'queued' || item.state === 'failed' ? (
                                <IconButton
                                    icon={X}
                                    size="sm"
                                    label={t('queue.removeAria', { text: item.text })}
                                    onPress={() => onRemove(item.id)}
                                    testID={`queued-remove-${item.id}`}
                                />
                            ) : null}
                        </Row>
                        <Row gap="sm" align="center">
                            <Stack flex={1}>
                                <Text role="caption" tone={item.state === 'failed' ? 'danger' : 'secondary'}>
                                    {stateLine(item, replying, t)}
                                </Text>
                            </Stack>
                            {item.state === 'failed' ? (
                                <Button
                                    label={t('queue.sendAgain')}
                                    accessibilityLabel={t('queue.sendAgainAria', { text: item.text })}
                                    icon={RotateCcw}
                                    variant="ghost"
                                    size="sm"
                                    onPress={() => onRetry(item.id)}
                                    testID={`queued-retry-${item.id}`}
                                />
                            ) : null}
                            {item.state === 'queued' && onSteer ? (
                                <Button
                                    label={t('queue.steer')}
                                    variant="ghost"
                                    size="sm"
                                    onPress={() => onSteer(item.id)}
                                    testID={`queued-steer-${item.id}`}
                                />
                            ) : null}
                        </Row>
                        {item.state === 'failed' ? <FailureDetail item={item} t={t} /> : null}
                    </Stack>
                </View>
            ))}
        </Stack>
    );
}
