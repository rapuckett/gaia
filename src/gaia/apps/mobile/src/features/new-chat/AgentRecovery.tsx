// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { AGENT_WHY } from '@webui/components/setup/agentPrograms';

import type { AgentProblem } from '@/api/client.types';
import {
    agentProgramKeys, requireClient, useAgentDownload, useAgentPrograms, useAgentProgramsRefused, useGaiaClient, useSetFlagshipAgent,
} from '@/data';
import { failureLine, programName, type AgentLine } from '@/features/settings/panes/model/agentText';
import { isPcRefusal, PcOnlyNotice } from '@/features/settings/PcOnlyNotice';
import { AgentDownloadRow } from '@/features/setup/steps/AgentDownloadRow';
import { useT } from '@/i18n/useT';
import { Button, Disclosure, Row, Spinner, Stack, Surface, Text } from '@/ui';
import { Download } from '@/ui/icons';

const NAME = 'gaiacpp';

export interface AgentRecoveryProps {
    problem: AgentProblem;
    /** When the start screen last answered: a fresh answer ends "Starting the agent…". */
    answeredAt: number;
    /** Ask for the start screen again, after a download or a switch. */
    onRetry: () => void;
    /** A message was sent while the agent can't start; it stayed in the box. */
    kept?: boolean;
}

function Line({ line }: { line: AgentLine }) {
    return (
        <Stack gap="xs">
            {line.text ? <Text role="label" tone="danger">{line.text}</Text> : null}
            {line.detail ? <Text role="caption" tone="muted" dir="ltr" align="ltr" selectable>{line.detail}</Text> : null}
        </Stack>
    );
}

/** The chosen gaiacpp can't start: why, and the two ways out. Nothing changes until the person picks one. */
export function AgentRecovery({ problem, answeredAt, onRetry, kept = false }: AgentRecoveryProps) {
    const t = useT();
    const client = useGaiaClient();
    const queryClient = useQueryClient();
    const refused = useAgentProgramsRefused();
    const programs = useAgentPrograms();
    const save = useSetFlagshipAgent();
    const [open, setOpen] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [switchError, setSwitchError] = useState<unknown>(null);
    const [pythonMissing, setPythonMissing] = useState(false);
    const [switchPcOnly, setSwitchPcOnly] = useState(false);
    const retryRef = useRef(onRetry);
    useEffect(() => {
        retryRef.current = onRetry;
    });

    // A fresh answer that still names a problem ends the wait, so the buttons work again.
    const [seenAt, setSeenAt] = useState(answeredAt);
    if (answeredAt !== seenAt) {
        setSeenAt(answeredAt);
        setRetrying(false);
    }

    const download = useAgentDownload(() => {
        setRetrying(true);
        retryRef.current();
    });
    const { follow } = download;
    const listing = programs.data;
    const followed = useRef(false);
    useEffect(() => {
        if (!listing || followed.current) return;
        followed.current = true;
        follow(listing.download);
    }, [listing, follow]);

    const askAgain = () => {
        setRetrying(true);
        onRetry();
    };

    const switchToPython = async () => {
        setSwitching(true);
        setSwitchError(null);
        setPythonMissing(false);
        setSwitchPcOnly(false);
        try {
            // Checked before saving: a Python agent that can't start must not replace the gaiacpp choice.
            const now = await queryClient.fetchQuery({ queryKey: agentProgramKeys.list, queryFn: ({ signal }) => requireClient(client).getAgentPrograms({ signal }), staleTime: 0 });
            if (now.programs.find((p) => p.id === 'gaiapy')?.installed !== true) {
                setPythonMissing(true);
                return;
            }
            await save.mutateAsync('gaiapy');
            askAgain();
        } catch (err) {
            if (isPcRefusal(err)) setSwitchPcOnly(true);
            else setSwitchError(err);
        } finally {
            setSwitching(false);
        }
    };

    // The PC keeps both ways out to itself for this phone: say so, and offer only to ask again.
    const pcOnly = refused || isPcRefusal(programs.error) || isPcRefusal(download.failure) || switchPcOnly;
    const job = isPcRefusal(download.failure) ? null : download.job;
    const downloading = job?.state === 'downloading';
    const busy = downloading || switching || retrying;
    const program = listing?.programs.find((p) => p.id === NAME) ?? null;
    const name = programName(NAME);
    const code = program && !program.can_download ? program.unavailable_code : null;
    const cantDownload: AgentLine | null = !program || program.can_download ? null
        : code ? { text: t.compose((say) => say('newChat.agent.cantDownload', { name, reason: say(AGENT_WHY[code]) })) }
            : program.unavailable_reason ? { text: '', detail: program.unavailable_reason } : null;
    const checkFailed = programs.error && !isPcRefusal(programs.error) ? failureLine('newChat.agent.checkFailed', programs.error, t, { name }) : null;
    const switchFailed: AgentLine | null = pythonMissing
        ? { text: t.compose((say) => say('newChat.agent.switchFailed', { error: say('newChat.agent.pythonMissing', { name }) })) }
        : switchError ? failureLine('newChat.agent.switchFailed', switchError, t) : null;

    return (
        <Surface tone="card" border radius="md" padding="md" testID="agent-recovery">
            <Stack gap="sm">
                <Text role="ui" weight="semibold" accessibilityRole="alert">
                    {t(problem.code === 'gaiacpp_invalid' ? 'newChat.agent.invalid' : 'newChat.agent.missing', { name })}
                </Text>
                {kept ? <Text role="label" tone="secondary">{t('newChat.agent.kept')}</Text> : null}
                {cantDownload && !pcOnly ? <Line line={cantDownload} /> : null}
                {checkFailed ? <Line line={checkFailed} /> : null}
                {job && job.state !== 'idle' ? (
                    <AgentDownloadRow job={job} name={NAME} onRetry={() => void download.start()} interrupted={download.interrupted} failure={download.failure} />
                ) : null}
                {retrying && !downloading ? (
                    <Row gap="sm" align="center">
                        <Spinner size="sm" />
                        <Text role="label" tone="secondary" accessibilityRole="summary">{t('newChat.agent.starting')}</Text>
                    </Row>
                ) : null}
                {pcOnly ? (
                    <Stack gap="sm">
                        <PcOnlyNotice testID="agent-recovery-pc-only" />
                        <Row gap="sm">
                            <Button label={t('settings.key.checkAgain')} variant="secondary" size="sm" disabled={retrying} onPress={askAgain} testID="agent-recovery-check-again" />
                        </Row>
                    </Stack>
                ) : (
                    <Row gap="sm" wrap stack>
                        {program?.can_download && !job ? (
                            <Button
                                label={t.bare('newChat.agent.downloadAgain', { name })}
                                accessibilityLabel={t('newChat.agent.downloadAgain', { name })}
                                icon={Download}
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onPress={() => void download.start()}
                                testID="agent-recovery-download"
                            />
                        ) : null}
                        <Button
                            label={t.bare('newChat.agent.usePython')}
                            accessibilityLabel={t('newChat.agent.usePython')}
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onPress={() => void switchToPython()}
                            testID="agent-recovery-use-python"
                        />
                    </Row>
                )}
                {switchFailed ? <Line line={switchFailed} /> : null}
                <Disclosure title={t('newChat.details')} headerTestID="agent-recovery-details" open={open} onToggle={() => setOpen((v) => !v)}>
                    <Text role="caption" tone="secondary" mono dir="ltr" align="ltr" selectable>{problem.detail}</Text>
                </Disclosure>
            </Stack>
        </Surface>
    );
}
