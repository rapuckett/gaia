// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useRouter } from 'expo-router';
import { useState } from 'react';

import { isolate, type MessageKey } from '@webui/i18n/registry';
import type { PlanItemStatus } from '@webui/utils/agentActivity.core';
import { visibleText } from '@webui/utils/calendarApproval.core';
import type { ChatDocument, CommandState, FocusFacet, FocusKind, LivePlan, RanCommand } from '@webui/utils/sessionFocus.core';
import { sameFile } from '@webui/utils/sessionFocus.core';
import type { Message, Schedule } from '@webui/types';

import { useRunSchedule, useUpdateScheduleStatus } from '@/data';
import { composeDateLocale, describeSchedule, formatNextClock, formatTime } from '@/features/schedules/scheduleText';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { Button, Chip, Icon, IconButton, Notice, Pressable, ProgressLine, Row, Spinner, Stack, Text } from '@/ui';
import { Ban, CalendarClock, Check, Circle, CircleAlert, Code, FileText, Globe, ListChecks, Mail, MessageSquare, Pause, Play, Square, Terminal, X, Zap, type LucideIcon } from '@/ui/icons';

import { jumpToMessage } from '../messages/jumpToMessage';
import { PanelSection } from './PanelSection';
import { useSessionPanelStore, type PanelSectionId } from './panelStore';
import { turnSummaryOf } from './turnSummary';

const FACET: Record<FocusKind, { label: MessageKey; icon: LucideIcon }> = {
    chat: { label: 'focus.chat', icon: MessageSquare },
    coding: { label: 'focus.coding', icon: Code },
    commands: { label: 'focus.commands', icon: Terminal },
    documents: { label: 'focus.documents', icon: FileText },
    scheduled: { label: 'focus.scheduled', icon: CalendarClock },
    plan: { label: 'focus.plan', icon: ListChecks },
    web: { label: 'focus.web', icon: Globe },
    email: { label: 'focus.email', icon: Mail },
};

/** What the chat is doing, as chips; one with a section opens it. */
export function FocusBar({ facets }: { facets: FocusFacet[] }) {
    const t = useT();
    const reveal = useSessionPanelStore((s) => s.reveal);
    return (
        <Stack accessibilityRole="list" accessibilityLabel={t('focus.label')} testID="focus-bar">
        <Row gap="sm" wrap>
            {facets.map((facet) => {
                const { label, icon } = FACET[facet.kind];
                const text = facet.count != null ? `${t.bare(label)} ${facet.count}` : t.bare(label);
                const section = facet.section && facet.section in useSessionPanelStore.getState().sections ? (facet.section as PanelSectionId) : undefined;
                return (
                    <Chip
                        key={facet.kind}
                        label={text}
                        accessibilityLabel={facet.count != null ? `${t(label)} ${facet.count}` : t(label)}
                        icon={icon}
                        onPress={section ? () => reveal(section) : undefined}
                        testID={`focus-chip-${facet.kind}`}
                    />
                );
            })}
        </Row>
        </Stack>
    );
}

const PLAN_LABEL: Record<PlanItemStatus, MessageKey> = {
    done: 'activity.planStatus.done',
    running: 'activity.planStatus.running',
    failed: 'activity.planStatus.failed',
    stopped: 'activity.planStatus.stopped',
    pending: 'activity.planStatus.pending',
};

function PlanMark({ status }: { status: PlanItemStatus }) {
    if (status === 'done') return <Icon icon={Check} size="sm" tone="success" />;
    if (status === 'running') return <Spinner size="sm" />;
    if (status === 'failed') return <Icon icon={X} size="sm" tone="danger" />;
    if (status === 'stopped') return <Icon icon={Ban} size="sm" tone="muted" />;
    return <Icon icon={Circle} size="sm" tone="muted" />;
}

/** The plan a turn is working through, ticking over as it runs and kept as it ended until the next message. */
export function PlanSection({ plan }: { plan: LivePlan | null }) {
    const t = useT();
    if (!plan) return null;
    const total = plan.steps.length;
    const done = plan.statuses.filter((s) => s === 'done').length;
    return (
        <PanelSection id="plan" title={t('plan.title')} summary={t('plan.progress', { done, total })}>
            <Stack gap="md">
                <ProgressLine value={done / total} accessibilityLabel={t('plan.title')} />
                <Stack gap="md" accessibilityRole="list" accessibilityLabel={t('plan.listLabel')}>
                    {plan.steps.map((step, i) => {
                        const status = plan.statuses[i] ?? 'pending';
                        return (
                            <Stack key={`${i}-${step}`} accessibilityLabel={`${t(PLAN_LABEL[status])}: ${step}`}>
                                <Row gap="md" align="start">
                                    <PlanMark status={status} />
                                    <Stack flex={1}>
                                        <Text dir="auto">{step}</Text>
                                    </Stack>
                                </Row>
                            </Stack>
                        );
                    })}
                </Stack>
            </Stack>
        </PanelSection>
    );
}

