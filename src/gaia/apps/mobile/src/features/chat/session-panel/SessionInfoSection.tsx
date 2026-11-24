// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { isolate } from '@webui/i18n/registry';

import { useSession, useSystemStatus } from '@/data';
import { dateLocale, describeFailureWith, useT } from '@/i18n/useT';
import { IconButton, Notice, Row, Stack, Text } from '@/ui';
import { Check, Copy } from '@/ui/icons';

import { PanelSection } from './PanelSection';

const COPIED_MS = 2000;

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Row gap="md" justify="between">
            <Text tone="muted">{label}</Text>
            {children}
        </Row>
    );
}

/** The facts a bug report or a log search needs: the chat's id, when it started, its agent, and the GAIA and Lemonade versions. */
export function SessionInfoSection({ sessionId }: { sessionId: string }) {
    const t = useT();
    const session = useSession(sessionId).data;
    const system = useSystemStatus().data;
    const [copied, setCopied] = useState(false);
    const [failure, setFailure] = useState<unknown>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

    const copy = () => {
        Clipboard.setStringAsync(sessionId).then(
            () => {
                setFailure(null);
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), COPIED_MS);
            },
            (error: unknown) => {
                setCopied(false);
                setFailure(error);
            },
        );
    };

    const started = session?.created_at ? new Date(session.created_at) : null;
    const startedText =
        started && !Number.isNaN(started.getTime()) ? started.toLocaleString(dateLocale(t), { dateStyle: 'medium', timeStyle: 'short' }) : null;
    return (
        <PanelSection id="session" title={t('sp.section.session')} divider={false}>
            <Stack gap="md" testID="session-facts">
                <Fact label={t('session.id')}>
                    <Row gap="xs" flex={1} justify="end">
                        <Stack flex={1} align="end">
                            <Text mono dir="ltr" numberOfLines={1} ellipsize="middle" testID="session-id">
                                {sessionId}
                            </Text>
                        </Stack>
                        <IconButton icon={copied ? Check : Copy} size="sm" variant="ghost" label={t('session.copyId')} onPress={copy} testID="session-copy-id" />
                    </Row>
                </Fact>
                {failure ? (
                    <Notice tone="danger" message={t.compose((say) => say('session.copyFailed', { error: describeFailureWith(failure, say) }))} testID="session-copy-failed" />
                ) : null}
                {startedText ? (
                    <Fact label={t('session.started')}>
                        <Text>{startedText}</Text>
                    </Fact>
                ) : null}
                {session?.agent_type ? (
                    <Fact label={t('session.agent')}>
                        <Text mono dir="ltr">
                            {session.agent_type}
                        </Text>
                    </Fact>
                ) : null}
                {system?.version ? (
                    <Fact label={t('session.gaia')}>
                        <Text dir="ltr">{isolate(system.version, 'ltr')}</Text>
                    </Fact>
                ) : null}
                {system?.lemonade_version ? (
                    <Fact label={t('session.lemonade')}>
                        <Text dir="ltr">{isolate(system.lemonade_version, 'ltr')}</Text>
                    </Fact>
                ) : null}
            </Stack>
        </PanelSection>
    );
}
