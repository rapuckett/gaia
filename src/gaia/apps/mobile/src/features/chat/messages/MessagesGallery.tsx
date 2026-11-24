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
export type MessagesGalleryState = MessagesFixture | StartOpen | 'images-one' | 'images-four' | 'images-viewer' | 'images-long' | 'images-failed' | 'images-failed-viewer' | 'guided' | 'guided-sets' | 'prescan-dismissing' | 'prescan-done';

const LONG_NAME = 'scan-of-the-quarterly-board-report-final-version-2.png';
const IMAGE_NAMES = ['harbor-sunrise.jpg', 'receipt-scan.png', 'whiteboard.jpg', 'plant-label.png'];

const PNG_TILES = [
    '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',
];
const FAILING_NAME = IMAGE_NAMES[2];

// Made-up pictures: tiny solid PNGs (iOS cannot draw SVG), so no real photo ships in the scene.
const pictureFor = (failOne: boolean) => (path: string) => {
    const name = decodeURIComponent(path.split('/').pop() ?? '');
    if (name === FAILING_NAME && failOne) return Promise.reject(new Error('Dev scene: this image is made to fail'));
    const base64 = PNG_TILES[Math.max(0, IMAGE_NAMES.indexOf(name))];
    return Promise.resolve({ uri: `data:image/png;base64,${base64}`, mime: 'image/png', base64: '' });
};

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
    if (state === 'images-one' || state === 'images-four' || state === 'images-viewer' || state === 'images-long' || state === 'images-failed' || state === 'images-failed-viewer') {
        const message = IMAGE_MESSAGE(state === 'images-one' ? 1 : 4);
        return (
            <UploadedImageLoaderContext.Provider value={pictureFor(state.startsWith('images-failed'))}>
                <Screen>
                    <UserBubble message={message} />
                    {state === 'images-viewer' || state === 'images-long' || state === 'images-failed-viewer' ? (
                        <ImageViewer
                            images={IMAGE_NAMES.map((name, i) => ({ name: state === 'images-long' && i === 1 ? LONG_NAME : name, url: `/api/files/uploads/${name}`, isImage: true }))}
                            index={state === 'images-failed-viewer' ? 2 : 1}
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
    const tail = state.startsWith('failed-') || state.startsWith('cutoff-') ? buildTail(fixture.messages, IDLE) : null;
    const policyTail = { live: false, text: '', events: [], replyId: null, canTryAgain: false, canContinue: false, policyAlert: { tool: 'delete_file', seq: 1, ...(state === 'policy-receipt' ? { receiptId: 'rcpt-4f2a' } : {}) } };
    return (
        <Screen>
            <MessageListView
                messages={fixture.messages}
                loading={state === 'loading'}
                live={tail ? <TurnTail tail={state.startsWith('failed-') ? { ...tail, canTryAgain: false } : tail} line={null} onTryAgain={noop} onContinue={noop} /> : state === 'policy' || state === 'policy-receipt' ? <TailIssues tail={policyTail} local={false} /> : fixture.live ? <AssistantBubble message={fixture.live} streaming /> : fixture.events ? (
                          <Stack paddingX="gutter">
                              <RecordingProgress events={fixture.events} />
                          </Stack>
                      ) : undefined}
            />
        </Screen>
    );
}
