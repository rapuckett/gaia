// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState, type ReactNode } from 'react';

import { isolate } from '@webui/i18n/registry';
import type { SystemStatus } from '@webui/types';
import { isServerDown } from '@webui/utils/serverDown';

import { GaiaApiError } from '@/api/errors';
import { useModelActions, useSystemStatus } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import { Button, Card, Disclosure, Divider, Ltr, Notice, ProgressLine, Row, Sheet, Spinner, Stack, Text } from '@/ui';

import { SettingsAnchor } from '../targets';
import { capabilitiesText, needsLocalSetup, needText, statusFlags } from './advanced/statusText';

/** Settings > Advanced: the PC's status and model actions, then the logs card; the server controls go in the slot. */
export default function Advanced() {
    return (
        <SettingsAnchor name="pane">
            <Stack gap="lg" paddingX="lg" paddingY="md">
                <StatusCard />
                <LogsCard />
                <ServerControlsSlot />
            </Stack>
        </SettingsAnchor>
    );
}

/** Where set-adv-server (the model server's controls) goes. */
export function ServerControlsSlot(): ReactNode {
    return null;
}

function StatusRow({ label, value, ok, hint }: { label: string; value: ReactNode; ok: boolean; hint?: string }) {
    return (
        <Stack gap="xs">
            <Row gap="md" align="start">
                <Stack flex={1}>
                    <Text role="label" tone="secondary">{label}</Text>
                </Stack>
                <Stack flex={1} align="end">
                    <Text role="label" weight="medium" tone={ok ? 'success' : 'warning'} align="end">{value}</Text>
                </Stack>
            </Row>
            {hint ? <Text role="caption" tone="muted">{hint}</Text> : null}
        </Stack>
    );
}

/** A raw error or log line, one tap away and kept left to right. */
function RawDetails({ text }: { text: string }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    return (
        <Disclosure title={t('settings.errors.details')} open={open} onToggle={() => setOpen((v) => !v)}>
            <Text role="caption" tone="muted" selectable><Ltr>{text}</Ltr></Text>
        </Disclosure>
    );
}

/** An action's failure in plain words; a refusal from the PC says to do it there, and the raw text stays behind Details. */
function ActionError({ error }: { error: unknown }) {
    const t = useT();
    if (error instanceof GaiaApiError && error.status === 403) {
        return <Notice tone="info" message={t('mobileApp.settings.pcOnly')} testID="advanced-pc-only" />;
    }
    const raw = describeError(error, t);
    return (
        <Stack gap="sm">
            <Notice tone="danger" message={isServerDown(raw) ? t('settings.errors.serverDown') : t('mobileApp.settings.modelActionFailed')} />
            <RawDetails text={raw} />
        </Stack>
    );
}

function StatusCard() {
    const t = useT();
    const query = useSystemStatus();
    const status = query.data;
    const modelName = status ? status.default_model_name : null;
    const actions = useModelActions(modelName, status);
    const [detailsOpen, setDetailsOpen] = useState(false);

    return (
        <Card padding="lg" testID="advanced-status">
            <Stack gap="md">
                <Text role="title" accessibilityRole="header">{t('settings.advanced.status')}</Text>
                {query.isPending ? (
                    <Row gap="sm">
                        <Spinner />
                        <Text role="label" tone="muted">{t('settings.advanced.checking')}</Text>
                    </Row>
                ) : !status ? (
                    <Stack gap="sm">
                        <Notice
                            tone="warning"
                            message={t('settings.advanced.unreachable')}
                            action={{ label: t('settings.key.checkAgain'), onPress: () => void query.refetch() }}
                            testID="advanced-unreachable"
                        />
                        <RawDetails text={describeError(query.error, t)} />
                    </Stack>
                ) : (
                    <StatusBody
                        status={status}
                        modelName={modelName}
                        actions={actions}
                        detailsOpen={detailsOpen}
                        onToggleDetails={() => setDetailsOpen((v) => !v)}
                    />
                )}
            </Stack>
        </Card>
    );
}

