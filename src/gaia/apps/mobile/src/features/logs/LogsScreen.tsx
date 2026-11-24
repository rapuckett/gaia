// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { useLogSources, type LogSource } from '@/data';
import { formatSize } from '@webui/utils/format';
import { serverText, useT } from '@/i18n/useT';
import { Divider, Notice, Screen, Select, Stack, Text } from '@/ui';
import { Archive, FileText } from '@/ui/icons';

import { SettingsHeader } from '../settings/SettingsHeader';
import { LogTabs } from './LogTabs';
import { LogView } from './LogView';
import { PcOnlyAction } from './PcOnlyAction';

/** The PC's logs on the phone: a tab per group, a file picker when a group has several, and the followed log under them. */
export function LogsScreen({ onBack, active = true, initialSource = 'model_server', initialFollow, initialProblemsOnly }: {
    onBack: () => void;
    /** False while another screen is in front: the log stops being followed. */
    active?: boolean;
    initialSource?: LogSource;
    initialFollow?: boolean;
    initialProblemsOnly?: boolean;
}) {
    const t = useT();
    const [source, setSource] = useState<LogSource>(initialSource);
    const [picked, setPicked] = useState<{ source: LogSource; file: string } | null>(null);
    const sources = useLogSources(active);
    const files = sources.data?.sources.find((s) => s.id === source)?.files ?? [];
    const file = picked?.source === source ? picked.file : (files[0]?.name ?? null);
    return (
        <Screen scroll header={<SettingsHeader title={t('logs.title')} backLabel={t('setup.back')} onBack={onBack} />}>
            <LogTabs value={source} onChange={setSource} />
            <Stack gap="lg" paddingX="lg" paddingY="md">
                {sources.isError ? (
                    <Notice tone="warning" message={t('mobileApp.logs.filesFailed')} detail={serverText(sources.error)} testID="log-files-failed" />
                ) : null}
                {files.length > 1 ? (
                    <Select
                        label={t('logs.file')}
                        value={file ?? undefined}
                        onChange={(name) => setPicked({ source, file: name })}
                        options={files.map((f) => ({ value: f.name, label: f.size_bytes != null ? `${f.name} (${formatSize(f.size_bytes)})` : f.name }))}
                        testID="log-file"
                    />
                ) : null}
                <LogView
                    key={`${source}:${file ?? ''}`}
                    source={source}
                    file={file}
                    active={active}
                    initialFollow={initialFollow}
                    initialProblemsOnly={initialProblemsOnly}
                />
                <Text role="caption" tone="muted">{t('logs.privacy')}</Text>
                <Divider />
                <PcOnlyAction
                    label={t('logs.saveAll')}
                    icon={Archive}
                    note={t('mobileApp.logs.reportNote')}
                    detail={t('mobileApp.logs.saveAllOnPc')}
                    testID="logs-save-all"
                />
                <PcOnlyAction
                    label={t('setup.logs.report')}
                    icon={FileText}
                    detail={t('setup.logs.reportOnPc')}
                    testID="logs-report"
                />
            </Stack>
        </Screen>
    );
}
