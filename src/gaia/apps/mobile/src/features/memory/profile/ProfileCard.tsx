// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { isolate } from '@webui/i18n/registry';

import { ENDPOINTS } from '@/api/constants';
import { useDeviceRefused } from '@/api/routeAccess';
import { useT } from '@/i18n/useT';
import { Button, Card, ChoiceList, Disclosure, Icon, Ltr, Notice, Row, ScrollBox, Stack, Switch, Text } from '@/ui';
import { CircleCheck, Cpu, Sparkles, Square } from '@/ui/icons';

import { PcOnlyNotice } from '../../settings/PcOnlyNotice';
import type { MemoryPaneProps } from '../tabs';
import { useProfileRun, type LogLine, type ProfileKind } from './useProfileRun';

const COPY = {
    discovery: { title: 'mobileApp.mem.disc.title', desc: 'mem.disc.desc', run: 'mem.disc.run', saved: 'mem.disc.saved', empty: 'mem.disc.empty', icon: Cpu },
    inference: { title: 'mem.inf.title', desc: 'mobileApp.mem.inf.desc', run: 'mem.inf.run', saved: 'mem.inf.saved', empty: 'mem.inf.empty', icon: Sparkles },
} as const;

// The PC's scan log box is 200 px tall.
const LOG_MAX_HEIGHT = 200;

/** The dev gallery starts a run, and can save its result, without a tap. */
export const ProfileDevContext = createContext<{ kind: ProfileKind; save?: boolean } | null>(null);

export function Log({ lines, running }: { lines: LogLine[]; running: boolean }) {
    return (
        <ScrollBox maxHeight={LOG_MAX_HEIGHT} hint stickToEnd settleKey={running ? undefined : 'ended'} testID="profile-log">
            <Stack gap="xs">
                {lines.map((line, i) => (
                    <Text key={i} role="caption" tone={line.kind === 'error' ? 'danger' : line.kind === 'finding' ? 'primary' : 'muted'} dir={line.server ? 'ltr' : undefined}>
                        {line.server ? isolate(line.text, 'ltr') : line.text}
                    </Text>
                ))}
            </Stack>
        </ScrollBox>
    );
}

