// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { CONFIRM_CANCEL_BYTES } from '@webui/components/setup/downloadModel';
import { formatBytes, formatEta, formatSize, formatSpeed, ltrIn } from '@webui/components/setup/format';
import { canCreateImages, catalogOf, isOptional, overallFromPlan } from '@webui/components/setup/selection';
import { extrasLeft as extrasLeftIds } from '@webui/components/setup/setupExtras.core';
import type { MessageKey } from '@webui/i18n/registry';
import type { SetupModelProgress } from '@webui/types';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

import {
    useCancelSetup,
    useDownloadSetupModel,
    useRedownloadSetupModel,
    useSetupPlan,
    useSetupStatus,
    useSkipSetupModel,
    useStartSetup,
} from '@/data';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { Button, Card, Ltr, Notice, ProgressLine, Row, Spinner, Stack, Text } from '@/ui';

import { useFlushQueuedModels, useQueuedModels } from '../optionalModels';
import { SetupFooter } from '../SetupFooter';
import type { SetupStepContext } from '../SetupScreen';
import { useConfirmSheet } from '../sheets/ConfirmSheet';
import { redownloadRequest, serverConfirmRequest, setupConfirmFrom } from '../sheets/setupConfirm';
import { SetupLogs } from '../sheets/SetupLogs';
import { Details, DownloadContents, ModelRow } from './DownloadRows';
import { downloadView, milestones } from './downloadState';
import { lostContactText } from './lostContactText';
import { useDownloadEstimates } from './useDownloadEstimates';

