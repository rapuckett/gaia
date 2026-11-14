// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useChatStream, useSession } from '@/data';
import { Composer } from '@/features/composer';
import { ScreenHeader } from '@/features/nav/ScreenHeader';
import { describeError, useT } from '@/i18n/useT';
import { ErrorState, Notice, Screen, Text } from '@/ui';

// The streaming view proper (messages, activity, prompts) replaces the live text below.
export function ChatScreen({ sessionId }: { sessionId: string }) {
    const t = useT();
    const session = useSession(sessionId);
    const stream = useChatStream(sessionId);
    const running = stream.status !== 'idle';

    return (
        <Screen
            keyboard="avoid"
            scroll
            header={<ScreenHeader title={session.data?.title} />}
            footer={<Composer onSend={stream.send} onStop={stream.stop} running={running} />}
        >
            {session.isError ? (
                <ErrorState title={describeError(session.error, t)} onRetry={() => void session.refetch()} />
            ) : null}
            {stream.error ? <Notice tone="danger" message={describeError(stream.error, t)} /> : null}
            {stream.liveText ? <Text>{stream.liveText}</Text> : null}
        </Screen>
    );
}
