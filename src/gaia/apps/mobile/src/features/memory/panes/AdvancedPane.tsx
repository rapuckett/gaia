// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemorySettings, useMemoryStats } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import { EmptyState, ErrorState, LoadingState, Stack } from '@/ui';
import { Brain } from '@/ui/icons';

import { CoveragePill } from '../CoveragePill';
import type { MemoryPaneProps } from '../tabs';

/** The Advanced tab: the load and failed states, "Memory is off", then the tab's content (a later mem-* task fills it). */
export function AdvancedPane(_props: MemoryPaneProps) {
    const t = useT();
    const stats = useMemoryStats();
    const settings = useMemorySettings();

    const failed = (stats.isError && !stats.data) || (settings.isError && !settings.data);
    const loading = !failed && (!stats.data || !settings.data);
    const retry = () => {
        if (stats.isError) void stats.refetch();
        if (settings.isError) void settings.refetch();
    };

    return (
        <Stack flex={1}>
            <CoveragePill />
            {loading ? (
                <LoadingState title={t('mem.loadingData')} />
            ) : failed ? (
                <ErrorState
                    title={t('mem.loadFailed')}
                    message={describeError(stats.error ?? settings.error, t)}
                    action={{ label: t('mem.retry'), onPress: retry }}
                />
            ) : settings.data && !settings.data.memory_enabled ? (
                <EmptyState icon={Brain} title={t('mem.offAdvanced')} />
            ) : (
                <Stack flex={1} testID="memory-pane-advanced" />
            )}
        </Stack>
    );
}
