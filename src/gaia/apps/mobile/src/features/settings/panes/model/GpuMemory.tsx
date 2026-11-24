// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { formatSize, ltrIn } from '@webui/components/setup/format';

import { useActiveModel, useGpuMemory } from '@/data';
import { describeHttpFailure, useLocaleCode, useT } from '@/i18n/useT';
import { ChoiceList, Disclosure, Notice, Row, Stack, Text } from '@/ui';

import { defaultTarget } from '../../../setup/steps/gpu';
import { SettingsAnchor } from '../../targets';
import { GpuChange } from './GpuChange';

const KEEP = 'keep';

/** GPU memory on a PC that shares it: today's split, and where GAIA can write it, the sizes to apply or undo from here (the PC asks for administrator permission). */
export function GpuMemory() {
    const t = useT();
    const locale = useLocaleCode();
    const read = useGpuMemory();
    const [picked, setPicked] = useState<boolean | null>(null);
    const [chosen, setChosen] = useState<number | null | undefined>(undefined);
    const chatInCloud = !!useActiveModel().data?.remote;
    const status = read.data;
    const failed = read.error;
    const failureText = failed ? describeHttpFailure(failed, t) : null;

    if (!status?.applies && !failed) return null;
    const open = picked ?? (!!status?.pending || !!failed);
    const gb = (n: number) => ltrIn(locale, formatSize(n));
    const presets = status?.presets ?? [];
    const target = chosen !== undefined ? chosen : status ? defaultTarget(status, chatInCloud) : null;
    const options = [
        ...(status?.gpu_gb != null ? [{ value: KEEP, label: t('gpu.presets.keep', { gb: gb(status.gpu_gb) }) }] : []),
        ...presets.map((p) => ({ value: String(p.setting_gb), label: t('gpu.presets.gpu', { gb: gb(p.gpu_gb) }) })),
    ];

    return (
        <SettingsAnchor name="gpu-memory" onTarget={() => setPicked(true)}>
            <Disclosure title={t('gpu.settingsTitle')} open={open} onToggle={() => setPicked(!open)} headerTestID="gpu-memory-toggle" testID="gpu-memory">
                <Stack gap="sm">
                    {failureText ? <Notice tone="danger" message={failureText.text} detail={failureText.detail} testID="gpu-memory-error" /> : null}
                    {status?.applies && status.total_gb != null && status.gpu_gb != null ? (
                        <>
                            <Text role="caption" tone="secondary">{t('mobileApp.gpu.body', { total: gb(status.total_gb), gpu: gb(status.gpu_gb) })}</Text>
                            {status.cpu_gb != null ? (
                                <Row gap="sm" wrap testID="gpu-memory-split">
                                    <Text role="caption" tone="muted">{t('gpu.split.gpu', { gb: gb(status.gpu_gb) })}</Text>
                                    <Text role="caption" tone="muted">·</Text>
                                    <Text role="caption" tone="muted">{t('gpu.split.cpu', { gb: gb(status.cpu_gb) })}</Text>
                                </Row>
                            ) : null}
                            {status.method === 'apply' || status.revert?.available ? (
                                <>
                                    {status.method === 'apply' && presets.length > 0 && status.pending?.state !== 'restart_required' ? (
                                        <ChoiceList
                                            accessibilityLabel={t('gpu.presets.label')}
                                            options={options}
                                            value={target == null ? KEEP : String(target)}
                                            onChange={(v) => setChosen(v === KEEP ? null : Number(v))}
                                        />
                                    ) : null}
                                    <GpuChange status={status} target={target} />
                                </>
                            ) : (
                                <Notice tone="info" message={t('mobileApp.settings.pcOnly')} testID="gpu-memory-pc-only" />
                            )}
                        </>
                    ) : null}
                </Stack>
            </Disclosure>
        </SettingsAnchor>
    );
}