/** The third step: everything coming to this PC, each model's progress, and what to do when one fails. */
export function DownloadStep({ ctx }: { ctx: SetupStepContext }) {
    const t = useT();
    const status = useSetupStatus();
    const planQuery = useSetupPlan();
    const cancel = useCancelSetup();
    const download = useDownloadSetupModel();
    const skip = useSkipSetupModel();
    const redownload = useRedownloadSetupModel();
    const start = useStartSetup();
    const { ask, sheet } = useConfirmSheet();
    const queued = useQueuedModels((s) => s.ids);
    const toggleQueued = useQueuedModels((s) => s.toggle);
    const flushError = useFlushQueuedModels(ctx.run);

    const plan = ctx.plan;
    const view = useMemo(() => downloadView(ctx.run, plan), [ctx.run, plan]);
    const [actionError, setActionError] = useState<unknown>(null);
    const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
    const lost = status.isError ? lostContactText(t, status.error) : null;
    const busy = [cancel, download, skip, redownload, start].some((m) => m.isPending) || lost != null;

    const rows = useMemo(() => (view?.rows ?? []).filter((m) => !skipped.has(m.id)), [view, skipped]);
    const checking = view?.run.state === 'verifying' || (view?.run.state !== 'running' && rows.some((m) => m.state === 'verifying'));
    const overall = useMemo(() => (view ? overallFromPlan(view.run, plan ?? null) : undefined), [view, plan]);
    const { estimates, overallEstimate, now, checkingSeconds } = useDownloadEstimates(rows, overall, checking);

    const names: Record<string, string> = {};
    for (const e of plan?.catalog ?? []) names[e.id] = e.name;

    // Milestones only, never the per-second percent.
    const seen = useRef<{ states: Map<string, SetupModelProgress['state']>; quarter: number } | null>(null);
    const percent = view?.percent ?? 0;
    useEffect(() => {
        const before = seen.current;
        seen.current = { states: new Map(rows.map((m) => [m.id, m.state])), quarter: Math.floor(percent / 25) };
        if (!before) return;
        const { said, failed } = milestones(before, rows, percent, names, t);
        for (const line of [...failed, ...(said.length ? [said.join('. ')] : [])]) AccessibilityInfo.announceForAccessibility(line);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- names and t only word the lines
    }, [view?.run.models, percent]);

    const act = async (fn: () => Promise<unknown>) => {
        setActionError(null);
        try {
            await fn();
        } catch (err) {
            setActionError(err);
        }
    };

    const startRun = async (acknowledgeLowDisk = false): Promise<void> => {
        try {
            await start.mutateAsync({ options: acknowledgeLowDisk ? { acknowledgeLowDisk } : {} });
            ctx.startedRun();
        } catch (err) {
            const detail = setupConfirmFrom(err);
            if (!detail) throw err;
            if (await ask(serverConfirmRequest(detail, t))) await startRun(true);
        }
    };

    const downloadOne = async (modelId: string, acknowledgeLowDisk = false): Promise<void> => {
        try {
            await download.mutateAsync({ modelId, acknowledgeLowDisk });
        } catch (err) {
            const detail = setupConfirmFrom(err);
            if (!detail) throw err;
            if (await ask(serverConfirmRequest(detail, t))) await downloadOne(modelId, true);
        }
    };

    const retryModel = (m: SetupModelProgress) =>
        act(async () => {
            if (m.error_kind === 'verify') {
                const name = names[m.id] ?? m.id;
                const confirmed = await ask(redownloadRequest(name, m.bytes_total, t));
                if (!confirmed) return;
                try {
                    await redownload.mutateAsync(m.id);
                } catch (err) {
                    const detail = setupConfirmFrom(err);
                    if (!detail) throw err;
                    if (await ask(serverConfirmRequest(detail, t))) await downloadOne(m.id, true);
                }
                return;
            }
            if (m.error_kind === 'disk_full') void planQuery.refetch();
            await downloadOne(m.id);
        });

    const resumeModel = (m: SetupModelProgress) => act(() => downloadOne(m.id));

    const skipModel = (m: SetupModelProgress) =>
        act(async () => {
            await skip.mutateAsync({ modelId: m.id });
            setSkipped((s) => new Set(s).add(m.id));
        });

    // Stopped with only optional extras left: skip them, then check the rest.
    const finishWithoutExtras = (ids: string[]) =>
        act(async () => {
            for (const id of ids) {
                await skip.mutateAsync({ modelId: id });
                setSkipped((s) => new Set(s).add(id));
            }
            await startRun();
        });

    const stop = () =>
        act(async () => {
            if ((view?.bytesDone ?? 0) > CONFIRM_CANCEL_BYTES) {
                const confirmed = await ask({
                    title: t('setup.progress.cancelTitle'),
                    body: [t('setup.progress.cancelBody')],
                    confirmLabel: t('setup.progress.cancelConfirm'),
                    cancelLabel: t('setup.progress.cancelKeep'),
                });
                if (!confirmed) return;
            }
            await cancel.mutateAsync();
        });

    const restart = () =>
        act(async () => {
            await cancel.mutateAsync();
            await startRun();
        });

    const run = view?.run ?? null;
    const failedRow = rows.some((m) => m.state === 'failed' || m.state === 'cancelled');
    const stoppedEarly = !!view && view.runFailed && !view.downloadDone && !view.componentFailed && !failedRow;
    const stoppedBeforeCheck = !!view && view.downloadDone && !view.componentFailed;
    const stoppedNote = stoppedBeforeCheck && run?.state === 'failed' && !run.model_failed && !run.problem;

    const isExtra = (id: string) => queued.includes(id) || !!plan?.catalog?.some((e) => e.id === id && isOptional(e));
    const extras = view ? extrasLeftIds(view.run, view.active, isExtra).filter((id) => !skipped.has(id)) : [];
    const extrasNote = extras.length > 0 && !view?.componentFailed;
    const finishWithout = extrasNote ? (
        <Button label={t('setup.download.finishWithoutExtras')} disabled={busy} onPress={() => void finishWithoutExtras(extras)} testID="download-finish-without-extras" />
    ) : null;

    let footer: ReactNode = null;
    if (lost) {
        footer = <Button label={t('setup.reconnect')} variant="primary" busy={status.isFetching} onPress={() => void status.refetch()} />;
    } else if (view?.active) {
        footer = <Button label={t('setup.progress.cancel')} disabled={busy} onPress={() => void stop()} testID="download-stop" />;
    } else if (view && view.cancelled.length > 0) {
        footer = (
            <>
                {finishWithout}
                <Button label={t('setup.progress.resumeAll')} variant="primary" busy={start.isPending} disabled={busy} onPress={() => void act(() => startRun())} />
            </>
        );
    } else if (stoppedBeforeCheck) {
        footer = <Button label={t('setup.finish')} variant="primary" busy={start.isPending} disabled={busy} onPress={() => void act(() => startRun())} />;
    } else if (stoppedEarly) {
        footer = <Button label={t('setup.tryAgain')} variant="primary" busy={start.isPending} disabled={busy} onPress={() => void act(() => startRun())} />;
    } else if (finishWithout) {
        footer = finishWithout;
    }

    const chat = plan?.chat_model ? catalogOf(plan).find((e) => e.id === (run?.chat_model ?? plan.chat_model.id)) : undefined;
    const inRun = new Set((run?.models ?? []).map((m) => m.id));
    const optional = plan
        ? catalogOf(plan).filter(
              (e) => isOptional(e) && !e.downloaded && !inRun.has(e.id) && (canCreateImages(chat) || !e.roles.includes('image_creation')),
          )
        : [];

    const overallLine = view
        ? t.compose((say) =>
              [
                  say('setup.progress.overallPct', { n: String(view.percent) }),
                  overall && overall.bytes_total > 0
                      ? say('setup.progress.of', { done: formatBytes(overall.bytes_done), total: formatBytes(overall.bytes_total) })
                      : null,
                  view.active && overallEstimate?.speed ? ltrIn(t.locale, formatSpeed(overallEstimate.speed)) : null,
                  view.active
                      ? overallEstimate?.eta != null
                          ? say('setup.progress.left', { eta: formatEta(overallEstimate.eta, say) })
                          : say('setup.progress.estimating')
                      : null,
                  view.failedCount > 0 ? say('setup.progress.failedCount', { n: String(view.failedCount) }) : null,
              ]
                  .filter(Boolean)
                  .join(' · '),
          )
        : '';

    const failure = actionError != null ? describeHttpFailure(actionError, t) : flushError ? describeHttpFailure(flushError, t) : null;
    const stoppedLead: MessageKey = run?.problem ? (run.problem.kind === 'server_too_old' ? 'setup.server.tooOld' : 'setup.server.unreachable') : 'setup.stopped';

    return (
        <Stack gap="md">
            <Text role="title" weight="semibold" accessibilityRole="header">{t('setup.download.title')}</Text>
            <Text tone="secondary">{t('setup.download.lede')}</Text>

            {!view ? (
                <Row gap="sm" align="center">
                    <Spinner />
                    <Text role="caption" tone="secondary" accessibilityRole="summary">{t('setup.download.starting')}</Text>
                </Row>
            ) : (
                <>
                    {plan ? <DownloadContents plan={plan} run={view.run} onRetry={() => void act(() => startRun())} busy={busy} /> : null}
                    {rows.length > 0 ? (
                        <Stack gap="md">
                            <ProgressLine value={view.percent / 100} label={overallLine} />
                            <Card>
                                <Stack gap="lg">
                                    {rows.map((m) => (
                                        <ModelRow
                                            key={m.id}
                                            model={m}
                                            name={names[m.id] ?? m.id}
                                            estimate={estimates[m.id]}
                                            now={now}
                                            freeGb={plan?.disk?.free_gb ?? null}
                                            checking={checking}
                                            checkingFor={checkingSeconds(m.id)}
                                            retryLater={view.retryLater}
                                            idle={!view.active}
                                            busy={busy}
                                            onRetry={(row) => void retryModel(row)}
                                            onResume={(row) => void resumeModel(row)}
                                            onSkip={(row) => void skipModel(row)}
                                            onRestart={() => void restart()}
                                        />
                                    ))}
                                </Stack>
                            </Card>
                            {view.active ? <Text role="caption" tone="secondary">{t('setup.progress.keepsGoing')}</Text> : null}
                        </Stack>
                    ) : view.active ? (
                        <Row gap="sm" align="center">
                            <Spinner />
                            <Text role="caption" tone="secondary" accessibilityRole="summary">{t('setup.download.working')}</Text>
                        </Row>
                    ) : null}
                </>
            )}

            {optional.length > 0 ? (
                <Card accessibilityLabel={t('setup.optional.title')} testID="download-optional">
                    <Stack gap="sm">
                        <Text weight="semibold" accessibilityRole="header">{t('setup.optional.title')}</Text>
                        <Text role="caption" tone="secondary">{t('setup.optional.lede')}</Text>
                        {optional.map((e) => {
                            const added = queued.includes(e.id);
                            return (
                                <Row key={e.id} gap="sm" align="center" justify="between">
                                    <Stack flex={1} gap="xs">
                                        <Text>{t(`setup.purpose.${e.roles[0]}` as MessageKey)}</Text>
                                        <Ltr>{e.size_gb != null ? formatSize(e.size_gb) : t('setup.contents.sizeOnDownload')}</Ltr>
                                    </Stack>
                                    <Button
                                        label={added ? t('setup.optional.added') : t('setup.optional.add')}
                                        variant={added ? 'primary' : 'secondary'}
                                        size="sm"
                                        shrink={false}
                                        onPress={() => toggleQueued(e.id)}
                                    />
                                </Row>
                            );
                        })}
                    </Stack>
                </Card>
            ) : null}

            {lost ? <Notice tone="danger" message={lost.text} detail={lost.detail} /> : null}

            {stoppedEarly || stoppedNote ? (
                <Stack gap="xs">
                    <Notice tone="danger" message={t(stoppedEarly ? stoppedLead : 'setup.download.stoppedBeforeCheck')} />
                    {(run?.problem?.message ?? run?.error) ? <Details text={(run?.problem?.message ?? run?.error)!} /> : null}
                </Stack>
            ) : null}
            {stoppedBeforeCheck ? <Text role="caption" tone="secondary">{t('setup.download.finishNote')}</Text> : null}
            {extrasNote ? (
                <Text role="caption" tone="secondary">
                    {t('setup.download.extrasLeftNote', { names: extras.map((id) => names[id] ?? id).join(', ') })}
                </Text>
            ) : null}

            {failure ? <Notice tone="danger" message={failure.text} detail={failure.detail} /> : null}
            {run ? <SetupLogs run={run} failed={!!view?.runFailed || rows.some((m) => m.state === 'failed')} /> : null}
            {footer ? <SetupFooter>{footer}</SetupFooter> : null}
            {sheet}
        </Stack>
    );
}
