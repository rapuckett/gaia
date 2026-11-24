// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { ref, type MessageKey } from '@webui/i18n/registry';

import type { Goal } from '@/api/client.types';
import { useGoalAction, useGoals, useGoalStats, useGoalStoreHealth, useResetGoalStore, type GoalAction } from '@/data';
import { isPcRefusal, PcOnlyNotice } from '@/features/settings/PcOnlyNotice';
import { plainFailureText, useLocaleCode, useT } from '@/i18n/useT';
import { View } from 'react-native';

import { Button, LoadingState, Notice, Row, Stack, Text, useTheme } from '@/ui';
import { Plus } from '@/ui/icons';

import { GoalCard } from '../goals/GoalCard';
import { STAT_STATUSES, STATUS_KEYS } from '../goals/goalText';
import { NewGoalSheet } from '../goals/NewGoalSheet';
import { SuggestedGoals } from '../goals/SuggestedGoals';
import type { MemoryPaneProps } from '../tabs';

const FAILURES: Record<GoalAction, MessageKey> = {
    approve: 'mem.goals.acceptFailed',
    reject: 'mem.goals.rejectFailed',
    cancel: 'mem.goals.cancelFailed',
    delete: 'mem.goals.deleteFailed',
};

/** One status as an outline pill: the count in bold, the label after it, the status color on the border only. */
export function StatPill({ status, count }: { status: (typeof STAT_STATUSES)[number]; count: number }) {
    const t = useT();
    const locale = useLocaleCode();
    const { colors, radius, space } = useTheme();
    const border = { queued: colors.accent, in_progress: colors.accentYellow, completed: colors.accentGreen, failed: colors.danger }[status];
    const label = t(STATUS_KEYS[status]!);
    const shown = label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
    return (
        <View
            accessible
            accessibilityLabel={`${label}: ${count}`}
            testID={`goals-stat-${status}`}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                paddingHorizontal: space.md,
                paddingVertical: space.xs,
                borderWidth: 1,
                borderColor: border,
                borderRadius: radius.full,
            }}
        >
            <Text role="label" weight="bold">
                {`\u2066${count}\u2069`}
            </Text>
            <Text role="label">{shown}</Text>
        </View>
    );
}

export function GoalsPane({ notify }: MemoryPaneProps) {
    const t = useT();
    const [creating, setCreating] = useState(false);
    const list = useGoals();
    const stats = useGoalStats();
    const health = useGoalStoreHealth();
    const resetStore = useResetGoalStore();
    const act = useGoalAction();
    const busyId = act.isPending ? act.variables.id : null;

    const run = (goal: Goal, action: GoalAction) =>
        act.mutate(
            { id: goal.id, action },
            { onError: (error) => notify({ tone: 'danger', text: plainFailureText(t, 'mem.goals.failed', { what: ref(FAILURES[action]) }, error) }) },
        );

    const startNewList = () =>
        resetStore.mutate(undefined, {
            onSuccess: ({ kept }) => notify({ tone: 'success', text: t('mem.goals.newListStarted', { file: kept }) }),
            onError: (error) => notify({ tone: 'danger', text: plainFailureText(t, 'mem.goals.failed', { what: ref('mem.goals.startNewListFailed') }, error) }),
        });

    const goals = list.data;
    const suggested = goals?.filter((goal) => goal.status === 'pending_approval') ?? [];
    const shown = goals?.filter((goal) => goal.status !== 'pending_approval' && goal.status !== 'rejected') ?? [];

    return (
        <Stack gap="lg" paddingX="lg" paddingY="md" testID="memory-pane-goals">
            <Text tone="secondary">{t('mem.goals.intro')}</Text>
            {health.data?.error ? (
                health.data.damaged ? (
                    <Stack gap="sm" align="start" testID="goals-store-damaged">
                        <Notice tone="warning" message={t('mem.goals.storeDamaged')} />
                        <Button label={t.bare('mem.goals.startNewList')} accessibilityLabel={t('mem.goals.startNewList')} variant="secondary" disabled={resetStore.isPending} onPress={startNewList} testID="goals-start-new-list" />
                    </Stack>
                ) : (
                    <Notice tone="warning" title={t('mem.goals.storeError')} message={health.data.error} testID="goals-store-error" />
                )
            ) : null}
            <Row gap="sm" wrap testID="goals-stats">
                {STAT_STATUSES.map((status) => (
                    <StatPill key={status} status={status} count={stats.data?.goals[status] ?? 0} />
                ))}
            </Row>
            <SuggestedGoals goals={suggested} busyId={busyId} onAccept={(goal) => run(goal, 'approve')} onReject={(goal) => run(goal, 'reject')} />
            <Stack align="start">
                <Button label={t.bare('mem.goals.new')} accessibilityLabel={t('mem.goals.new')} icon={Plus} variant="secondary" onPress={() => setCreating(true)} testID="goals-new" />
            </Stack>
            {list.isError && !goals && isPcRefusal(list.error) ? (
                <PcOnlyNotice testID="goals-pc-only" />
            ) : list.isError && !goals ? (
                <Stack gap="md" align="start" testID="goals-failed">
                    <Text tone="danger">{t('mobileApp.mem.sectionFailed')}</Text>
                    <Button label={t.bare('mem.about.retry')} accessibilityLabel={t('mem.about.retry')} variant="secondary" onPress={() => void list.refetch()} />
                </Stack>
            ) : !goals ? (
                <LoadingState title={t('mem.goals.loading')} />
            ) : shown.length === 0 ? (
                <Text tone="secondary" testID="goals-empty">
                    {t('mem.goals.empty')}
                </Text>
            ) : (
                <Stack gap="md">
                    {shown.map((goal) => (
                        <GoalCard key={goal.id} goal={goal} busy={busyId === goal.id} onCancel={(g) => run(g, 'cancel')} onDelete={(g) => run(g, 'delete')} />
                    ))}
                </Stack>
            )}
            <NewGoalSheet open={creating} onClose={() => setCreating(false)} />
        </Stack>
    );
}
