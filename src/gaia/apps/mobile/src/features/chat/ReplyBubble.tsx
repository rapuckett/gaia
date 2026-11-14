// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT, type Translate } from '@/i18n/useT';
import { Button, Icon, Notice, Row, Spinner, Stack, Text } from '@/ui';
import { RotateCcw, Square } from '@/ui/icons';

import { Markdown } from './markdown/Markdown';
import { chatErrorText, requestFailureText } from './chatErrors';
import type { ChatRow, Stop } from './rows';

type Reply = Extract<ChatRow, { kind: 'reply' }>;

function stopText(stop: Stop, t: Translate): string {
    if (stop.state === 'unconfirmed') return t('msg.stoppedUnconfirmed');
    return stop.error ? t('msg.stoppedError', { error: requestFailureText(stop.error, t) }) : t('msg.stopped');
}

export interface ReplyBubbleProps {
    reply: Reply;
    /** What the agent is doing now, or null for "Thinking...". Only used while the reply is live. */
    line: string | null;
    onTryAgain(): void;
    onContinue(): void;
}

export function ReplyBubble({ reply, line, onTryAgain, onContinue }: ReplyBubbleProps) {
    const t = useT();
    const showLine = reply.live && (line !== null || !reply.text);
    return (
        <Stack gap="sm" paddingX="lg" testID={`reply-${reply.key}`}>
            {reply.text ? <Markdown text={reply.text} streaming={reply.live} /> : null}
            {showLine ? (
                <Row gap="sm" accessibilityRole="progressbar">
                    <Spinner size="sm" />
                    <Text role="label" tone="secondary" numberOfLines={1} testID="live-line">
                        {line ?? t('msg.thinking')}
                    </Text>
                </Row>
            ) : null}
            {reply.cutOff ? (
                <Text role="label" tone="secondary">
                    {t.compose((say) =>
                        reply.cutOff?.tools
                            ? `${say('msg.cutOff.toolsRan', { tools: reply.cutOff.tools })} ${say(reply.cutOff.notice)}`
                            : say(reply.cutOff!.notice),
                    )}
                </Text>
            ) : null}
            {reply.error ? <Notice tone="danger" message={chatErrorText(reply.error, t)} testID="reply-error" /> : null}
            {reply.stop ? (
                <Row gap="sm" align="start" accessibilityRole="text" testID="stopped-note">
                    <Icon icon={Square} size="sm" tone="secondary" />
                    <Stack flex={1}>
                        <Text role="label" tone="secondary">
                            {stopText(reply.stop, t)}
                        </Text>
                    </Stack>
                </Row>
            ) : null}
            {reply.canContinue || reply.canTryAgain ? (
                <Row gap="sm" wrap>
                    {reply.canContinue ? <Button size="sm" label={t('msg.continue')} onPress={onContinue} testID="continue" /> : null}
                    {reply.canTryAgain ? (
                        <Button size="sm" icon={RotateCcw} label={t('msg.tryAgain')} onPress={onTryAgain} testID="try-again" />
                    ) : null}
                </Row>
            ) : null}
        </Stack>
    );
}
