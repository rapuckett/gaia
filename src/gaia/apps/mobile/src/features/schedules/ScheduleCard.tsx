// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import type { MessageKey, Say } from '@webui/i18n/registry';

import type { Schedule } from '@/api/client.types';
import { useScheduleResults } from '@/data';
import { ConfirmSheet } from '@/features/setup/sheets/ConfirmSheet';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { ActionSheet, Button, Disclosure, Icon, IconButton, Notice, Pressable, Row, Stack, Surface, Text, useTheme, type SheetAction } from '@/ui';
import { Clock, Ellipsis, Pause, Pencil, Play, Trash2, Zap } from '@/ui/icons';

import { composeDateLocale, describeSchedule, formatNextClock, formatTime } from './scheduleText';

const STATUS: Record<Schedule['status'], { label: MessageKey; tone: 'success' | 'warning' | 'muted' }> = {
    active: { label: 'schedules.status.active', tone: 'success' },
    paused: { label: 'schedules.status.paused', tone: 'warning' },
    cancelled: { label: 'schedules.status.cancelled', tone: 'muted' },
};

/** The desktop's `.schedule-card-status`: a small tinted tag with square-ish corners, not a pill. */
function StatusTag({ label, tone }: { label: string; tone: 'success' | 'warning' | 'muted' }) {
    const { colors, radius } = useTheme();
    const bg = { success: colors.accentGreenDim, warning: colors.accentYellowDim, muted: colors.bgTertiary }[tone];
    return (
        <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text role="caption" weight="semibold" tone={tone} numberOfLines={1} compact>
                {label}
            </Text>
        </View>
    );
}

/** The PC's pill CSS capitalizes its lowercase status keys; so do we, in the locale's own rules. */
function capitalized(label: string, locale: string | undefined): string {
    return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

/** The desktop's `.schedule-card-error`: a tinted strip with a danger hairline border. */
function ErrorStrip({ children }: { children: ReactNode }) {
    const { colors } = useTheme();
    return (
        <View style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 6, backgroundColor: colors.dangerDim, paddingHorizontal: 8, paddingVertical: 6 }}>
            {children}
        </View>
    );
}

export interface ScheduleCardProps {
    schedule: Schedule;
    now: Date;
    /** A run started from this phone has not been answered yet. */
    runPending: boolean;
    onOpenChat: (sessionId: string) => void;
    onRunNow: () => void;
    onToggleStatus: () => void;
    onDelete: () => void;
    onEdit: () => void;
    /** Dev gallery only: opens the card already confirming a delete, or with its history open. */
    initialConfirmDelete?: boolean;
    initialHistoryOpen?: boolean;
}

