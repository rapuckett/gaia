// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { useMemoryMaintenance, useMemorySettings, useRefreshMemory, type MemoryMaintenanceAction } from '@/data';
import { useT } from '@/i18n/useT';
import { ActionSheet, Badge, IconButton, Notice, Row, Screen, Stack, Text, type SheetAction } from '@/ui';
import { ArrowLeft, Ellipsis } from '@/ui/icons';

import { failureNotice, MAINTENANCE_ACTIONS, MAINTENANCE_LABELS, outcomeNotice } from './maintenance';
import { MemoryTabs } from './MemoryTabs';
import { MEMORY_TABS, type MemoryTabKey } from './tabs';
import { useMemoryNotice } from './useMemoryNotice';

export interface MemoryScreenProps {
    onBack: () => void;
}

export function MemoryScreen({ onBack }: MemoryScreenProps) {
    const t = useT();
    const [tab, setTab] = useState<MemoryTabKey>('about');
    const [menuOpen, setMenuOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const { notice, notify, dismiss } = useMemoryNotice();
    const settings = useMemorySettings();
    const refresh = useRefreshMemory();
    const maintenance = useMemoryMaintenance();
    const running = maintenance.isPending ? maintenance.variables : undefined;

    const pullToRefresh = async () => {
        setRefreshing(true);
        try {
            await refresh();
        } finally {
            setRefreshing(false);
        }
    };

    const run = (action: MemoryMaintenanceAction) => {
        if (running) return;
        notify({ tone: 'info', text: t(MAINTENANCE_LABELS[action].busy), sticky: true });
        maintenance.mutate(action, {
            onSuccess: (outcome) => notify(outcomeNotice(outcome, t)),
            onError: (error) => notify(failureNotice(action, error, t)),
        });
    };

    const actions: SheetAction[] = [
        { label: t('mem.refresh'), onPress: () => void pullToRefresh() },
        ...MAINTENANCE_ACTIONS.map((action) => ({
            label: t(MAINTENANCE_LABELS[action][running === action ? 'busy' : 'idle']),
            onPress: () => run(action),
        })),
    ];
    const Pane = MEMORY_TABS.find((entry) => entry.key === tab)!.Pane;

    const header = (
        <Stack gap="sm" paddingY="sm">
            <Stack paddingX="lg">
                <Row gap="sm" accessibilityRole="header">
                    <IconButton icon={ArrowLeft} label={t('mem.back')} onPress={onBack} />
                    <Stack flex={1}>
                        <Row gap="sm" wrap>
                            <Text role="title" weight="semibold">
                                {t('mem.title')}
                            </Text>
                            <Badge label={t('mem.beta')} tone="warning" />
                        </Row>
                    </Stack>
                    {tab === 'advanced' ? (
                        <IconButton icon={Ellipsis} label={t('mem.maint.label')} busy={!!running} onPress={() => setMenuOpen(true)} testID="memory-maintenance" />
                    ) : null}
                </Row>
            </Stack>
            <MemoryTabs value={tab} onChange={setTab} />
            {notice ? (
                <Stack paddingX="lg">
                    <Notice tone={notice.tone} message={notice.text} onDismiss={dismiss} testID="memory-notice" />
                </Stack>
            ) : null}
        </Stack>
    );

    return (
        <Screen scroll refreshing={refreshing} onRefresh={() => void pullToRefresh()} header={header}>
            <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('mem.maint.label')} actions={actions} />
            <Pane notify={notify} memoryEnabled={settings.data?.memory_enabled} />
        </Screen>
    );
}
