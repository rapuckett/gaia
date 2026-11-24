// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import { failureRecordId } from '@webui/utils/streamErrors.core';
import { offersAgentRecovery } from '@webui/utils/agentRecovery.core';
import { isErrorContent, namesAgentLog } from '@webui/utils/answerErrors.core';

import type { Message } from '@/api/client.types';
import { useSession } from '@/data';
import { PcOnlyAction } from '@/features/logs/PcOnlyAction';
import { openPolicyReceipts } from '@/features/notifications/openPolicyReceipts';
import { ModelServerDownNotice } from '@/features/model/ModelServerDownNotice';
import { describeError, describeHttpFailure, useT } from '@/i18n/useT';
import { openLink } from '@/platform/openLink';
import { Button, Icon, Notice, Row, Stack, Text } from '@/ui';
import { Archive, Info, RotateCcw, ScrollText } from '@/ui/icons';

import { savedActivity } from './activity/savedActivity';
import { ChatAgentRecovery } from './ChatAgentRecovery';
import { FailedLead, OpenSettingsButtons, causeTitleKey, failedTurnOf } from './FailedTurnCard';
import { useMessageActionsContext } from './messages/MessageActionsContext';
import { chatErrorInfo, namesFailureRecord, reportTitle } from './chatErrors';
import { phoneBugReportUrl } from './bugReport';
import type { TurnTail } from './tailState';

/** "Something went wrong", the web UI's banner on a failed reply. */
export function ErrorBanner({ title }: { title?: string }) {
    const t = useT();
    return <Notice tone="danger" title={title ?? t('msg.error')} testID="error-banner" />;
}

/** What only the PC running GAIA can do: one plain line, never a control that would fail. */
function PcOnlyLine({ text, testID }: { text: string; testID: string }) {
    return (
        <Row gap="sm" align="start" accessibilityRole="text" testID={testID}>
            <Icon icon={Info} size="sm" tone="secondary" />
            <Stack flex={1}>
                <Text role="label" tone="secondary">
                    {text}
                </Text>
            </Stack>
        </Row>
    );
}

/** A failed reply on a local model points to the phone's Logs screen; the report is saved on the PC only. */
function PcOnlyFailureLines({ showLog, showReport }: { showLog: boolean; showReport: boolean }) {
    const t = useT();
    return (
        <>
            {showLog ? <PcOnlyLine text={t('mobileApp.logs.seeLogs')} testID="see-logs" /> : null}
            {showReport ? (
                <PcOnlyAction
                    label={t('setup.logs.report')}
                    icon={Archive}
                    note={t('msg.reportNote')}
                    detail={t('setup.logs.reportOnPc')}
                    testID="pc-only-report"
                />
            ) : null}
        </>
    );
}

/** The agent's own crash, or a turn it ended, names its log folder: its log is offered, not the model server's. */
export function offersAgentLog(message: Message): boolean {
    const { endedBy } = savedActivity(message);
    const isError = message.failed === true || isErrorContent(message.content);
    return (isError || endedBy !== null) && namesAgentLog(endedBy ?? message.content);
}

/** The turn's own text sits under the cause notice, above Details and the buttons: the agent's crash, or any failed reply with a notice. */
export function showsTextBelowNotice(message: Message, fixShownBelow: boolean): boolean {
    return offersAgentLog(message) || (!fixShownBelow && (message.failed === true || isErrorContent(message.content)));
}

/** What a saved reply that looks like an error needs beside it, decided as the web UI's message bubble does. */
export function SavedReplyErrors({ message, fixShownBelow = false, latest = false, body }: { message: Message; fixShownBelow?: boolean; latest?: boolean; body?: ReactNode }) {
    const t = useT();
    const { retry, busy, readOnly } = useMessageActionsContext();
    const [retryFailure, setRetryFailure] = useState<{ text: string; detail?: string } | null>(null);
    const isError = message.failed === true || isErrorContent(message.content);
    const local = useSession(message.session_id).data?.inference_remote === false;
    const agentLog = useMemo(() => offersAgentLog(message), [message]);
    const showLog = local && isError && !agentLog;
    const showReport = failureRecordId(message.content) !== null;
    const turn = useMemo(() => (isError && !fixShownBelow ? failedTurnOf(message.content) : null), [isError, fixShownBelow, message.content]);
    if (!isError && !showLog && !agentLog && !showReport) return null;
    const titleKey = turn ? causeTitleKey(turn) : null;
    const tryAgain = () => {
        setRetryFailure(null);
        retry?.(message.id).catch((err: unknown) => setRetryFailure(describeHttpFailure(err, t)));
    };
    const ownsRetry = ownsTryAgain(message, { fixShownBelow, latest, busy, readOnly });
    return (
        <Stack gap="sm">
            {isError && !fixShownBelow ? <ErrorBanner title={titleKey ? t(titleKey) : undefined} /> : null}
            {body}
            {turn?.raw ? <FailedLead turn={turn} content={message.content} /> : null}
            {retryFailure ? <Notice tone="danger" message={retryFailure.text} detail={retryFailure.detail} testID="failed-retry-error" /> : null}
            {ownsRetry ? (
                <Row gap="sm" wrap stack>
                    <Button size="sm" icon={RotateCcw} label={t('msg.tryAgain')} onPress={tryAgain} testID="try-again" />
                </Row>
            ) : null}
            {turn ? <OpenSettingsButtons turn={turn} /> : null}
            {agentLog ? (
                <Row gap="sm" wrap stack>
                    <Button size="sm" variant="secondary" icon={ScrollText} label={t('logs.agentLog')} onPress={() => router.push({ pathname: '/logs', params: { source: 'agent' } })} testID="agent-log" />
                </Row>
            ) : null}
            {showLog ? (
                <Row gap="sm" wrap stack>
                    <Button size="sm" variant="secondary" icon={ScrollText} label={t('logs.serverLog')} onPress={() => router.push('/logs')} testID="server-log" />
                </Row>
            ) : null}
            <PcOnlyFailureLines showLog={false} showReport={showReport} />
            {offersAgentRecovery(message, ownsRetry) ? <ChatAgentRecovery onTryAgain={tryAgain} /> : null}
        </Stack>
    );
}

