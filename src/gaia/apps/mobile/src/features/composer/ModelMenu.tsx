// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { isDownloading, modelState } from '@webui/components/modelMeta';
import { isolate } from '@webui/i18n/registry';

import { needsCloudConsent } from '@webui/utils/cloudConsent.core';
import { providerName, providerNotice } from '@webui/utils/providerText';

import type { ProviderModel } from '@webui/types';
import { useActiveModel, useDownloadModel, useProviderModels, useProviders, useSelectModel, type ProviderRow } from '@/data';
import { openSettings } from '@/features/settings/openSettings';
import { describeHttpFailure, technicalDetail, useT, type Translate } from '@/i18n/useT';
import { Button, Divider, Icon, IconButton, ListRow, Ltr, Notice, Row, Sheet, Spinner, Stack, StatusDot, Text } from '@/ui';
import { Check, Download, Info, KeyRound } from '@/ui/icons';

import { missedPoll, newStartWatch } from './downloadStart.core';
import { modelDetails } from './modelDetails';

/** The id without its provider prefix or catalogue path, when the PC gave no friendly name. */
export function modelLabel(m: Pick<ProviderModel, 'id' | 'display_name'>): string {
    return m.display_name || m.id.slice(m.id.lastIndexOf('/') + 1);
}

const ICON_BOX = 16;

/** One cloud provider's models; Local only holds them all off, so none can be picked. */
function CloudGroup({ provider, open, row }: { provider: ProviderRow; open: boolean; row: (m: ProviderModel, provider: ProviderRow) => ReactElement }) {
    const t = useT();
    const list = useProviderModels(provider.blocked ? undefined : provider.id, open);
    const blocked = provider.blocked || !!list.data?.blocked;
    const models = (list.data?.models ?? []).filter((m) => m.available !== false);
    return (
        <Stack gap="xs" testID={`model-group-${provider.id}`}>
            <Text role="label" weight="semibold" tone="secondary">
                {providerName(t, provider)}
            </Text>
            {blocked ? (
                <Text role="caption" tone="danger" testID={`model-blocked-${provider.id}`}>
                    {t('settings.privacy.localOnlyBlocked')}
                </Text>
            ) : list.isError ? (
                <Notice tone="danger" message={describeHttpFailure(list.error, t).text} detail={describeHttpFailure(list.error, t).detail} />
            ) : list.isSuccess && models.length === 0 ? (
                <Text role="caption" tone="secondary">
                    {t('modelMenu.noModels')}
                </Text>
            ) : (
                models.map((m) => row(m, provider))
            )}
        </Stack>
    );
}

const sameModel = (a: string | null | undefined, b: string | null | undefined) =>
    !!a && !!b && a.toLowerCase().replace(/^user\./, '') === b.toLowerCase().replace(/^user\./, '');

export interface SwitchNotice {
    message: string;
    /** The PC's own words, shown on their own line. */
    detail?: string;
}

/** The sentence names the model; the PC's reason goes on its own line. */
export function switchAfterFailed(model: string, err: unknown, t: Translate): SwitchNotice {
    return { message: t('mobileApp.error.switchAfterDownloadFailed', { model: isolate(model, 'ltr') }), detail: technicalDetail(err) };
}

export interface ModelMenuProps {
    open: boolean;
    onClose: () => void;
    /** A reply is running: a model picked now is used from the next message. */
    turnRunning: boolean;
    /** The model picked while a reply ran. */
    queued: string | null;
    onQueue: (model: string | null) => void;
    /** Why the switch after a download failed; the chip shows a warning while it is set. */
    switchError: SwitchNotice | null;
    onSwitchError: (message: string | null, detail?: string) => void;
    /** Starts with this row's facts open (developer gallery). */
    initialInfoRow?: string;
    /** Shows this row as being switched to (developer gallery). */
    forceSwitching?: string;
}