export function ScheduleCard({ schedule, now, runPending, onOpenChat, onRunNow, onToggleStatus, onDelete, onEdit, initialConfirmDelete = false, initialHistoryOpen = false }: ScheduleCardProps) {
    const t = useT();
    const [confirmDelete, setConfirmDelete] = useState(initialConfirmDelete);
    const [menuOpen, setMenuOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(initialHistoryOpen);
    const history = useScheduleResults(schedule.name, schedule.last_run_at, historyOpen);
    const runs = history.data?.results ?? [];
    const historyShowsFailure = historyOpen && runs.some((r) => r.error);

    const described = describeSchedule(schedule.description_parts, t);
    const running = schedule.running === true || runPending;
    const status = STATUS[schedule.status];
    const when = (fmt: (say: Say, locale: string | undefined) => string) =>
        t.compose((say, code) => fmt(say, composeDateLocale(code, t)));

    const nextClock = schedule.status === 'paused' ? null : formatNextClock(schedule.next_run_at, now, composeDateLocale(t.locale, t));

    const menuActions: SheetAction[] = [
        { label: t('schedules.card.edit'), icon: Pencil, disabled: running, onPress: onEdit, testID: `schedule-edit-${schedule.name}` },
        { label: t('schedules.card.delete'), icon: Trash2, destructive: true, onPress: () => setConfirmDelete(true), testID: `schedule-delete-${schedule.name}` },
    ];

    return (
        <Surface tone="secondary" radius="sm" border padding="md">
            <Stack gap="sm">
                <Pressable
                    minSize={0}
                    disabled={!schedule.session_id}
                    dimmed={false}
                    onPress={() => onOpenChat(schedule.session_id!)}
                    testID={`schedule-card-${schedule.name}`}
                >
                    <Stack gap="sm">
                        <Row gap="sm" justify="between">
                            <Stack flex={1}>
                                <Text role="ui" weight="semibold" numberOfLines={1}>
                                    {schedule.name}
                                </Text>
                            </Stack>
                            <StatusTag label={capitalized(t(status.label), t.locale)} tone={status.tone} />
                        </Row>
                        <Text role="label" tone="secondary" numberOfLines={3}>
                            {schedule.prompt}
                        </Text>
                        <Row gap="xs">
                            <Icon icon={Clock} size="sm" tone="muted" />
                            <Stack flex={1}>
                                <Text role="label" tone="muted">
                                    {described ?? schedule.description}
                                </Text>
                            </Stack>
                        </Row>
                        <Row gap="md" wrap>
                            <Text role="label" tone="muted">
                                {t('schedules.card.runs', { n: schedule.run_count })}
                            </Text>
                            {schedule.error_count > 0 ? (
                                <Text role="label" tone="muted">
                                    {t('schedules.card.errors', { n: schedule.error_count })}
                                </Text>
                            ) : null}
                            <Text role="label" tone="muted">
                                {when((say, locale) => say('schedules.card.last', { when: formatTime(schedule.last_run_at, say, now, locale) }))}
                            </Text>
                            <Text role="label" tone="muted">
                                {when((say, locale) =>
                                    say('schedules.card.next', {
                                        when: schedule.status === 'paused' ? say('schedules.status.paused') : formatTime(schedule.next_run_at, say, now, locale),
                                    }),
                                )}
                            </Text>
                            {nextClock ? (
                                <Text role="label" tone="muted">
                                    {nextClock}
                                </Text>
                            ) : null}
                        </Row>
                        {schedule.last_error && !historyShowsFailure ? (
                            <ErrorStrip>
                                <Stack gap="xs">
                                    <Text role="label">{t('mobileApp.schedules.card.lastFailedLabel')}</Text>
                                    <Text role="label" dir="ltr">{schedule.last_error}</Text>
                                </Stack>
                            </ErrorStrip>
                        ) : null}
                    </Stack>
                </Pressable>
                <Row gap="xs" wrap>
                    <Button size="sm"
                        icon={Zap}
                        label={t(running ? 'schedules.card.running' : 'schedules.card.runNow')}
                        disabled={running}
                        onPress={onRunNow}
                        testID={`schedule-run-${schedule.name}`}
                    />
                    <Button size="sm"
                        icon={schedule.status === 'active' ? Pause : Play}
                        label={t(schedule.status === 'active' ? 'schedules.card.pause' : 'schedules.card.resume')}
                        onPress={onToggleStatus}
                        testID={`schedule-toggle-${schedule.name}`}
                    />
                    <Stack flex={1} />
                    <IconButton
                        icon={Ellipsis}
                        size="sm"
                        label={t('row.moreActions', { title: schedule.name })}
                        onPress={() => setMenuOpen(true)}
                        testID={`schedule-more-${schedule.name}`}
                    />
                </Row>
                <Disclosure title={t('schedules.history')} open={historyOpen} onToggle={() => setHistoryOpen((open) => !open)}>
                    <Stack gap="sm">
                        {history.isPending ? <Text tone="muted">{t('schedules.historyLoading')}</Text> : null}
                        {history.isError ? <Notice tone="danger" message={describeHttpFailure(history.error, t).text} detail={describeHttpFailure(history.error, t).detail} /> : null}
                        {history.data && runs.length === 0 ? <Text tone="muted">{t('schedules.historyEmpty')}</Text> : null}
                        {runs.map((run) => (
                            <Stack key={run.id} gap="xs">
                                <Text role="label" tone="muted">
                                    {when((say, locale) => formatTime(run.executed_at, say, now, locale))}
                                </Text>
                                {run.error ? (
                                    <Text role="label" tone="danger">
                                        {run.error}
                                    </Text>
                                ) : (
                                    <Text role="label" tone="secondary" numberOfLines={6}>
                                        {run.result || t('schedules.noOutput')}
                                    </Text>
                                )}
                            </Stack>
                        ))}
                    </Stack>
                </Disclosure>
            </Stack>
            <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} actions={menuActions} />
            <ConfirmSheet
                open={confirmDelete}
                title={t('schedules.delete.ask', { name: schedule.name })}
                body={[
                    t('schedules.delete.what'),
                    ...(schedule.session_id ? [t('schedules.delete.chatStays')] : []),
                    ...(schedule.running ? [t('schedules.delete.runStops')] : []),
                ]}
                confirmLabel={t('schedules.delete.confirm')}
                cancelLabel={t('schedules.delete.cancel')}
                danger
                onConfirm={() => {
                    setConfirmDelete(false);
                    onDelete();
                }}
                onCancel={() => setConfirmDelete(false)}
            />
        </Surface>
    );
}
