// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { AssistantBubble } from './AssistantBubble';
import { MessageListView } from './MessageList';
import { ImageViewer } from './ImageViewer';
import { UploadedImageLoaderContext } from './uploadedImage';
import { UserBubble } from './UserBubble';
import type { StartOpen } from './useMessageActions';
import { TailIssues } from '../ReplyErrors';
import { buildTail } from '../tailState';
import { TurnTail } from '../TurnTail';
import { RecordingProgress } from '../recording/RecordingProgress';
import { EmailPreScanCard } from '../cards/EmailPreScanCard';
import { GuideCard } from '../cards/GuideCard';
import { FIXTURES, GUIDE_SETS, GUIDE_WORKOUT, PRESCAN_PAYLOAD, type MessagesFixture } from './__fixtures__/messages';
import type { Message } from '@/api/client.types';
import { Screen, Stack } from '@/ui';

const noop = () => undefined;
const IDLE = { status: 'idle', liveText: '', events: [], error: null, failed: undefined, failure: undefined, policyAlert: undefined, stopState: undefined, stopError: undefined } as const;

/** Developer gallery of the message list in each state; not part of the shipped screens. */
export type MessagesGalleryState = MessagesFixture | StartOpen | 'images-one' | 'images-four' | 'images-viewer' | 'guided' | 'guided-sets' | 'prescan-dismissing' | 'prescan-done';

const IMAGE_NAMES = ['harbor-sunrise.jpg', 'receipt-scan.png', 'whiteboard.jpg', 'plant-label.png'];

// Made-up pictures: a tinted gradient with the file's first letter, so no real photo ships in the scene.
function pictureFor(path: string) {
    const name = decodeURIComponent(path.split('/').pop() ?? '');
    const hue = (IMAGE_NAMES.indexOf(name) + 1) * 70;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,45%)"/><stop offset="1" stop-color="hsl(${hue + 40},55%,22%)"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/><text x="240" y="210" font-size="120" text-anchor="middle" fill="white" fill-opacity="0.8" font-family="sans-serif">${name.charAt(0).toUpperCase()}</text></svg>`;
    const uri = `data:image/svg+xml;base64,${btoa(svg)}`;
    return Promise.resolve({ uri, mime: 'image/svg+xml', base64: '' });
}

const IMAGE_MESSAGE = (count: number): Message => ({
    id: 900 + count,
    session_id: 'dev',
    role: 'user',
    content: [
        count === 1 ? 'What does this label say?' : 'Which of these should I file under receipts?',
        ...IMAGE_NAMES.slice(0, count).map((n) => `![${n}](/api/files/uploads/${n})`),
    ].join('\n'),
    created_at: '2026-11-13T14:05:09Z',
    rag_sources: null,
});

export function MessagesGallery({ state }: { state: MessagesGalleryState }) {
    if (state === 'actions' || state === 'delete' || state === 'edit' || state === 'drop') {
        const [question] = FIXTURES.short.messages;
        return (
            <Screen>
                <UserBubble message={question} context={{ laterTurns: 2 }} startOpen={state} />
            </Screen>
        );
    }
    if (state === 'images-one' || state === 'images-four' || state === 'images-viewer') {
        const message = IMAGE_MESSAGE(state === 'images-one' ? 1 : 4);
        return (
            <UploadedImageLoaderContext.Provider value={pictureFor}>
                <Screen>
                    <UserBubble message={message} />
                    {state === 'images-viewer' ? (
                        <ImageViewer
                            images={IMAGE_NAMES.map((name) => ({ name, url: `/api/files/uploads/${name}`, isImage: true }))}
                            index={1}
                            onIndex={noop}
                            onClose={noop}
                        />
                    ) : null}
                </Screen>
            </UploadedImageLoaderContext.Provider>
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
    const tail = state === 'failed-report' || state.startsWith('cutoff-') ? buildTail(fixture.messages, IDLE) : null;
    const policyTail = { live: false, text: '', events: [], replyId: null, canTryAgain: false, canContinue: false, policyAlert: { tool: 'delete_file', seq: 1, ...(state === 'policy-receipt' ? { receiptId: 'rcpt-4f2a' } : {}) } };
    return (
        <Screen>
            <MessageListView
                messages={fixture.messages}
                loading={state === 'loading'}
                live={tail ? <TurnTail tail={tail} line={null} onTryAgain={noop} onContinue={noop} /> : state === 'policy' || state === 'policy-receipt' ? <TailIssues tail={policyTail} local={false} /> : fixture.live ? <AssistantBubble message={fixture.live} streaming /> : fixture.events ? (
                          <Stack paddingX="gutter">
                              <RecordingProgress events={fixture.events} />
                          </Stack>
                      ) : undefined}
            />
        </Screen>
    );
}
