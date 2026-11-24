// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { embedderChoices, embedderDeviceKey, embedderHints, embedderRequestDevice, embedderSelected, type EmbedderChoice } from '@webui/utils/embedderSetting.core';

import { GaiaApiError } from '@/api/errors';
import type { EmbedderView } from '@/api/client.types';
import { useMemoryEmbedder, useSetMemoryEmbedder } from '@/data';
import { describeHttpFailure, useT } from '@/i18n/useT';
import { Notice, Row, Select, Spinner, Stack, Text } from '@/ui';

import { isolate } from './model/modelText';

/** Where documents and memory are embedded, and the choice to move it. */
export default function MemoryEmbedder() {
    const t = useT();
    const query = useMemoryEmbedder();
    const set = useSetMemoryEmbedder();
    const view: EmbedderView | undefined = query.data;
    const error = set.error ?? query.error;

    const failure = error ? describeHttpFailure(error, t) : null;
    const errorNotice = error ? (
        error instanceof GaiaApiError && error.status === 403 ? (
            <Notice tone="info" message={t('mobileApp.settings.pcOnly')} testID="memory-embedder-pc-only" />
        ) : (
            <Notice tone="danger" message={failure!.text} detail={failure!.detail} testID="memory-embedder-error" />
        )
    ) : null;

    if (!view) {
        if (error) return errorNotice;
        return (
            <Row gap="sm" align="center" testID="memory-embedder-checking">
                <Spinner size="sm" />
                <Text role="label" tone="muted">{t('settings.memory.embedder.checking')}</Text>
            </Row>
        );
    }

    const deviceName = (device: string) => t.bare(embedderDeviceKey(device));
    const label = (c: EmbedderChoice) =>
        c.kind === 'default' ? t.bare('settings.memory.embedder.default', { device: deviceName(c.device) })
        : c.kind === 'unavailable' ? t.bare('settings.memory.embedder.unavailable', { device: deviceName(c.device) })
        : c.kind === 'unproven' ? t.bare('settings.memory.embedder.unproven', { device: deviceName(c.device) })
        : deviceName(c.device);
    const choices = embedderChoices(view);
    const { current, npuUnproven, notDownloaded } = embedderHints(view);

    return (
        <Stack gap="md">
            <Select
                label={t('settings.memory.embedder.label')}
                value={embedderSelected(view)}
                options={choices.map((c) => ({
                    value: c.value,
                    label: label(c),
                    disabled: c.disabled,
                    reason: c.disabled && c.kind === 'unproven' ? t.bare('settings.memory.embedder.npuUnproven') : undefined,
                }))}
                disabled={set.isPending}
                onChange={(value) => {
                    set.mutate(embedderRequestDevice(value));
                }}
                testID="memory-embedder"
            />
            <Text role="label" tone="muted" testID="memory-embedder-runs-on">
                {t('settings.memory.embedder.runsOn', { name: isolate(current?.display_name ?? view.device), device: deviceName(view.device) })}
                {' '}
                {t('settings.memory.embedder.why')}
            </Text>
            {npuUnproven ? <Text role="label" tone="muted" testID="memory-embedder-npu-unproven">{t('settings.memory.embedder.npuUnproven')}</Text> : null}
            {notDownloaded ? <Text role="label" tone="muted" testID="memory-embedder-not-downloaded">{t('settings.memory.embedder.notDownloaded')}</Text> : null}
            {set.isPending ? (
                <Row gap="sm" align="center" testID="memory-embedder-applying">
                    <Spinner size="sm" />
                    <Text role="label" tone="muted">{t('settings.memory.embedder.applying')}</Text>
                </Row>
            ) : null}
            {set.isSuccess && set.data.changed !== false ? <Notice tone="success" message={t('settings.memory.embedder.changed')} testID="memory-embedder-changed" /> : null}
            {errorNotice}
        </Stack>
    );
}