/** The schedules that run in this chat: when, what happened last, Pause and Run now. */
export function ScheduleSection({ schedules, close }: { schedules: Schedule[]; close?: () => void }) {
    const t = useT();
    const router = useRouter();
    const update = useUpdateScheduleStatus();
    const run = useRunSchedule();
    const [now] = useState(() => new Date());
    if (schedules.length === 0) return null;
    const busy = update.isPending || run.isPending;
    const failure = update.error ? { key: 'schedules.updateFailed' as const, error: update.error } : run.error ? { key: 'schedules.runNowFailed' as const, error: run.error } : null;
    return (
        <PanelSection id="schedule" title={t('sched.title')}>
            <Stack gap="lg">
                <Stack gap="lg" accessibilityRole="list" accessibilityLabel={t('sched.listLabel')}>
                    {schedules.map((schedule) => {
                        const paused = schedule.status === 'paused';
                        const running = schedule.running === true;
                        const when = describeSchedule(schedule.description_parts, t) ?? schedule.description;
                        const next = t.compose((say, code) =>
                            say('schedules.card.next', {
                                when: paused ? say('schedules.status.paused') : formatTime(schedule.next_run_at, say, now, composeDateLocale(code, t)),
                            }),
                        );
                        const clock = paused ? null : formatNextClock(schedule.next_run_at, now, composeDateLocale(t.locale, t));
                        return (
                            <Stack key={schedule.id} gap="xs" testID={`panel-schedule-${schedule.name}`}>
                                <Row gap="md">
                                    <Icon icon={CalendarClock} size="sm" tone="muted" />
                                    <Stack flex={1}>
                                        <Text weight="medium" numberOfLines={1}>
                                            {isolate(schedule.name, 'ltr')}
                                        </Text>
                                    </Stack>
                                    <IconButton
                                        icon={paused ? Play : Pause}
                                        size="sm"
                                        variant="ghost"
                                        label={paused ? t('schedules.card.resume') : t('schedules.card.pause')}
                                        disabled={busy}
                                        onPress={() => {
                                            run.reset();
                                            update.mutate({ name: schedule.name, status: paused ? 'active' : 'paused' });
                                        }}
                                    />
                                    <IconButton
                                        icon={Zap}
                                        size="sm"
                                        variant="ghost"
                                        label={t('schedules.card.runNow')}
                                        busy={running}
                                        disabled={busy || running}
                                        onPress={() => {
                                            update.reset();
                                            run.mutate(schedule.name);
                                        }}
                                    />
                                </Row>
                                <Text role="caption" tone="muted">
                                    {when}
                                </Text>
                                <Text role="caption" tone="muted">
                                    {`${running ? t('schedules.card.running') : next}${clock ? ` · ${clock}` : ''} · ${t('schedules.card.runs', { n: schedule.run_count })}`}
                                </Text>
                                {schedule.last_error ? (
                                    <Text role="caption" tone="danger" dir="ltr">
                                        {t('schedules.card.lastFailed', { error: isolate(schedule.last_error, 'ltr') })}
                                    </Text>
                                ) : null}
                            </Stack>
                        );
                    })}
                </Stack>
                {failure ? <Notice tone="danger" message={t(failure.key)} detail={describeHttpFailure(failure.error, t).text} testID="panel-schedule-error" /> : null}
                <Button
                    variant="ghost"
                    size="sm"
                    label={t('sched.manage')}
                    onPress={() => {
                        close?.();
                        router.push('/schedules');
                    }}
                />
            </Stack>
        </PanelSection>
    );
}

/** Commands shown before "Show more": the latest ones, since those are what the chat is on now. */
export const COMMANDS_SHOWN = 5;

const COMMAND_LABEL: Record<CommandState, MessageKey> = {
    ok: 'cmd.ok',
    failed: 'cmd.failed',
    declined: 'cmd.declined',
    stopped: 'activity.planStatus.stopped',
    running: 'cmd.running',
};

function CommandMark({ state }: { state: CommandState }) {
    if (state === 'ok') return <Icon icon={Check} size="sm" tone="success" />;
    if (state === 'failed') return <Icon icon={X} size="sm" tone="danger" />;
    if (state === 'declined') return <Icon icon={Ban} size="sm" tone="muted" />;
    if (state === 'stopped') return <Icon icon={Square} size="sm" tone="muted" />;
    return <Spinner size="sm" />;
}

