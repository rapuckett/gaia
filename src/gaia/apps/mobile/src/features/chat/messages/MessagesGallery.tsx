// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { AssistantBubble } from './AssistantBubble';
import { MessageListView } from './MessageList';
import { FIXTURES, type MessagesFixture } from './__fixtures__/messages';
import { Screen } from '@/ui';

/** Developer gallery of the message list in each state; not part of the shipped screens. */
export function MessagesGallery({ state }: { state: MessagesFixture }) {
    const fixture = FIXTURES[state];
    return (
        <Screen>
            <MessageListView
                messages={fixture.messages}
                loading={state === 'loading'}
                live={fixture.live ? <AssistantBubble message={fixture.live} streaming /> : undefined}
            />
        </Screen>
    );
}