/** Switch the model, download one that isn't on the PC, or see what only the PC can do. */
export function ModelMenu({ open, onClose, turnRunning, queued, onQueue, switchError, onSwitchError, initialInfoRow, forceSwitching }: ModelMenuProps) {
    const t = useT();
    const active = useActiveModel().data;
    const local = useProviderModels('local', open);
    const providers = useProviders().data?.providers;
    const select = useSelectModel();
    const download = useDownloadModel();
    const [error, setError] = useState<{ text: string; detail?: string } | null>(null);
    const [askDownload, setAskDownload] = useState<ProviderModel | null>(null);
    // A cloud model picked from a local one waits here on its provider's privacy notice.
    const [askCloud, setAskCloud] = useState<{ model: string; provider: ProviderRow } | null>(null);
    // The row whose facts are open; a phone has no hover, so each row has an info button.
    const [infoRow, setInfoRow] = useState<string | null>(initialInfoRow ?? null);
    const pickAfterDownload = useRef<string | null>(null);
    const startWatch = useRef(newStartWatch());
    const [wasOpen, setWasOpen] = useState(open);
    const current = queued ?? active?.model;
    const switchingTo = select.isPending ? select.variables : forceSwitching;

    // A fresh open starts clean; reset while rendering, not in an effect.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setError(null);
            setAskDownload(null);
            setAskCloud(null);
            setInfoRow(initialInfoRow ?? null);
        }
    }

    // Nothing switches to the cloud until "Use {model}" under its notice is pressed.
    const chooseCloud = (model: string, provider: ProviderRow) => {
        if (needsCloudConsent(provider, active, model, askCloud?.model)) {
            setAskDownload(null);
            setAskCloud({ model, provider });
            return;
        }
        setAskCloud(null);
        choose(model);
    };

    const choose = (model: string, afterDownload?: string) => {
        setError(null);
        if (turnRunning) {
            onQueue(sameModel(model, active?.model) ? null : model);
            onClose();
            return;
        }
        select.mutate(model, {
            onSuccess: onClose,
            onError: (err) => {
                if (afterDownload) {
                    const failed = switchAfterFailed(afterDownload, err, t);
                    onSwitchError(failed.message, failed.detail);
                }
                else setError(describeHttpFailure(err, t));
            },
        });
    };

    // A model picked before it was on the PC is switched to once its download ends.
    const models = local.data?.models;
    useEffect(() => {
        // Until the request answers, the row still reads "not downloaded".
        if (!pickAfterDownload.current || !models || download.isPending) return;
        const picked = pickAfterDownload.current;
        const m = models.find((x) => x.id === picked);
        if (!m) {
            pickAfterDownload.current = null;
            onSwitchError(t('modelMenu.modelGone', { model: picked }));
            return;
        }
        if (isDownloading(m)) {
            startWatch.current.polls = 0;
            return;
        }
        if (m.download_progress?.state === 'error') {
            pickAfterDownload.current = null;
            onSwitchError(t('mobileApp.model.downloadFailedShort', { model: isolate(modelLabel(m), 'ltr') }), m.download_progress.message || undefined);
        } else if (m.download_progress?.state === 'complete' || modelState(m) !== 'not_downloaded') {
            pickAfterDownload.current = null;
            onSwitchError(null);
            choose(m.id, modelLabel(m));
        } else if (missedPoll(startWatch.current, local.dataUpdatedAt)) {
            pickAfterDownload.current = null;
            onSwitchError(t('modelMenu.downloadNeverStarted', { name: modelLabel(m) }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [models, local.dataUpdatedAt, download.isPending]);

    const startDownload = (m: ProviderModel, pick: boolean) => {
        setAskDownload(null);
        setError(null);
        onSwitchError(null);
        if (pick) {
            pickAfterDownload.current = m.id;
            startWatch.current = newStartWatch();
        }
        download.mutate(m.id, {
            onError: (err) => {
                pickAfterDownload.current = null;
                setError(describeHttpFailure(err, t));
            },
        });
    };

    const row = (m: ProviderModel, cloudProvider?: ProviderRow) => {
        const remote = !!cloudProvider;
        const state = modelState(m);
        const downloading = isDownloading(m);
        const needsDownload = !remote && state === 'not_downloaded' && !sameModel(current, m.id);
        const name = modelLabel(m);
        const switching = sameModel(switchingTo, m.id);
        let trailing;
        if (downloading) {
            trailing = (
                <Row gap="xs">
                    <Spinner size="sm" />
                    <Text role="caption" tone="secondary">{`${Math.round(m.download_progress?.percent ?? 0)}%`}</Text>
                </Row>
            );
        } else if (!remote && needsDownload) {
            trailing = <Icon icon={Download} size="sm" tone="secondary" label={t('modelMenu.downloadModel', { name })} />;
        } else if (!remote && state === 'loaded') {
            trailing = <StatusDot tone="success" solid label={t('modelStatus.state.loaded')} />;
        } else if (!remote) {
            trailing = (
                <Text role="caption" tone="secondary">
                    {t('modelMenu.ready')}
                </Text>
            );
        }
        return (
            <Stack key={`${remote ? 'cloud' : 'local'}:${m.id}`} gap="xs">
                <Row gap="xs" align="center">
                    <View style={{ flex: 1 }}>
                <ListRow
                    title={name}
                    subtitle={!remote && m.size_gb ? `${m.size_gb} GB` : undefined}
                    leading={
                        <View style={{ width: ICON_BOX, height: ICON_BOX, alignItems: 'center', justifyContent: 'center' }}>
                            {switching ? <Spinner size="sm" /> : sameModel(current, m.id) ? <Icon icon={Check} size="sm" tone="accent" /> : null}
                        </View>
                    }
                    trailing={trailing}
                    selected={sameModel(current, m.id)}
                    onPress={
                        downloading || select.isPending
                            ? undefined
                            : () => {
                                  pickAfterDownload.current = null;
                                  if (cloudProvider) chooseCloud(m.id, cloudProvider);
                                  else if (needsDownload) {
                                      setAskCloud(null);
                                      setAskDownload(m);
                                  } else choose(m.id);
                              }
                    }
                    testID={`model-row-${m.id}`}
                />
                    </View>
                    <IconButton
                        icon={Info}
                        size="sm"
                        label={t('modelMenu.about', { name })}
                        onPress={() => setInfoRow(infoRow === m.id ? null : m.id)}
                        testID={`model-info-${m.id}`}
                    />
                </Row>
                {infoRow === m.id ? (
                    <Stack gap="xs" paddingX="md" testID={`model-facts-${m.id}`}>
                        {modelDetails(m, remote, t).map((d) => (
                            <Text key={d} role="caption" tone="secondary">
                                {d}
                            </Text>
                        ))}
                        {m.placement?.warning ? (
                            <Text role="caption" tone="warning">
                                {m.placement.warning}
                            </Text>
                        ) : null}
                        <Text role="caption" tone="muted">
                            <Ltr>{m.id}</Ltr>
                        </Text>
                    </Stack>
                ) : null}
                {askDownload?.id === m.id ? (
                    <Notice
                        tone="info"
                        message={`${
                            m.size_gb
                                ? t('modelMenu.downloadConfirm', {
                                      name,
                                      size: `${m.size_gb} GB`,
                                  })
                                : t('modelMenu.downloadConfirmNoSize', { name })
                        } ${t('modelMenu.switchWhenDone')}`}
                        action={{
                            label: t('modelMenu.download'),
                            onPress: () => startDownload(m, true),
                        }}
                        onDismiss={() => setAskDownload(null)}
                    />
                ) : null}
                {cloudProvider && askCloud?.model === m.id && askCloud.provider.id === cloudProvider.id ? (
                    <Notice
                        tone="info"
                        message={providerNotice(t, cloudProvider)}
                        action={{
                            label: t('modelMenu.useModel', { name }),
                            onPress: () => chooseCloud(m.id, cloudProvider),
                        }}
                        onDismiss={() => setAskCloud(null)}
                        testID={`model-consent-${m.id}`}
                    />
                ) : null}
            </Stack>
        );
    };

    const localModels = (local.data?.models ?? []).filter((m) => m.available !== false);
    const ordered = [
        ...localModels.filter((m) => sameModel(current, m.id) || modelState(m) !== 'not_downloaded' || isDownloading(m)),
        ...localModels.filter((m) => !sameModel(current, m.id) && modelState(m) === 'not_downloaded' && !isDownloading(m)),
    ];
    const firstToDownload = ordered.find((m) => !sameModel(current, m.id) && modelState(m) === 'not_downloaded' && !isDownloading(m));
    const unavailable = (local.data?.models ?? []).filter((m) => m.available === false).length;
    const needsKey = providers?.filter((p) => p.remote && !p.configured) ?? [];
    const toSettings = (target?: string) => {
        onClose();
        openSettings('model', target);
    };
    // The provider in use first, as the desktop's list.
    const cloudShown = providers?.filter((p) => p.remote && (p.configured || p.blocked)) ?? [];
    const inUse = active?.remote ? cloudShown.find((p) => p.id === active.provider) : undefined;
    const cloudGroup = (p: ProviderRow) => <CloudGroup key={p.id} provider={p} open={open} row={row} />;

    return (
        <Sheet open={open} onClose={onClose} title={t('modelMenu.label')}>
            <Stack gap="sm">
                {queued ? (
                    <Text role="caption" tone="secondary" testID="model-menu-queued">
                        {t('modelMenu.usedNext', { name: isolate(queued, 'ltr') })}
                    </Text>
                ) : null}
                {/* With a model queued, the queued line above says it; this would repeat half of it. */}
                {turnRunning && !queued ? (
                    <Text role="caption" tone="secondary">
                        {active?.model
                            ? t('modelMenu.keepsModel', {
                                  model: active.display_name || active.model,
                              })
                            : t('modelMenu.keepsItsModel')}
                    </Text>
                ) : null}
                {switchError ? <Notice tone="danger" message={switchError.message} detail={switchError.detail} onDismiss={() => onSwitchError(null)} /> : null}
                {error ? <Notice tone="danger" message={error.text} detail={error.detail} /> : null}
                {local.isLoading ? (
                    <Row gap="sm">
                        <Spinner size="sm" />
                        <Text role="caption" tone="secondary">
                            {t('modelMenu.loading')}
                        </Text>
                    </Row>
                ) : null}
                {local.isError ? <Notice tone="danger" message={describeHttpFailure(local.error, t).text} detail={describeHttpFailure(local.error, t).detail} /> : null}
                <View accessibilityRole="list" accessibilityLabel={t('modelMenu.models')}>
                <Stack gap="sm">
                {inUse ? cloudGroup(inUse) : null}
                {localModels.length > 0 ? (
                    <Stack gap="xs">
                        <Text role="label" weight="semibold" tone="secondary">
                            {t.bare('providers.local.name')}
                        </Text>
                        {ordered.map((m) => (
                            <Stack key={m.id} gap="xs">
                                {m === firstToDownload ? (
                                    <Text role="caption" tone="muted">
                                        {t('modelMenu.availableToDownload')}
                                    </Text>
                                ) : null}
                                {row(m)}
                            </Stack>
                        ))}
                    </Stack>
                ) : null}
                {local.isSuccess && localModels.length === 0 ? (
                    <Stack gap="xs">
                        <Text role="label" weight="semibold" tone="secondary">
                            {t.bare('providers.local.name')}
                        </Text>
                        <Text role="caption" tone="secondary">
                            {t('modelMenu.noModels')}
                        </Text>
                    </Stack>
                ) : null}
                {cloudShown.filter((p) => p !== inUse).map(cloudGroup)}
                </Stack>
                </View>
                <Divider />
                {needsKey.map((p) => (
                    <ListRow
                        key={p.id}
                        title={t('modelMenu.addKey')}
                        subtitle={t('modelMenu.connectInSettings', { provider: providerName(t, p) })}
                        subtitleLines={3}
                        leading={<Icon icon={KeyRound} size="sm" tone="secondary" />}
                        onPress={() => toSettings(p.id)}
                        testID={`model-menu-key-${p.id}`}
                    />
                ))}
                {unavailable > 0 ? (
                    <ListRow title={t.plural('modelMenu.unavailable', unavailable)} onPress={() => toSettings()} testID="model-menu-unavailable" />
                ) : null}
                <ListRow title={t('modelMenu.addFromLink')} subtitle={t('modelMenu.addFromLinkNote')} subtitleLines={3} onPress={() => toSettings()} testID="model-menu-link" />
                <ListRow title={t('modelMenu.providers')} onPress={() => toSettings()} testID="model-menu-providers" />
                <Button variant="secondary" label={t('modelMenu.cancel')} onPress={onClose} />
            </Stack>
        </Sheet>
    );
}
