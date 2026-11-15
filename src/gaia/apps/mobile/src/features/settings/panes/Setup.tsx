// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { formatSize, ltrIn } from '@webui/components/setup/format';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useActiveModel, useSetupPlan, useSetupPreflight } from '@/data';
import { describeError, useT } from '@/i18n/useT';
import { reopenSetup } from '@/features/setup/SetupGate';
import { Button, Icon, ListRow, Notice, Sheet, Stack, Text } from '@/ui';
import { ChevronRight } from '@/ui/icons';

import { openSettings } from '../openSettings';
import type { SectionId } from '../sections';
import { SettingsAnchor } from '../targets';
import { chatModelName, detectedLine } from './setup/summary';

interface Line {
    label: string;
    value: string | null;
    /** Where the row's setting lives; a row without one only reports. */
    to?: { section: SectionId; target?: string };
    testID: string;
}

/** Everything setup chose, each row jumping to the setting that owns it, and setup again. */
export default function Setup() {
    const t = useT();
    const router = useRouter();
    const plan = useSetupPlan();
    const hardware = useSetupPreflight();
    const active = useActiveModel();
    const [asking, setAsking] = useState(false);

    const chatName = chatModelName(active.data, plan.data);
    const catalog = plan.data?.catalog;
    const installed = (catalog ?? []).filter((e) => e.downloaded);
    const installedGb = installed.reduce((sum, e) => sum + (e.full_size_gb ?? 0), 0);
    const error = plan.error ?? hardware.error;
    const local = !!active.data?.model && !active.data.remote && active.data.downloaded !== false;

    // Rows whose setting has no anchor in this app yet (cloud keys, GPU memory, models on this PC,
    // model server) are plain lines until the section that owns them registers one.
    const groups: { title: string; lines: Line[] }[] = [
        {
            title: t('settings.setup.where'),
            lines: [{ label: t('settings.setup.chatRuns'), value: chatName, to: { section: 'model', target: 'model-in-use' }, testID: 'setup-chat-model' }],
        },
        {
            title: t('setup.pc.step'),
            lines: [
                { label: t('settings.setup.detected'), value: detectedLine(t, plan.data, hardware.data), testID: 'setup-detected' },
                {
                    label: t('settings.setup.server'),
                    value: plan.data ? t(plan.data.lemonade.mode === 'external' ? 'settings.setup.serverYours' : 'settings.setup.serverOwn') : null,
                    testID: 'setup-server',
                },
            ],
        },
        {
            title: t('setup.models.step'),
            lines: [
                {
                    label: t('settings.setup.models'),
                    value: catalog ? t('settings.setup.modelsValue', { n: String(installed.length), size: ltrIn(t.locale, formatSize(installedGb)) }) : null,
                    testID: 'setup-models',
                },
                ...(local ? [{ label: t('settings.setup.context'), value: null, to: { section: 'model' as const, target: 'ctx-size' }, testID: 'setup-context' }] : []),
            ],
        },
        {
            title: t('settings.setup.after'),
            lines: [
                { label: t('settings.section.connectors'), value: null, to: { section: 'connectors' }, testID: 'setup-connectors' },
                { label: t('settings.section.memory'), value: null, to: { section: 'memory' }, testID: 'setup-memory' },
                { label: t('settings.language'), value: null, to: { section: 'general', target: 'ui-language' }, testID: 'setup-language' },
                { label: t('settings.setup.signIn'), value: t('setup.plan.pcOnly'), testID: 'setup-sign-in' },
            ],
        },
    ];

    const runAgain = () => {
        setAsking(false);
        router.replace('/');
        reopenSetup();
    };

    return (
        <SettingsAnchor name="pane">
            <Stack gap="lg" paddingX="lg" paddingY="md">
                <Text role="body" tone="secondary">{t('settings.setup.lede')}</Text>
                <Stack gap="sm">
                    <Text role="ui" weight="semibold">
                        {t('settings.setup.ready')}
                        {chatName ? <Text role="label" tone="muted">{` ${t('settings.setup.running', { name: chatName })}`}</Text> : null}
                    </Text>
                    <Button variant="secondary" full label={t('settings.setup.runAgain')} onPress={() => setAsking(true)} testID="setup-run-again" />
                </Stack>
                {error ? <Notice tone="danger" message={describeError(error, t)} testID="setup-error" /> : null}
                {groups.map((g) => (
                    <Stack key={g.title} gap="xs">
                        <Text role="label" weight="medium" tone="secondary">{g.title}</Text>
                        {g.lines.map((l) => {
                            const to = l.to;
                            return (
                                <ListRow
                                    key={l.label}
                                    title={l.label}
                                    subtitle={l.value ?? undefined}
                                    trailing={to ? <Icon icon={ChevronRight} size="sm" tone="muted" /> : undefined}
                                    onPress={to ? () => openSettings(to.section, to.target, 'setup') : undefined}
                                    testID={l.testID}
                                />
                            );
                        })}
                    </Stack>
                ))}
            </Stack>
            <Sheet
                open={asking}
                onClose={() => setAsking(false)}
                title={t('settings.setup.confirmTitle')}
                footer={
                    <Stack gap="sm">
                        <Button label={t('settings.setup.confirmYes')} full onPress={runAgain} testID="setup-confirm-run" />
                        <Button label={t('setup.again.notNow')} variant="secondary" full onPress={() => setAsking(false)} />
                    </Stack>
                }
            >
                <Text role="body">{t('settings.setup.confirmBody')}</Text>
            </Sheet>
        </SettingsAnchor>
    );
}
