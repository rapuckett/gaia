// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';

import { translator, type Translate } from '@webui/i18n/translator';
import { formatRelativeDate, isOverdue, type TemporalItem } from '@webui/utils/memoryFormat.core';

import { useT } from '@/i18n/useT';
import { Icon, Row, Stack, Text, useTheme } from '@/ui';
import { CircleCheck, Clock, TriangleAlert } from '@/ui/icons';

import { SectionEmpty, SectionTitle } from './SectionTitle';
import { ContentText } from '../ContentText';

/** The relative time in one language's words only, so the composed line brackets the English once. */
function plainTranslator(code: string): Translate {
    const base = translator(code);
    return Object.assign((key: Parameters<Translate>[0], params?: Parameters<Translate>[1]) => base.bare(key, params), base);
}

/** "OVERDUE: yesterday" / "Due: in 2 days", each half with its own time words. */
export function upcomingLine(t: Translate, dueAt: string, overdue: boolean): string {
    return t.compose((say, code) => say(overdue ? 'mem.upcoming.overdue' : 'mem.upcoming.due', { when: formatRelativeDate(dueAt, plainTranslator(code)) }));
}

/** Items with a due time: overdue ones get a red edge and a warning icon, upcoming ones a yellow edge and a clock. */
export function UpcomingList({ items }: { items: TemporalItem[] }) {
    const t = useT();
    const { colors, radius, space } = useTheme();
    return (
        <Stack gap="md" testID="memory-upcoming">
            <SectionTitle icon={Clock} title={t('mem.upcoming.title')} />
            {items.length === 0 ? (
                <SectionEmpty icon={CircleCheck} text={t('mem.upcoming.empty')} />
            ) : (
                <Stack gap="sm">
                    {items.map((item) => {
                        const overdue = isOverdue(item.due_at);
                                        return (
                            <View
                                key={item.id}
                                testID={`memory-upcoming-${item.id}`}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'flex-start',
                                    gap: space.md,
                                    padding: space.md,
                                    borderWidth: 1,
                                    borderColor: colors.borderLight,
                                    backgroundColor: overdue ? colors.dangerDim : colors.accentYellowDim,
                                    borderRadius: radius.md,
                                }}
                            >
                                <Icon icon={overdue ? TriangleAlert : Clock} size="md" tone={overdue ? 'danger' : 'warning'} />
                                <Stack flex={1} gap="xs">
                                    <ContentText>{item.content}</ContentText>
                                    <Row wrap gap="xs">
                                        <Text role="caption" tone={overdue ? 'danger' : 'muted'}>
                                            {upcomingLine(t, item.due_at, overdue)}
                                        </Text>
                                        {item.context !== 'global' ? (
                                            <Text role="caption" tone="muted" dir="auto">
                                                {`· ${item.context}`}
                                            </Text>
                                        ) : null}
                                    </Row>
                                </Stack>
                            </View>
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
}
