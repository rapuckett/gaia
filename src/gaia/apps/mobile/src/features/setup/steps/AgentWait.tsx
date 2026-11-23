// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { failureLine, programName } from '@/features/settings/panes/model/agentText';
import { isPcRefusal, PcOnlyNotice } from '@/features/settings/PcOnlyNotice';
import { useT } from '@/i18n/useT';
import { Button, Card, Row, Spinner, Stack, Text } from '@/ui';

import { SetupFooter } from '../SetupFooter';
import { AgentDownloadRow } from './AgentDownloadRow';
import type { useAgentFirst } from './useAgentFirst';

/** Setup's run waits on the picked agent: its download, or why it can't be had, and the way on. */
export function AgentWait({ agent }: { agent: ReturnType<typeof useAgentFirst> }) {
    const t = useT();
    const { job, error, saving } = agent;
    const failed = job?.state === 'failed';
    const pcOnly = isPcRefusal(agent.failure) || isPcRefusal(error);
    const current = programName(agent.pick?.current ?? 'gaiapy');
    const saveFailed = error && !isPcRefusal(error) ? failureLine('setup.agent.saveFailed', error, t) : null;
    return (
        <Stack gap="md" testID="setup-agent-wait">
            {job && job.state !== 'idle' && job.state !== 'done' && !isPcRefusal(agent.failure) ? (
                <Card padding="md">
                    <Stack gap="sm">
                        <Text role="ui" weight="semibold" accessibilityRole="header">{t('setup.agent.title')}</Text>
                        <AgentDownloadRow
                            job={job}
                            name={agent.pick?.id ?? 'gaiacpp'}
                            onRetry={() => void agent.retryDownload()}
                            failedNote={t('setup.agent.carryOnNote', { name: current })}
                            interrupted={agent.interrupted}
                            failure={agent.failure}
                            busy={saving}
                        />
                    </Stack>
                </Card>
            ) : null}
            {pcOnly ? <PcOnlyNotice testID="setup-agent-pc-only" /> : null}
            {saveFailed ? (
                <Stack gap="xs">
                    <Text tone="danger" accessibilityRole="alert">{saveFailed.text}</Text>
                    {saveFailed.detail ? <Text role="caption" tone="muted" dir="ltr" align="ltr" selectable>{saveFailed.detail}</Text> : null}
                </Stack>
            ) : null}
            {saving || (!job && !error) ? (
                <Row gap="sm">
                    <Spinner size="sm" />
                    <Text tone="secondary" accessibilityRole="summary">{t('setup.download.starting')}</Text>
                </Row>
            ) : null}
            <SetupFooter>
                {failed || error ? (
                    <Button variant="secondary" label={t('setup.agent.carryOn', { name: current })} disabled={saving} onPress={agent.carryOn} testID="setup-agent-carry-on" />
                ) : null}
                {saveFailed ? <Button variant="primary" label={t('setup.tryAgain')} disabled={saving} onPress={agent.retry} testID="setup-agent-try-again" /> : null}
                {!failed && !error ? <Button variant="secondary" label={t('setup.progress.cancel')} disabled={saving} onPress={agent.cancel} /> : null}
            </SetupFooter>
        </Stack>
    );
}
