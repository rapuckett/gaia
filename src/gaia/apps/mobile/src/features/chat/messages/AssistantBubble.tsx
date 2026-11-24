// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isAuthRequiredMessage } from '@webui/utils/connectorRetry.core';
import { cardsFromSteps } from '@webui/utils/renderCards.core';
import { cleanToolCallContent } from '@webui/utils/toolCallContent';
import { SERVER_CANCELLED_TEXT, splitCutOff } from '@webui/utils/turnEnding.core';

import type { Message } from '@/api/client.types';
import { useMemo } from 'react';

import { useSpeechSettings } from '@/data';
import { useT } from '@/i18n/useT';
import { IconButton, Pressable, Row, Stack } from '@/ui';
import { Check, Copy, Ellipsis, RotateCcw, Square, Volume2 } from '@/ui/icons';
import { ReadAloudButton, ReadAloudErrorNotice, ReadAloudNote, useReadAloud } from '@/features/audio/ReadAloud';
import { readAloudId } from '@/features/audio/useChatReadAloud';

import { TurnChanges } from '../changes/TurnChanges';
import { ActivityTimeline } from '../activity/ActivityTimeline';
import { AnswerFooter } from '../activity/AnswerFooter';
import { savedActivity } from '../activity/savedActivity';
import { AnswerCards } from '../cards/RenderCard';
import { EmailConnect } from '../EmailConnect';
import { LibraryNotices, libraryNoticesOf } from '../LibraryNotices';
import { GrantNote, isAgentNotGranted } from '../GrantNote';
import { CutOffNote, StoppedNote } from '../EndingNotes';
import { Markdown } from '../markdown/Markdown';
import { SavedReplyErrors, showsFailedLead } from '../ReplyErrors';
import { AnswerComparison } from '../compare/AnswerComparison';
import { useAnswerComparison } from '../compare/useAnswerComparison';
import { useMessageActions, type MessageContext } from './useMessageActions';

export interface AssistantBubbleProps {
    message: Message;
    /** The answer is still being written: the row stays hidden. */
    streaming?: boolean;
    /** How long the reply took, from the question before it. */
    latencyMs?: number;
    context?: MessageContext;
    /** The chat the answer is in; without it the answer shows no file changes. */
    sessionId?: string;
    /** The newest answer, which alone reports a failed read of the chat's file changes. */
    newest?: boolean;
    /** The model-server fix under the chat explains this reply's failure. */
    fixShownBelow?: boolean;
}

// A reply with links stays walkable by element; plain prose reads as one block with its actions.
const hasLinks = (text: string) => /\]\(|https?:|`|\[/.test(text);

export function AssistantBubble({ message, streaming = false, latencyMs, context, sessionId, newest = false, fixShownBelow = false }: AssistantBubbleProps) {
    const t = useT();
    const cutOff = streaming ? null : splitCutOff(message.content);
    const cancelled = message.content.trim() === SERVER_CANCELLED_TEXT;
    const text = cancelled ? '' : cutOff ? cutOff.body : message.content;
    const activity = useMemo(() => savedActivity(message), [message]);
    const cards = message.cards ?? cardsFromSteps(message.agentSteps);
    const spoken = useMemo(() => cleanToolCallContent(text, false), [text]);
    const speakId = readAloudId(message);
    const readAloud = useReadAloud(speakId, spoken);
    const speechAvailable = useSpeechSettings().data?.available !== false;
    const readable = !streaming && !cancelled && !activity.isError && spoken.trim() !== '';
    const actions = useMessageActions(
        message,
        text,
        context,
        undefined,
        readable && speechAvailable ? [{ label: readAloud.label, icon: readAloud.active ? Square : Volume2, onPress: readAloud.toggle }] : undefined,
    );
    const compare = useAnswerComparison(message.session_id);
    return (
        <Stack paddingX="lg" paddingY="xs">
            {!streaming && !cancelled ? <LibraryNotices notices={libraryNoticesOf(message)} /> : null}
            {activity.steps.length > 0 ? <ActivityTimeline steps={activity.steps} answer={text} /> : null}
            <AnswerCards cards={cards} />
            <Pressable
                onLongPress={cancelled ? undefined : actions.openSheet}
                accessibilityRole="text"
                accessible={!hasLinks(text)}
                minSize={0}
                {...(cancelled ? {} : actions.a11y)}
            >
                {text && !(!streaming && showsFailedLead(message, fixShownBelow)) ? <Markdown text={text} streaming={streaming} /> : null}
            </Pressable>
            {!streaming && !cancelled ? <AnswerFooter latencyMs={latencyMs} stats={message.stats} ended={activity.ended} /> : null}
            {sessionId && !streaming && !cancelled && message.id > 0 ? (
                <TurnChanges sessionId={sessionId} messageId={message.id} reportError={newest} />
            ) : null}
            {cutOff ? <CutOffNote cutOff={cutOff} /> : null}
            {cancelled ? <StoppedNote stop={{ state: 'stopped' }} /> : null}
            {!streaming && !cancelled ? <SavedReplyErrors message={message} fixShownBelow={fixShownBelow} latest={!!context?.latest} /> : null}
            {!streaming && !cancelled && isAgentNotGranted(spoken) ? <GrantNote /> : null}
            {!streaming && !cancelled && !isAgentNotGranted(spoken) && isAuthRequiredMessage(spoken) ? <EmailConnect content={spoken} /> : null}
            {!streaming && !cancelled ? (
                <Row>
                    {readable && speechAvailable ? <ReadAloudButton control={readAloud} /> : null}
                    <IconButton
                        icon={actions.copied ? Check : Copy}
                        label={actions.copied ? t('msg.copiedAria') : t('msg.copy')}
                        size="sm"
                        onPress={actions.copy}
                    />
                    {actions.regenerate ? (
                        <IconButton icon={RotateCcw} label={t('msg.tryAgain')} size="sm" onPress={actions.regenerate} testID="regenerate" />
                    ) : null}
                    <IconButton icon={Ellipsis} label={t('msg.actions')} size="sm" onPress={actions.openSheet} />
                </Row>
            ) : null}
            <ReadAloudNote messageId={speakId} />
            <ReadAloudErrorNotice messageId={speakId} />
            {actions.notice}
            {actions.sheet}
            {compare.comparison?.messageId === message.id ? (
                <AnswerComparison
                    original={message}
                    originalModel={message.stats?.model}
                    originalLatencyMs={latencyMs}
                    comparison={compare.comparison}
                    onKeep={(which) => void compare.keep(which)}
                    onClose={compare.close}
                />
            ) : null}
        </Stack>
    );
}