/** The newest failed reply carries its own Try again, between its cause and its Settings buttons; the tail leaves it out. */
export function ownsTryAgain(
    message: Message,
    state: { fixShownBelow: boolean; latest: boolean; busy: boolean; readOnly?: boolean },
): boolean {
    return (message.failed === true || isErrorContent(message.content)) && !state.fixShownBelow && state.latest && !state.busy && !state.readOnly;
}

function PolicyNotice({ alert }: { alert: NonNullable<TurnTail['policyAlert']> }) {
    const t = useT();
    const [dismissed, setDismissed] = useState<number | null>(null);
    if (dismissed === alert.seq) return null;
    return (
        <Stack gap="sm" testID="policy-notice">
            <Notice
                tone="warning"
                message={t('chat.policyBlocked', { tool: alert.tool || t('activity.policy.unknownTool') })}
                action={{ label: t('banner.dismiss'), onPress: () => setDismissed(alert.seq) }}
            />
            {alert.receiptId ? (
                <Button variant="secondary" size="sm" label={t('chat.policyViewReceipt')} onPress={() => openPolicyReceipts(alert.receiptId)} testID="policy-view-receipt" />
            ) : (
                <Text role="label" tone="secondary">
                    {t('activity.policy.receiptUnavailable')}
                </Text>
            )}
        </Stack>
    );
}

/** "Unexpected error? Report it on GitHub", the link the web UI appends to an unclassified error. */
function ReportLink({ title }: { title: string }) {
    const t = useT();
    const [failure, setFailure] = useState<string | null>(null);
    const open = () => {
        setFailure(null);
        openLink(phoneBugReportUrl(title), { inApp: true }).catch((err: unknown) => setFailure(describeError(err, t)));
    };
    return (
        <Stack gap="xs">
            <Row gap="sm" wrap align="center">
                <Text role="label" tone="secondary">
                    {t('chatError.unexpected')}
                </Text>
                <Button variant="ghost" size="sm" label={t('chatError.report')} onPress={open} testID="report-github" />
            </Row>
            {failure ? <Text role="label" tone="danger">{failure}</Text> : null}
        </Stack>
    );
}

/** What a failed or blocked turn needs under its reply: the banner, the model-server fix, the policy notice and the PC-only lines. */
export function TailIssues({ tail, local }: { tail: TurnTail; local: boolean }) {
    const t = useT();
    const { error, policyAlert } = tail;
    const ended = !tail.live;
    const serverDown = ended && tail.failure === 'model_server_down';
    // The model-server fix names the failure; "Something went wrong" beside it would say it twice.
    const banner = !!tail.errorBanner && !serverDown;
    const report = !!error && chatErrorInfo(error, t).kind !== 'stream';
    const showLog = ended && local && !!tail.failedReply && !tail.shownOnReply;
    const showReportNote = ended && !!error && namesFailureRecord(error);
    if (!banner && !serverDown && !policyAlert && !report && !showLog && !showReportNote) return null;
    return (
        <Stack gap="sm" paddingX="lg" paddingY="xs">
            {banner ? <ErrorBanner /> : null}
            {serverDown ? <ModelServerDownNotice /> : null}
            {policyAlert ? <PolicyNotice alert={policyAlert} /> : null}
            {error && report ? <ReportLink title={reportTitle(error)} /> : null}
            <PcOnlyFailureLines showLog={showLog} showReport={showReportNote} />
        </Stack>
    );
}

/** A failed saved reply whose text is the server's error: the card shows the cause and Details instead of it. */
export const showsFailedLead = (message: Message, fixShownBelow: boolean): boolean =>
    !fixShownBelow && (message.failed === true || isErrorContent(message.content)) && failedTurnOf(message.content).raw;