export function ProfileCard({ kind, notify }: { kind: ProfileKind; notify: MemoryPaneProps['notify'] }) {
    const t = useT();
    const copy = COPY[kind];
    const run = useProfileRun(kind, notify);
    // Only a device the PC doesn't allow to scan is refused; an allowed phone runs it.
    const pinned = useDeviceRefused('GET', kind === 'discovery' ? ENDPOINTS.memoryStreamDiscovery : ENDPOINTS.memoryStreamInference);
    const [includeBrowser, setIncludeBrowser] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const { phase, logs, items, detail, consentOff, savedCount } = run;
    const dev = useContext(ProfileDevContext);
    const auto = useRef(dev?.kind === kind);
    const autoSaved = useRef(false);
    const { begin, save } = run;
    useEffect(() => {
        if (!auto.current) return;
        auto.current = false;
        void begin(false);
    }, [begin]);
    useEffect(() => {
        if (dev?.kind !== kind || !dev.save || phase !== 'review' || items.length === 0 || autoSaved.current) return;
        autoSaved.current = true;
        void save();
    }, [dev, kind, phase, items.length, save]);
    const busy = phase === 'running' || phase === 'saving';
    const kept = items.filter((item) => item.checked).length;
    const reviewing = phase === 'review' || phase === 'saving' || phase === 'done';
    const locked = phase === 'saving' || phase === 'done';

    return (
        <Card padding="lg" testID={`profile-${kind}`}>
            <Stack gap="md">
                <Row gap="sm" accessibilityRole="header">
                    <Icon icon={copy.icon} size="md" tone="secondary" />
                    <Stack flex={1}>
                        <Text role="body" weight="semibold">
                            {t(copy.title)}
                        </Text>
                    </Stack>
                </Row>
                <Text tone="secondary">{t(copy.desc)}</Text>
                {kind === 'inference' && !pinned ? (
                    <>
                        <Text role="caption" tone="muted">
                            {t('mobileApp.mem.inf.note')}
                        </Text>
                        <Switch label={t('mem.inf.browser')} value={includeBrowser} onValueChange={setIncludeBrowser} disabled={busy} testID="profile-browser" />
                    </>
                ) : null}
                {pinned ? <PcOnlyNotice testID={`profile-${kind}-pc-only`} /> : null}
                {pinned ? null : (
                    <Row gap="sm" wrap stack>
                        <Button
                            label={t.bare(phase === 'running' ? 'mem.running' : copy.run)}
                            accessibilityLabel={t(phase === 'running' ? 'mem.running' : copy.run)}
                            variant="primary"
                            busy={phase === 'running'}
                            disabled={busy}
                            onPress={() => void run.begin(includeBrowser)}
                            testID={`profile-${kind}-run`}
                        />
                        {phase === 'running' ? (
                            <Button label={t.bare('composer.stop')} accessibilityLabel={t('composer.stop')} variant="ghost" icon={Square} onPress={run.stop} testID={`profile-${kind}-stop`} />
                        ) : null}
                    </Row>
                )}

                {consentOff ? <Notice tone="info" message={t('mobileApp.mem.log.noConsent')} testID={`profile-${kind}-consent-off`} /> : null}
                {logs.length > 0 ? <Log lines={logs} running={phase === 'running'} /> : null}
                {detail ? (
                    <Disclosure title={t('prompt.technicalDetails')} open={detailOpen} onToggle={() => setDetailOpen((open) => !open)}>
                        <Ltr>{detail}</Ltr>
                    </Disclosure>
                ) : null}

                {reviewing && items.length > 0 ? (
                    <Stack gap="sm" testID={`profile-${kind}-review`}>
                        <Text role="label" weight="semibold" accessibilityRole="header">
                            {t('mem.review.title')}
                        </Text>
                        <ChoiceList
                            multiple
                            value={items.flatMap((item, i) => (item.checked ? [String(i)] : []))}
                            onChange={(next) => {
                                if (locked) return;
                                items.forEach((item, i) => {
                                    if (next.includes(String(i)) !== item.checked) run.setChecked(i);
                                });
                            }}
                            options={items.map((item, i) => ({
                                value: String(i),
                                label: item.content,
                                description: isolate(`${item.tag} · ${Math.round(item.confidence * 100)}%`, 'ltr'),
                            }))}
                            accessibilityLabel={t('mem.review.title')}
                            testID={`profile-${kind}-items`}
                        />
                        <Row gap="md" wrap stack>
                            <Button
                                label={t.bare('mem.review.selectAll')}
                                accessibilityLabel={t('mem.review.selectAll')}
                                variant="ghost"
                                size="sm"
                                disabled={locked}
                                onPress={() => run.setChecked('all')}
                            />
                            <Button label={t.bare('mem.review.none')} accessibilityLabel={t('mem.review.none')} variant="ghost" size="sm" disabled={locked} onPress={() => run.setChecked('none')} />
                        </Row>
                        {/* Once saved, the notice replaces Save, so it shows where the person tapped. */}
                        {phase === 'done' && savedCount !== null ? (
                            <Notice tone="success" message={t(copy.saved, { n: savedCount })} testID={`profile-${kind}-saved`} />
                        ) : (
                            <Button
                                label={t.bare(phase === 'saving' ? 'mem.saving' : 'mem.review.saveSelected', { n: kept })}
                                accessibilityLabel={t(phase === 'saving' ? 'mem.saving' : 'mem.review.saveSelected', { n: kept })}
                                variant="primary"
                                full
                                busy={phase === 'saving'}
                                disabled={locked || kept === 0}
                                onPress={() => void run.save()}
                                testID={`profile-${kind}-save`}
                            />
                        )}
                    </Stack>
                ) : null}

                {phase === 'review' && items.length === 0 ? (
                    <Row gap="sm" testID={`profile-${kind}-empty`}>
                        <Icon icon={CircleCheck} size="sm" tone="muted" />
                        <Text tone="muted">{t(copy.empty)}</Text>
                    </Row>
                ) : null}
                {run.sheet}
            </Stack>
        </Card>
    );
}
