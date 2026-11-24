// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { isolate } from '@webui/i18n/registry';
import { stepChoices } from '@webui/utils/imageSettings.core';
import { shortModelName } from '@webui/utils/modelList.core';

import { GaiaApiError } from '@/api/errors';
import type { ImageSettingsUpdate } from '@/api/client.types';
import { useImageSettings, useLocalModels, useUpdateImageSettings } from '@/data';
import { useT } from '@/i18n/useT';
import { Button, Card, Notice, Row, Select, Spinner, Stack, Text } from '@/ui';

import { openSettings } from '../openSettings';
import { isPcRefusal, PcOnlyNotice } from '../PcOnlyNotice';
import { failureLine } from './model/agentText';
import { SettingsAnchor } from '../targets';

/** Settings › Image creation: the model, size and steps GAIA creates images with. */
export default function Images() {
    const t = useT();
    const settings = useImageSettings();
    const update = useUpdateImageSettings();
    const localModels = useLocalModels(true);
    const saving = update.isPending;
    const data = settings.data;

    const names = useMemo(() => {
        const out: Record<string, string> = {};
        for (const m of localModels.data?.models ?? []) if (m.display_name) out[m.id] = m.display_name;
        return out;
    }, [localModels.data]);
    const nameOf = (id: string) => names[id] ?? shortModelName(id);

    const save = (change: ImageSettingsUpdate) => update.mutate(change);

    if (settings.error) {
        const err = settings.error;
        const unreachable = err instanceof GaiaApiError && err.status === 503;
        const line = unreachable
            ? { text: t('images.settings.unreachable'), detail: err.detail || undefined }
            : failureLine('images.settings.loadFailed', err, t, {});
        return (
            <Stack gap="lg" padding="lg">
                <Notice tone="danger" message={line.text} detail={line.detail} testID="images-load-error" />
                {unreachable ? <Button variant="secondary" label={t('images.settings.retry')} onPress={() => void settings.refetch()} testID="images-retry" /> : null}
            </Stack>
        );
    }
    if (!data) {
        return (
            <Stack padding="lg">
                <Row gap="sm">
                    <Spinner size="sm" />
                    <Text role="body" tone="secondary">
                        {t('settings.loading')}
                    </Text>
                </Row>
            </Stack>
        );
    }

    const current = data.models.find((m) => m.id === data.model);
    const modelOptions = data.models.map((m) => ({
        value: m.id,
        label: m.downloads_on_first_use
            ? t.bare('images.settings.downloadsOnFirstUse', { model: nameOf(m.id), size: isolate(`${m.size_gb ?? '?'} GB`, 'ltr') })
            : nameOf(m.id),
    }));
    const automatic = (value: string) => ({ value: '', label: t.bare('images.settings.automatic', { value: isolate(value, 'ltr') }) });
    const sizeOptions = current ? [automatic(current.default_size), ...current.sizes.map((s) => ({ value: s, label: isolate(s, 'ltr') }))] : [];
    const stepOptions = current
        ? [automatic(String(current.default_steps)), ...stepChoices(current, data).map((n) => ({ value: String(n), label: isolate(String(n), 'ltr') }))]
        : [];
    const saveLine = update.error && !isPcRefusal(update.error) ? failureLine('images.settings.saveFailed', update.error, t, {}) : null;

    return (
        <Stack gap="lg" padding="lg">
            <Text role="body" tone="secondary">
                {t('images.settings.lede')}
            </Text>
            {!data.chat_model_creates_images ? (
                <Notice
                    tone="warning"
                    role="status"
                    message={t('images.settings.chatModelCannot', { model: nameOf(data.chat_model) })}
                    action={{ label: t('images.settings.chooseChatModel'), onPress: () => openSettings('model') }}
                    testID="images-chat-model-cannot"
                />
            ) : null}
            {!data.model_available ? (
                <Notice tone="danger" message={t('images.settings.modelGone', { model: nameOf(data.model) })} testID="images-model-gone" />
            ) : null}
            {data.models.length === 0 ? (
                <Text role="label" tone="muted" testID="images-no-models">
                    {t('images.settings.noModels')}
                </Text>
            ) : (
                <>
                    <SettingsAnchor name="model">
                        <Card>
                            <Select
                                label={t('images.settings.model')}
                                value={data.model_available ? data.model : undefined}
                                placeholder={nameOf(data.model)}
                                options={modelOptions}
                                disabled={saving}
                                onChange={(model) => save({ model })}
                                testID="images-model"
                            />
                        </Card>
                    </SettingsAnchor>
                    {current ? (
                        <>
                            <SettingsAnchor name="size">
                                <Card>
                                    <Select
                                        label={t('images.settings.size')}
                                        value={data.size ?? ''}
                                        options={sizeOptions}
                                        disabled={saving}
                                        onChange={(size) => save({ size: size || null })}
                                        testID="images-size"
                                    />
                                </Card>
                            </SettingsAnchor>
                            <SettingsAnchor name="steps">
                                <Card>
                                    <Stack gap="sm">
                                        <Select
                                            label={t('images.settings.steps')}
                                            value={data.steps === null ? '' : String(data.steps)}
                                            options={stepOptions}
                                            disabled={saving}
                                            onChange={(steps) => save({ steps: steps ? Number(steps) : null })}
                                            testID="images-steps"
                                        />
                                        <Text role="label" tone="muted">
                                            {t('images.settings.stepsHint')}
                                        </Text>
                                    </Stack>
                                </Card>
                            </SettingsAnchor>
                        </>
                    ) : null}
                </>
            )}
            <Text role="label" tone="muted">
                {t('images.settings.shared')}
            </Text>
            {update.error && isPcRefusal(update.error) ? <PcOnlyNotice testID="images-pc-only" /> : null}
            {saveLine ? <Notice tone="danger" message={saveLine.text} detail={saveLine.detail} testID="images-save-error" /> : null}
        </Stack>
    );
}