/** The shell commands the chat ran on this PC, newest first: what ran, what failed, what was refused. */
export function CommandsSection({ commands, close }: { commands: RanCommand[]; close?: () => void }) {
    const t = useT();
    const [all, setAll] = useState(false);
    const [notLoaded, setNotLoaded] = useState(false);
    if (commands.length === 0) return null;
    const newestFirst = [...commands].reverse();
    const shown = all ? newestFirst : newestFirst.slice(0, COMMANDS_SHOWN);
    const failed = commands.filter((c) => c.state === 'failed').length;
    const goTo = (messageId: number) => {
        const found = jumpToMessage(messageId);
        if (found) close?.();
        setNotLoaded(!found);
    };
    return (
        <PanelSection id="commands" title={t('cmd.title')} summary={failed > 0 ? t.plural('cmd.failedCount', failed, { n: failed }) : String(commands.length)}>
            <Stack gap="md">
                <Stack gap="md" accessibilityRole="list" accessibilityLabel={t('cmd.listLabel')}>
                    {shown.map((c) => {
                        const text = visibleText(c.command, true);
                        const line = (
                            <Row gap="md">
                                <CommandMark state={c.state} />
                                <Stack flex={1}>
                                    <Text mono dir="ltr" align="ltr" numberOfLines={1} ellipsize="tail">
                                        {text}
                                    </Text>
                                </Stack>
                            </Row>
                        );
                        const label = `${t(COMMAND_LABEL[c.state])}: ${text}`;
                        return c.messageId != null ? (
                            <Pressable key={c.key} inline hugHeight accessibilityLabel={label} onPress={() => goTo(c.messageId as number)}>
                                {line}
                            </Pressable>
                        ) : (
                            <Stack key={c.key} accessibilityLabel={label}>
                                {line}
                            </Stack>
                        );
                    })}
                </Stack>
                {commands.length > COMMANDS_SHOWN ? (
                    <Button variant="ghost" size="sm" label={all ? t('out.fewer') : t('out.more', { n: commands.length - COMMANDS_SHOWN })} onPress={() => setAll((v) => !v)} />
                ) : null}
                {notLoaded ? <Notice tone="warning" message={t('out.notLoaded')} onDismiss={() => setNotLoaded(false)} /> : null}
            </Stack>
        </PanelSection>
    );
}

/** Passages of the document at *path* the latest answer drew on, or 0. */
function passagesUsed(messages: readonly Message[], path: string): number {
    const last = messages[messages.length - 1];
    const used = last?.role === 'assistant' ? (turnSummaryOf(last as never)?.documents ?? []) : [];
    return used.find((d) => sameFile(d.path, path))?.passages ?? 0;
}

/** The documents this chat can search: whether each is ready, and which the latest answer used. */
export function DocumentsSection({ documents, messages }: { documents: ChatDocument[]; messages: readonly Message[] }) {
    const t = useT();
    if (documents.length === 0) return null;
    return (
        <PanelSection id="documents" title={t('docsp.title')} summary={String(documents.length)}>
            <Stack gap="md" accessibilityRole="list" accessibilityLabel={t('docsp.listLabel')}>
                {documents.map(({ entry, doc }) => {
                    const name = entry.name || doc?.filename || entry.path.split(/[\\/]/).pop() || entry.path;
                    const status = doc?.indexing_status;
                    const indexing = status === 'indexing' || status === 'pending';
                    const failed = status === 'failed' || status === 'missing';
                    const used = passagesUsed(messages, entry.path);
                    const trailing = used > 0 ? t.plural('docsp.used', used, { n: used }) : indexing ? t('docs.indexingLabel') : failed ? t('docs.failed') : doc && doc.chunk_count > 0 ? t.plural('docsp.passages', doc.chunk_count, { n: doc.chunk_count }) : null;
                    return (
                        <Stack key={entry.path} gap="xs">
                            <Row gap="md">
                                {indexing ? <Spinner size="sm" /> : <Icon icon={failed ? CircleAlert : FileText} size="sm" tone={failed ? 'danger' : 'muted'} />}
                                <Stack flex={1}>
                                    <Text numberOfLines={1} ellipsize="middle">
                                        {isolate(name, 'ltr')}
                                    </Text>
                                </Stack>
                                {trailing ? (
                                    <Text role="caption" tone={failed ? 'danger' : used > 0 ? 'accent' : 'muted'}>
                                        {trailing}
                                    </Text>
                                ) : null}
                            </Row>
                            {failed && doc?.last_error ? (
                                <Text role="caption" tone="danger" dir="ltr">
                                    {doc.last_error}
                                </Text>
                            ) : null}
                        </Stack>
                    );
                })}
            </Stack>
        </PanelSection>
    );
}
