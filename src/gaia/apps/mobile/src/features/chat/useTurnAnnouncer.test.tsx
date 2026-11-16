// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { Message } from '@/api/client.types';
import type { ChatStream } from '@/data';

import { useTurnAnnouncer } from './useTurnAnnouncer';

jest.mock('@/i18n/useT', () => ({ useT: () => (key: string) => key }));

const reply = (id: number, extra: Partial<Message> = {}) => ({ id, role: 'assistant', content: 'Hi', ...extra }) as unknown as Message;
const stream = (extra: Partial<ChatStream> = {}) =>
    ({ status: 'idle', error: null, failed: undefined, stopState: undefined, ...extra }) as unknown as ChatStream;

describe('useTurnAnnouncer', () => {
    let announce: jest.SpyInstance;
    beforeEach(() => {
        announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    });
    afterEach(() => announce.mockRestore());

    const run = async (props: { s: ChatStream; saved: Message[] }, next: { s: ChatStream; saved: Message[] }) => {
        const hook = await renderHook((p: typeof props) => useTurnAnnouncer(p.s, p.saved), { initialProps: props });
        await hook.rerender(next);
        return hook;
    };

    it('says once when a new reply arrives, and not while it streams', async () => {
        const start = { s: stream(), saved: [] as Message[] };
        const hook = await renderHook((p: typeof start) => useTurnAnnouncer(p.s, p.saved), { initialProps: start });
        await hook.rerender({ s: stream({ status: 'streaming' as ChatStream['status'] }), saved: [] });
        expect(announce).not.toHaveBeenCalled();
        await hook.rerender({ s: stream(), saved: [reply(1)] });
        expect(announce).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledWith('live.replyReady');
    });

    it('says the failure line when the turn failed', async () => {
        await run(
            { s: stream({ status: 'streaming' as ChatStream['status'] }), saved: [] },
            { s: stream({ failed: true }), saved: [reply(1)] },
        );
        expect(announce).toHaveBeenCalledWith('live.replyFailed');
    });

    it('stays quiet for a stopped turn and for a turn with no new reply', async () => {
        await run(
            { s: stream({ status: 'streaming' as ChatStream['status'] }), saved: [reply(1)] },
            { s: stream({ stopState: 'stopped' as ChatStream['stopState'] }), saved: [reply(2)] },
        );
        await run(
            { s: stream({ status: 'streaming' as ChatStream['status'] }), saved: [reply(1)] },
            { s: stream(), saved: [reply(1)] },
        );
        expect(announce).not.toHaveBeenCalled();
    });
});
