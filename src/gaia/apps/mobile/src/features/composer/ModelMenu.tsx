// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import { isDownloading, modelState } from '@webui/components/modelMeta';

import type { ProviderModel } from '@webui/types';
import { PC_ONLY_REFUSAL } from '@/api/constants';
import { useActiveModel, useDownloadModel, useProviderModels, useSelectModel } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import { Button, Divider, Icon, ListRow, Notice, Row, Sheet, Spinner, Stack, StatusDot, Text } from '@/ui';
import { Check, Download, KeyRound } from '@/ui/icons';

/** The id without its provider prefix or catalogue path, when the PC gave no friendly name. */
export function modelLabel(m: Pick<ProviderModel, 'id' | 'display_name'>): string {
    return m.display_name || m.id.slice(m.id.lastIndexOf('/') + 1);
}

const sameModel = (a: string | null | undefined, b: string | null | undefined) =>
    !!a && !!b && a.toLowerCase().replace(/^user\./, '') === b.toLowerCase().replace(/^user\./, '');

export interface ModelMenuProps {
    open: boolean;
    onClose: () => void;
    /** A reply is running: a model picked now is used from the next message. */
    turnRunning: boolean;
    /** The model picked while a reply ran. */
    queued: string | null;
    onQueue: (model: string | null) => void;
}

/** Switch the model, download one that isn't on the PC, or see what only the PC can do. */
export function ModelMenu({ open, onClose, turnRunning, queued, onQueue }: ModelMenuProps) {
    const t = useT();
    const active = useActiveModel().data;
    const local = useProviderModels('local', open);
    const cloud = useProviderModels(active?.remote ? active.provider : undefined, open);
    const select = useSelectModel();
    const download = useDownloadModel();
    const [error, setError] = useState<string | null>(null);
    const [askDownload, setAskDownload] = useState<ProviderModel | null>(null);
    const pickAfterDownload = useRef<string | null>(null);
    const [wasOpen, setWasOpen] = useState(open);
    const [pcOnly, setPcOnly] = useState(false);
    const current = queued ?? active?.model;

    // A fresh open starts clean; reset while rendering, not in an effect.
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) {
            setError(null);
            setAskDownload(null);
            setPcOnly(false);
        }
    }

    const choose = (model: string) => {
        setError(null);
        if (turnRunning) {
            onQueue(sameModel(model, active?.model) ? null : model);
            onClose();
            return;
        }
        select.mutate(model, {
            onSuccess: onClose,
            onError: (err) => setError(describeError(err, t)),
        });
    };

    // A model picked before it was on the PC is switched to once its download ends.
    const models = local.data?.models;
    useEffect(() => {
        if (!pickAfterDownload.current || !models) return;
        const m = models.find((x) => x.id === pickAfterDownload.current);
        if (m && !isDownloading(m) && modelState(m) !== 'not_downloaded') {
            pickAfterDownload.current = null;
            choose(m.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [models]);

    const startDownload = (m: ProviderModel, pick: boolean) => {
        setAskDownload(null);
        setError(null);
        if (pick) pickAfterDownload.current = m.id;
        download.mutate(m.id, {
            onError: (err) => setError(describeError(err, t)),
        });
    };

    const row = (m: ProviderModel, remote: boolean) => {
        const state = modelState(m);
        const downloading = isDownloading(m);
        const needsDownload = !remote && state === 'not_downloaded' && !sameModel(current, m.id);
        const name = modelLabel(m);
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
            trailing = <StatusDot tone="success" label={t('modelStatus.state.loaded')} />;
        } else if (!remote) {
            trailing = (
                <Text role="caption" tone="secondary">
                    {t('modelMenu.ready')}
                </Text>
            );
        }
        return (
            <Stack key={`${remote ? 'cloud' : 'local'}:${m.id}`} gap="xs">
                <ListRow
                    title={name}
                    subtitle={!remote && m.size_gb ? `${m.size_gb} GB` : undefined}
                    leading={
                        sameModel(current, m.id) ? (
                            <Icon icon={Check} size="sm" tone="accent" />
                        ) : (
                            <Icon icon={Check} size="sm" tone="muted" />
                        )
                    }
                    trailing={trailing}
                    selected={sameModel(current, m.id)}
                    onPress={
                        downloading || select.isPending
                            ? undefined
                            : () => {
                                  pickAfterDownload.current = null;
                                  if (needsDownload) setAskDownload(m);
                                  else choose(m.id);
                              }
                    }
                    testID={`model-row-${m.id}`}
                />
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
            </Stack>
        );
    };

    const localModels = (local.data?.models ?? []).filter((m) => m.available !== false);
    const ordered = [
        ...localModels.filter((m) => sameModel(current, m.id) || modelState(m) !== 'not_downloaded' || isDownloading(m)),
        ...localModels.filter((m) => !sameModel(current, m.id) && modelState(m) === 'not_downloaded' && !isDownloading(m)),
    ];
    const firstToDownload = ordered.find((m) => !sameModel(current, m.id) && modelState(m) === 'not_downloaded' && !isDownloading(m));
    const cloudModels = (cloud.data?.models ?? []).filter((m) => m.available !== false);

    return (
        <Sheet open={open} onClose={onClose} title={t('modelMenu.label')}>
            <Stack gap="sm">
                {turnRunning ? (
                    <Text role="caption" tone="secondary">
                        {active?.model
                            ? t('modelMenu.keepsModel', {
                                  model: active.display_name || active.model,
                              })
                            : t('modelMenu.keepsItsModel')}
                    </Text>
                ) : null}
                {error ? <Notice tone="danger" message={error} /> : null}
                {local.isLoading ? (
                    <Row gap="sm">
                        <Spinner size="sm" />
                        <Text role="caption" tone="secondary">
                            {t('modelMenu.loading')}
                        </Text>
                    </Row>
                ) : null}
                {local.isError ? <Notice tone="danger" message={describeError(local.error, t)} /> : null}
                {cloudModels.length > 0 && active ? (
                    <Stack gap="xs">
                        <Text role="label" weight="semibold" tone="secondary">
                            {active.provider_name || active.provider}
                        </Text>
                        {cloudModels.map((m) => row(m, true))}
                    </Stack>
                ) : null}
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
                                {row(m, false)}
                            </Stack>
                        ))}
                    </Stack>
                ) : null}
                <Divider />
                <ListRow
                    title={t('modelMenu.addKey')}
                    leading={<Icon icon={KeyRound} size="sm" tone="secondary" />}
                    onPress={() => setPcOnly(true)}
                    testID="model-menu-pc-only"
                />
                <ListRow title={t('modelMenu.addFromLink')} onPress={() => setPcOnly(true)} />
                <ListRow title={t('modelMenu.providers')} onPress={() => setPcOnly(true)} />
                {pcOnly ? <Notice tone="info" message={PC_ONLY_REFUSAL} testID="model-menu-refusal" /> : null}
                <Button variant="secondary" label={t('modelMenu.cancel')} onPress={onClose} />
            </Stack>
        </Sheet>
    );
}
