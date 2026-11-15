// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import type { MessageKey, Say } from '@webui/i18n/registry';
import { dateLocale, translator } from '@webui/i18n/translator';

import type { Schedule } from '@/api/client.types';
import { CONFIRM_DELETE_MS } from '@/api/constants';
import { useScheduleResults } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import { Badge, Button, Card, Disclosure, Icon, Notice, Row, Stack, Text, type BadgeTone } from '@/ui';
import { Clock, MessageSquare, Pause, Play, Trash2, Zap } from '@/ui/icons';

import { describeSchedule, formatNextRun, formatTime } from './scheduleText';

const STATUS: Record<Schedule['status'], { label: MessageKey; tone: BadgeTone }> = {
    active: { label: 'schedules.status.active', tone: 'success' },
    paused: { label: 'schedules.status.paused', tone: 'warning' },
    cancelled: { label: 'schedules.status.cancelled', tone: 'neutral' },
};

export interface ScheduleCardProps {
    schedule: Schedule;
    now: Date;
    /** A run started from this phone has not been answered yet. */
    runPending: boolean;
    onOpenChat: (sessionId: string) => void;
    onRunNow: () => void;
    onToggleStatus: () => void;
    onDelete: () => void;
}

export function ScheduleCard({ schedule, now, runPending, onOpenChat, onRunNow, onToggleStatus, onDelete }: ScheduleCardProps) {
    const t = useT();
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const history = useScheduleResults(schedule.name, schedule.last_run_at, historyOpen);
    const runs = history.data?.results ?? [];
    const historyShowsFailure = historyOpen && runs.some((r) => r.error);
    useEffect(() => {
        if (!confirmDelete) return;
        const timer = setTimeout(() => setConfirmDelete(false), CONFIRM_DELETE_MS);
        return () => clearTimeout(timer);
    }, [confirmDelete]);

    const described = describeSchedule(schedule.description_parts, t);
    const running = schedule.running === true || runPending;
    const status = STATUS[schedule.status];
    const when = (fmt: (say: Say, locale: string | undefined) => string) =>
        t.compose((say, code) => fmt(say, dateLocale(translator(code))));

    return (
        <Card>
            <Stack gap="sm">
                <Row gap="sm" justify="between">
                    <Stack flex={1}>
                        <Text weight="semibold" numberOfLines={1}>
                            {schedule.name}
                        </Text>
                    </Stack>
                    <Badge label={t(status.label)} tone={status.tone} />
                </Row>
                <Text tone="secondary" numberOfLines={3}>
                    {schedule.prompt}
                </Text>
                <Row gap="xs">
                    <Icon icon={Clock} size="sm" tone="muted" />
                    <Stack flex={1}>
                        <Text role="caption" tone="muted">
                            {described ?? schedule.description}
                        </Text>
                    </Stack>
                </Row>
                <Row gap="md" wrap>
                    <Text role="caption" tone="muted">
                        {t('schedules.card.runs', { n: schedule.run_count })}
                    </Text>
                    {schedule.error_count > 0 ? (
                        <Text role="caption" tone="muted">
                            {t('schedules.card.errors', { n: schedule.error_count })}
                        </Text>
                    ) : null}
                    <Text role="caption" tone="muted">
                        {when((say, locale) => say('schedules.card.last', { when: formatTime(schedule.last_run_at, say, now, locale) }))}
                    </Text>
                    <Text role="caption" tone="muted">
                        {when((say, locale) =>
                            say('schedules.card.next', {
                                when: schedule.status === 'paused' ? say('schedules.status.paused') : formatNextRun(schedule.next_run_at, say, now, locale),
                            }),
                        )}
                    </Text>
                </Row>
                {schedule.last_error && !historyShowsFailure ? (
                    <Text role="caption" tone="danger">
                        {t('schedules.card.lastFailed', { error: schedule.last_error })}
                    </Text>
                ) : null}
                <Row gap="sm" wrap>
                    {schedule.session_id ? (
                        <Button
                            size="sm"
                            icon={MessageSquare}
                            label={t('schedules.card.openChat')}
                            onPress={() => onOpenChat(schedule.session_id!)}
                        />
                    ) : null}
                    <Button
                        size="sm"
                        icon={Zap}
                        label={t(running ? 'schedules.card.running' : 'schedules.card.runNow')}
                        disabled={running}
                        onPress={onRunNow}
                    />
                    <Button
                        size="sm"
                        icon={schedule.status === 'active' ? Pause : Play}
                        label={t(schedule.status === 'active' ? 'schedules.card.pause' : 'schedules.card.resume')}
                        onPress={onToggleStatus}
                    />
                    <Button
                        size="sm"
                        variant="danger"
                        icon={Trash2}
                        label={t(confirmDelete ? 'schedules.card.confirmDelete' : 'schedules.card.delete')}
                        onPress={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
                    />
                </Row>
                <Disclosure title={t('schedules.history')} open={historyOpen} onToggle={() => setHistoryOpen((open) => !open)}>
                    <Stack gap="sm">
                        {history.isPending ? <Text tone="muted">{t('schedules.historyLoading')}</Text> : null}
                        {history.isError ? <Notice tone="danger" message={describeError(history.error, t)} /> : null}
                        {history.data && runs.length === 0 ? <Text tone="muted">{t('schedules.historyEmpty')}</Text> : null}
                        {runs.map((run) => (
                            <Stack key={run.id} gap="xs">
                                <Text role="caption" tone="muted">
                                    {when((say, locale) => formatTime(run.executed_at, say, now, locale))}
                                </Text>
                                {run.error ? (
                                    <Text role="caption" tone="danger">
                                        {run.error}
                                    </Text>
                                ) : (
                                    <Text role="caption" tone="secondary" numberOfLines={6}>
                                        {run.result || t('schedules.noOutput')}
                                    </Text>
                                )}
                            </Stack>
                        ))}
                    </Stack>
                </Disclosure>
            </Stack>
        </Card>
    );
}
