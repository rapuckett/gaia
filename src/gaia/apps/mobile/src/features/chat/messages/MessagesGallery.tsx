// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { AssistantBubble } from './AssistantBubble';
import { MessageListView } from './MessageList';
import { UserBubble } from './UserBubble';
import type { StartOpen } from './useMessageActions';
import { TailIssues } from '../ReplyErrors';
import { buildTail } from '../tailState';
import { TurnTail } from '../TurnTail';
import { RecordingProgress } from '../recording/RecordingProgress';
import { EmailPreScanCard } from '../cards/EmailPreScanCard';
import { GuideCard } from '../cards/GuideCard';
import { FIXTURES, GUIDE_SETS, GUIDE_WORKOUT, PRESCAN_PAYLOAD, type MessagesFixture } from './__fixtures__/messages';
import { Screen, Stack } from '@/ui';

const noop = () => undefined;
const IDLE = { status: 'idle', liveText: '', events: [] } as const;

/** Developer gallery of the message list in each state; not part of the shipped screens. */
export type MessagesGalleryState = MessagesFixture | StartOpen | 'guided' | 'guided-sets' | 'prescan-dismissing' | 'prescan-done';

export function MessagesGallery({ state }: { state: MessagesGalleryState }) {
    if (state === 'actions' || state === 'delete' || state === 'edit' || state === 'drop') {
        const [question] = FIXTURES.short.messages;
        return (
            <Screen>
                <UserBubble message={question} context={{ laterTurns: 2 }} startOpen={state} />
            </Screen>
        );
    }
    if (state === 'guided' || state === 'guided-sets') {
        return (
            <Screen>
                <GuideCard data={state === 'guided' ? GUIDE_WORKOUT : GUIDE_SETS} startGuided />
            </Screen>
        );
    }
    if (state === 'prescan-dismissing' || state === 'prescan-done') {
        return (
            <Screen>
                <Stack paddingX="gutter">
                    <EmailPreScanCard
                        data={{ ok: true, data: PRESCAN_PAYLOAD }}
                        startPending={state === 'prescan-dismissing' ? 'm1' : undefined}
                        startNotice={state === 'prescan-done'}
                    />
                </Stack>
            </Screen>
        );
    }
    const fixture = FIXTURES[state];
    const tail = state === 'failed-report' ? buildTail(fixture.messages, IDLE) : null;
    const policyTail = { live: false, text: '', events: [], replyId: null, canTryAgain: false, canContinue: false, policyAlert: { tool: 'delete_file', seq: 1, ...(state === 'policy-receipt' ? { receiptId: 'rcpt-4f2a' } : {}) } };
    return (
        <Screen>
            <MessageListView
                messages={fixture.messages}
                loading={state === 'loading'}
                live={tail ? <TurnTail tail={tail} line={null} onTryAgain={noop} onContinue={noop} /> : state === 'policy' || state === 'policy-receipt' ? <TailIssues tail={policyTail} local={false} /> : fixture.live ? <AssistantBubble message={fixture.live} streaming /> : fixture.events ? <RecordingProgress events={fixture.events} /> : undefined}
            />
        </Screen>
    );
}