function StatusBody({ status, modelName, actions, detailsOpen, onToggleDetails }: {
    status: SystemStatus;
    modelName: string | null;
    actions: ReturnType<typeof useModelActions>;
    detailsOpen: boolean;
    onToggleDetails: () => void;
}) {
    const t = useT();
    const { cloud, wrongModel, smallContext, notDownloaded } = statusFlags(status);
    const needsLoad = (wrongModel || smallContext) && modelName !== null;
    const setupNeeded = needsLocalSetup(status);
    const downloading = actions.pending === 'download';
    const progress = status.download_progress;
    const downloadActive = progress?.state === 'starting' || progress?.state === 'downloading';
    const name = modelName ?? '';

    const serverHint = status.lemonade_running
        ? undefined
        : setupNeeded
          ? t('settings.advanced.notInstalledHint')
          : status.start_instruction && !/gaia init/i.test(status.start_instruction)
            ? status.start_instruction
            : t('settings.advanced.notRunningHint');
    const serverValue = status.lemonade_running
        ? status.lemonade_version
            ? t.bare('settings.advanced.runningAt', { version: isolate(status.lemonade_version, 'ltr') })
            : t.bare('settings.advanced.running')
        : setupNeeded
          ? t.bare('settings.advanced.notInstalled')
          : status.lemonade_error
            ? t.bare('settings.advanced.unavailable')
            : t.bare('settings.advanced.notRunning');

    const disk = status.disk_space_gb;
    const memory = status.memory_available_gb;

    return (
        <Stack gap="md">
            <Stack gap="md">
                <StatusRow label={t('settings.advanced.modelServer')} value={serverValue} ok={status.lemonade_running} hint={serverHint} />
                {!status.lemonade_running && status.lemonade_error ? (
                    <RawDetails text={status.lemonade_error} />
                ) : null}
                {setupNeeded ? <Notice tone="info" message={t('mobileApp.settings.pcOnly')} testID="advanced-setup-pc-only" /> : null}
                <Divider />
                <StatusRow
                    label={t('settings.section.model')}
                    value={status.model_loaded ? <Ltr>{status.model_loaded}</Ltr> : t.bare('settings.advanced.noneLoaded')}
                    ok={!!status.model_loaded && (cloud || status.expected_model_loaded !== false)}
                    hint={
                        !status.model_loaded
                            ? t('settings.advanced.loadsFirst')
                            : !cloud && status.expected_model_loaded === false
                              ? t('settings.advanced.expected', { name: isolate(name, 'ltr') })
                              : undefined
                    }
                />
                <Divider />
                <StatusRow
                    label={t('settings.advanced.disk')}
                    value={<Ltr>{`${disk} GB`}</Ltr>}
                    ok={disk > 5}
                    hint={
                        !status.model_loaded && disk < 30
                            ? t('settings.advanced.diskLow', { need: needText(status), size: isolate(`${disk} GB`, 'ltr') })
                            : undefined
                    }
                />
            </Stack>

            {notDownloaded ? (
                <Stack gap="sm">
                    <Divider />
                    <Text role="label" weight="semibold">{t('settings.advanced.notDownloaded')}</Text>
                    <Text role="caption" tone="muted">{t('settings.advanced.notDownloadedHint', { name: isolate(name, 'ltr'), need: needText(status) })}</Text>
                    <Button
                        label={downloading ? t('settings.advanced.downloading') : t('settings.model.download')}
                        variant="primary"
                        full
                        busy={downloading}
                        disabled={downloading}
                        onPress={() => void actions.download(false)}
                        testID="advanced-download"
                    />
                </Stack>
            ) : null}
            {downloading && downloadActive && progress ? (
                <ProgressLine value={progress.percent / 100} label={`${Math.round(progress.percent)}%`} />
            ) : null}

            {needsLoad ? (
                <Stack gap="sm">
                    <Divider />
                    <Text role="label" weight="semibold">{wrongModel ? t('settings.advanced.wrongModel') : t('settings.advanced.smallContext')}</Text>
                    <Text role="caption" tone="muted">{t('settings.advanced.loadHint', { name: isolate(name, 'ltr') })}</Text>
                    <Button
                        label={actions.pending === 'load' ? t('settings.advanced.loading') : t('settings.advanced.load')}
                        variant="primary"
                        full
                        busy={actions.pending === 'load'}
                        disabled={actions.pending === 'load'}
                        onPress={() => void actions.load()}
                        testID="advanced-load"
                    />
                </Stack>
            ) : null}

            {actions.error ? <ActionError error={actions.error} /> : null}

            <Disclosure title={t('settings.advanced.details')} open={detailsOpen} onToggle={onToggleDetails}>
                <Stack gap="md">
                    {status.model_size_gb != null ? (
                        <StatusRow label={t('settings.advanced.modelSize')} value={<Ltr>{`${status.model_size_gb} GB`}</Ltr>} ok />
                    ) : null}
                    {status.model_device && !cloud ? (
                        <StatusRow label={t('settings.advanced.device')} value={<Ltr>{status.model_device.toUpperCase()}</Ltr>} ok={status.model_device !== 'cpu'} />
                    ) : null}
                    {status.model_context_size != null ? (
                        <StatusRow
                            label={t('settings.advanced.context')}
                            value={t.bare('settings.ctx.tokens', { size: isolate(`${(status.model_context_size / 1024).toFixed(0)}K`, 'ltr') })}
                            ok={status.context_size_sufficient}
                        />
                    ) : null}
                    {status.model_labels && status.model_labels.length > 0 ? (
                        <StatusRow label={t('settings.advanced.capabilities')} value={capabilitiesText(t, status.model_labels)} ok />
                    ) : null}
                    <StatusRow
                        label={t('settings.advanced.embedding')}
                        value={status.embedding_model_loaded ? t.bare('settings.advanced.available') : t.bare('settings.advanced.notLoaded')}
                        ok={status.embedding_model_loaded}
                    />
                    {status.gpu_name ? (
                        <StatusRow
                            label={t.bare('resources.gpu')}
                            value={<Ltr>{`${status.gpu_name}${status.gpu_vram_gb ? ` (${status.gpu_vram_gb.toFixed(1)} GB)` : ''}`}</Ltr>}
                            ok
                        />
                    ) : null}
                    <StatusRow
                        label={t('settings.advanced.memory')}
                        value={memory != null ? <Ltr>{`${memory} GB`}</Ltr> : t.bare('settings.advanced.unknown')}
                        ok={memory != null && memory > 2}
                    />
                    {status.processor_name ? <StatusRow label={t('settings.advanced.processor')} value={<Ltr>{status.processor_name}</Ltr>} ok /> : null}
                    {status.lemonade_running && modelName !== null && !cloud ? (
                        <Row gap="md">
                            <Stack flex={1}>
                                <Text role="caption" tone="muted">{t('settings.advanced.corrupted')}</Text>
                            </Stack>
                            <Button
                                label={downloading ? t.bare('settings.advanced.downloading') : t.bare('settings.advanced.redownload')}
                                accessibilityLabel={downloading ? t('settings.advanced.downloading') : t('settings.advanced.redownload')}
                                variant="secondary"
                                size="sm"
                                busy={downloading}
                                disabled={downloading}
                                onPress={() => void actions.download(true)}
                                testID="advanced-redownload"
                            />
                        </Row>
                    ) : null}
                </Stack>
            </Disclosure>

            <Sheet
                open={actions.loadBlocked !== null}
                onClose={actions.dismissLoadBlocked}
                title={t('settings.advanced.load')}
                footer={
                    <Stack gap="sm">
                        <Button
                            label={t('mobileApp.settings.loadAnywayButton')}
                            variant="danger"
                            full
                            onPress={() => {
                                actions.dismissLoadBlocked();
                                void actions.load(true);
                            }}
                        />
                        <Button label={t('settings.key.cancel')} variant="secondary" full onPress={actions.dismissLoadBlocked} />
                    </Stack>
                }
            >
                <Text role="body">{t('mobileApp.settings.loadAnyway', { name: isolate(name, 'ltr') })}</Text>
            </Sheet>
        </Stack>
    );
}

/** The logs and the report that bundles them are the PC's alone to read, so a phone gets the pointer to the PC. */
function LogsCard() {
    const t = useT();
    return (
        <Card padding="lg" testID="advanced-logs">
            <Stack gap="md">
                <Text role="title" accessibilityRole="header">{t('logs.title')}</Text>
                <Text role="caption" tone="muted">{t('logs.settingsHint')}</Text>
                <Notice tone="info" message={t('setup.logs.reportOnPc')} testID="advanced-logs-pc-only" />
            </Stack>
        </Card>
    );
}
