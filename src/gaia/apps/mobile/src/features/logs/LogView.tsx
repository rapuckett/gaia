// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, useWindowDimensions } from 'react-native';

import type { MessageKey } from '@webui/i18n/registry';

import { isProblem, useLogRead, type LogSource } from '@/data';
import { serverText, useT } from '@/i18n/useT';
import { Chip, ErrorState, IconButton, LoadingState, Notice, Row, ScrollBox, Stack, Text } from '@/ui';
import { Check, Copy, RotateCw, Share2 } from '@/ui/icons';

const REASONS: Record<string, MessageKey> = {
    no_file: 'logs.reason.noFile',
    unreadable: 'logs.reason.unreadable',
    not_running: 'logs.reason.notRunning',
    remote: 'logs.reason.remote',
    no_stream: 'logs.reason.noStream',
    stream_failed: 'logs.reason.streamFailed',
};

export const SOURCE_LABELS: Record<LogSource, MessageKey> = {
    model_server: 'logs.source.modelServer',
    gaia: 'logs.source.gaia',
    service: 'logs.source.service',
    agent: 'logs.source.agent',
    desktop: 'logs.source.desktop',
    other: 'logs.source.other',
};

export const SOURCE_HINTS: Record<LogSource, MessageKey> = {
    model_server: 'logs.hint.modelServer',
    gaia: 'logs.hint.gaia',
    service: 'logs.hint.service',
    agent: 'logs.hint.agent',
    desktop: 'logs.hint.desktop',
    other: 'logs.hint.other',
};

const LOG_BOX_HEIGHT = 420;

/** One log, newest line at the bottom, followed live. The PC redacts the lines; they are shown as sent, in an LTR mono block, never translated. */
export function LogView({ source, file, active, initialFollow = true, initialProblemsOnly = false }: {
    source: LogSource;
    file: string | null;
    /** False while the screen is not in front: no reads then. */
    active: boolean;
    initialFollow?: boolean;
    initialProblemsOnly?: boolean;
}) {
    const t = useT();
    const narrow = useWindowDimensions().width < 360;
    const [follow, setFollow] = useState(initialFollow);
    const [problemsOnly, setProblemsOnly] = useState(initialProblemsOnly);
    const [notice, setNotice] = useState<{ ok: boolean; text: string; detail?: string } | null>(null);
    const log = useLogRead(source, file, { follow, active });
    const state = log.data;
    const read = state?.read;
    const shown = problemsOnly ? (state?.lines ?? []).filter(isProblem) : (state?.lines ?? []);
    const text = shown.map((line) => line.text).join('\n');

    const copy = () => {
        Clipboard.setStringAsync(text).then(
            () => setNotice({ ok: true, text: t('logs.copied') }),
            (err: unknown) => setNotice({ ok: false, text: t('mobileApp.logs.copyFailed'), detail: serverText(err) }),
        );
    };
    // The text goes straight to the share sheet; no file is written.
    const share = () => {
        Share.share({ message: text }).then(
            () => setNotice(null),
            (err: unknown) => setNotice({ ok: false, text: t('mobileApp.logs.shareFailed'), detail: serverText(err) }),
        );
    };

    if (log.isPending && !state && !log.isError) return <LoadingState title={t('logs.loading')} />;
    if (!state) {
        return <ErrorState title={t('mobileApp.logs.readFailed')} detail={serverText(log.error)} onRetry={() => void log.refresh()} />;
    }

    // The line earns its place only when it adds to the picked file name, as a full path does.
    const showPath = read?.source === 'file' && !!read.log_path && read.log_path !== file && !(file === null && !/[\\/]/.test(read.log_path));
    const reason = !read?.available && read?.reason
        ? t(source !== 'model_server' && read.reason === 'no_file' ? 'logs.reason.notWritten' : (REASONS[read.reason] ?? 'mobileApp.logs.readFailed'))
        : undefined;
    const chips = (
        <>
            <Chip label={t('logs.follow')} role="checkbox" selected={follow} onPress={() => setFollow(!follow)} testID="log-follow" />
            <Chip label={t('logs.problemsOnly')} role="checkbox" selected={problemsOnly} onPress={() => setProblemsOnly(!problemsOnly)} testID="log-problems-only" />
        </>
    );
    const actions = (
        <Row gap="xs">
            <IconButton icon={RotateCw} variant="outlined" label={t('logs.refresh')} onPress={() => void log.refresh()} disabled={log.isFetching} testID="log-refresh" />
            <IconButton icon={notice?.ok ? Check : Copy} variant="outlined" label={t('logs.copy')} onPress={copy} disabled={!text} testID="log-copy" />
            <IconButton icon={Share2} variant="outlined" label={t('mobileApp.logs.share')} onPress={share} disabled={!text} testID="log-share" />
        </Row>
    );
    return (
        <Stack gap="md">
            <Text role="caption" tone="muted">{t(SOURCE_HINTS[source])}</Text>
            {showPath ? <Text role="caption" tone="secondary">{t('logs.fromFile')}</Text> : null}
            {showPath ? <Text role="caption" mono dir="ltr" align="ltr" selectable>{read?.log_path}</Text> : null}
            {read?.source === 'stream' ? <Text role="caption" tone="secondary">{t('logs.fromStream')}</Text> : null}
            {read?.source === 'stream' && read.base_url ? <Text role="caption" mono dir="ltr" align="ltr" selectable>{read.base_url}</Text> : null}
            {source === 'model_server' && read?.source === 'file' && read.server_answering === false ? (
                <Notice tone="warning" message={t('logs.notAnswering')} />
            ) : null}
            {reason ? <Notice tone="warning" message={reason} detail={read?.detail ?? undefined} testID="log-reason" /> : null}
            {read?.available && read.detail ? <Notice tone="info" role="note" message={read.detail} /> : null}
            {log.isError ? (
                <Notice tone="danger" message={t('mobileApp.logs.updateFailed')} detail={serverText(log.error)} testID="log-update-failed" />
            ) : null}

            {/* The chips share the row with the icon buttons while there is room; below 360 pt the buttons drop under them, never a chip cut short. */}
            <Stack gap="xs">
                <Row gap="sm" align="center">
                    <Stack gap="xs" flex={1}>{chips}</Stack>
                    {narrow ? null : actions}
                </Row>
                {narrow ? <Row justify="end">{actions}</Row> : null}
            </Stack>
            {notice ? (
                <Notice tone={notice.ok ? 'success' : 'danger'} message={notice.text} detail={notice.detail} testID="log-notice" />
            ) : null}

            {read?.available && shown.length === 0 ? (
                <Text role="ui" tone="secondary" testID="log-empty">
                    {problemsOnly && (state.lines.length > 0) ? t('logs.noProblems') : t('logs.empty')}
                </Text>
            ) : shown.length > 0 ? (
                <ScrollBox maxHeight={LOG_BOX_HEIGHT} stickToEnd testID="log-lines">
                    <Text role="caption" mono dir="ltr" align="ltr" selectable accessibilityLabel={t(SOURCE_LABELS[source])}>
                        {shown.map((line, i) => (
                            <Text key={i} mono tone={line.severity === 'error' ? 'danger' : line.severity === 'warning' ? 'warning' : undefined}>
                                {line.text}
                                {'\n'}
                            </Text>
                        ))}
                    </Text>
                </ScrollBox>
            ) : null}
            {(read?.dropped ?? 0) > 0 ? <Text role="caption" tone="muted">{t('logs.older')}</Text> : null}
        </Stack>
    );
}
