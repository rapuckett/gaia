// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { formatSize, ltrIn } from '@webui/components/setup/format';
import { gpuGbAtSetting } from '@webui/components/setup/gpuMemory';
import type { GpuMemoryStatus } from '@webui/types';

import { GaiaApiError } from '@/api/errors';
import { useChangeGpuMemory } from '@/data';
import { ApproveOnPcNotice } from '@/features/devices/ApproveOnPcNotice';
import { useDevicePrompt } from '@/features/devices/devicePrompts';
import { describeHttpFailure, useLocaleCode, useT } from '@/i18n/useT';
import { Button, Notice, Stack } from '@/ui';
import { RotateCcw } from '@/ui/icons';

import { useConfirmSheet } from '../../../setup/sheets/ConfirmSheet';

type Outcome = { kind: 'applied'; gb: number | null } | { kind: 'denied' } | { kind: 'error'; text: string; detail?: string };

/**
 * Apply the picked GPU memory size, or undo GAIA's last change, from the phone. Both ask for administrator permission on the PC,
 * so the request stays open while someone answers there and `ApproveOnPcNotice` stands in for the button; the web UI's confirm comes first.
 */
export function GpuChange({ status, target }: { status: GpuMemoryStatus; target: number | null }) {
    const t = useT();
    const locale = useLocaleCode();
    const change = useChangeGpuMemory();
    const apply = useDevicePrompt({ kind: 'admin', action: 'gpuMemoryApply' });
    const revert = useDevicePrompt({ kind: 'admin', action: 'gpuMemoryRevert' });
    const { ask, sheet } = useConfirmSheet();
    const [outcome, setOutcome] = useState<Outcome | null>(null);

    const presets = status.presets ?? [];
    const preset = presets.find((p) => p.setting_gb === target) ?? null;
    const restartPending = status.pending?.state === 'restart_required';
    const canApply = !restartPending && status.method === 'apply' && presets.length > 0;
    const canRevert = !!status.revert?.available;
    const gb = (n: number) => ltrIn(locale, formatSize(n));

    const send = (which: 'apply' | 'revert') => {
        const prompt = which === 'apply' ? apply : revert;
        if (which === 'apply' && target == null) return;
        prompt.begin();
        setOutcome(null);
        change.mutate(which === 'apply' ? target : null, {
            onSuccess: (result) => {
                prompt.settle();
                setOutcome({ kind: 'applied', gb: result.pending ? gpuGbAtSetting(result, result.pending.setting_gb) : null });
            },
            onError: (err) => {
                if (prompt.report(err)) return;
                if (err instanceof GaiaApiError && err.status === 403) setOutcome({ kind: 'denied' });
                else setOutcome({ kind: 'error', ...describeHttpFailure(err, t) });
            },
        });
    };

    const onApply = async () => {
        const sure = await ask({
            title: preset ? t('gpu.consent.title', { gb: gb(preset.gpu_gb) }) : t('gpu.consent.titleAny'),
            body: [
                preset ? t('gpu.consent.body', { name: status.setting?.name ?? '', gb: gb(preset.gpu_gb) }) : t('gpu.consent.bodyAny', { name: status.setting?.name ?? '' }),
                t('gpu.consent.saved', { gb: gb(status.gpu_gb ?? 0) }),
            ],
            confirmLabel: t('setup.continue'),
            cancelLabel: t('setup.cancel'),
        });
        if (sure) send('apply');
    };

    const onRevert = async () => {
        const sure = await ask({ title: t('gpu.revert.title'), body: [t('gpu.revert.body')], confirmLabel: t('setup.continue'), cancelLabel: t('setup.cancel') });
        if (sure) send('revert');
    };

    // One change at a time on the PC: while either prompt is up or showing its outcome, neither button shows.
    const changing = apply.hideAction || revert.hideAction;
    const retry = outcome?.kind === 'denied' || status.pending?.state === 'not_applied';
    return (
        <Stack gap="sm" testID="gpu-change">
            {canApply && !changing ? (
                <Button
                    variant="primary"
                    full
                    label={t(retry ? 'gpu.tryAgain' : 'gpu.apply')}
                    busy={change.isPending && apply.state === 'idle'}
                    disabled={change.isPending || target == null}
                    onPress={() => void onApply()}
                    testID="gpu-apply"
                />
            ) : null}
            {canRevert && !changing ? (
                <Button
                    variant="secondary"
                    full
                    icon={RotateCcw}
                    label={t('gpu.undo')}
                    disabled={change.isPending}
                    onPress={() => void onRevert()}
                    testID="gpu-undo"
                />
            ) : null}
            <ApproveOnPcNotice kind="admin" action="gpuMemoryApply" onRetry={() => send('apply')} />
            <ApproveOnPcNotice kind="admin" action="gpuMemoryRevert" onRetry={() => send('revert')} />
            {outcome?.kind === 'applied' ? (
                <Notice
                    tone="success"
                    role="status"
                    message={outcome.gb == null ? t('gpu.appliedAny') : t('gpu.applied', { gb: gb(outcome.gb) })}
                    testID="gpu-applied"
                />
            ) : null}
            {outcome?.kind === 'denied' ? <Notice tone="warning" message={t('gpu.denied')} testID="gpu-denied" /> : null}
            {outcome?.kind === 'error' ? <Notice tone="danger" message={outcome.text} detail={outcome.detail} testID="gpu-error" /> : null}
            {sheet}
        </Stack>
    );
}
