// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { formatBytes, ltrIn } from '@webui/components/setup/format';
import { isolate, keepTogether } from '@webui/i18n/registry';

import type { AgentDownload } from '@/api/client.types';
import { technicalDetail, useT } from '@/i18n/useT';
import { Button, Icon, Ltr, ProgressLine, Row, Spinner, Stack, Text } from '@/ui';
import { Check, CircleAlert, RotateCw } from '@/ui/icons';

import { Details } from './DownloadRows';

export interface AgentDownloadRowProps {
    job: AgentDownload;
    name: string;
    onRetry: () => void;
    /** What happens meanwhile, said under the failure. */
    failedNote?: string;
    /** The PC restarted and dropped the download. */
    interrupted?: boolean;
    /** The start or read that failed, for Details when the PC sent no error of its own. */
    failure?: unknown;
    busy?: boolean;
}

/** The gaiacpp download in the model rows' look: name, state, a bar, bytes done of total, and Retry once it failed. */
export function AgentDownloadRow({ job, name, onRetry, failedNote, interrupted = false, failure, busy = false }: AgentDownloadRowProps) {
    const t = useT();
    const total = job.bytes_total ?? 0;
    const pct = job.state === 'done' ? 100 : total > 0 ? Math.min(100, (job.bytes_done / total) * 100) : 0;
    const failed = job.state === 'failed';
    const state = t(job.state === 'done' ? 'setup.state.ready' : failed ? 'setup.state.failed' : 'setup.state.downloading');
    const sizes = total > 0
        ? t.compose((say, code) => say('setup.progress.of', { done: ltrIn(code, formatBytes(job.bytes_done)), total: ltrIn(code, formatBytes(total)) }))
        : formatBytes(job.bytes_done);
    const details = job.error ?? (failure ? technicalDetail(failure) : null);
    const mark = job.state === 'done' ? <Icon icon={Check} size="sm" tone="success" />
        : failed ? <Icon icon={CircleAlert} size="sm" tone="danger" />
        : <Spinner />;
    return (
        <Stack gap="xs" testID="agent-download-row">
            <Row gap="sm" align="center">
                {mark}
                <Stack flex={1}>
                    <Text weight="medium" dir="ltr" numberOfLines={1} ellipsize="tail">{keepTogether(name)}</Text>
                </Stack>
            </Row>
            <Row gap="sm" align="center">
                <Text role="caption" tone={failed ? 'danger' : 'secondary'}>{state}</Text>
                {job.state === 'downloading' ? <Ltr>{`${Math.floor(pct)}%`}</Ltr> : null}
            </Row>
            <ProgressLine value={pct / 100} />
            {job.state === 'downloading' ? <Text role="caption" tone="secondary">{total > 0 ? sizes : isolate(sizes, 'ltr')}</Text> : null}
            {failed ? (
                <Stack gap="xs">
                    <Text tone="danger" accessibilityRole="alert">{t('setup.agent.downloadFailed', { name: isolate(name, 'ltr') })}</Text>
                    {interrupted ? <Text role="caption" tone="secondary">{t('setup.agent.downloadInterrupted')}</Text> : null}
                    {failedNote ? <Text role="caption" tone="secondary">{failedNote}</Text> : null}
                    {details ? <Details text={details} /> : null}
                    <Row gap="sm">
                        <Button label={t('setup.progress.retry')} icon={RotateCw} variant="primary" size="sm" disabled={busy} onPress={onRetry} testID="agent-download-retry" />
                    </Row>
                </Stack>
            ) : null}
        </Stack>
    );
}
