// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useConnectionStore } from './connection';
import { useLastChatStore } from './lastChat';
import { writeNewChatDraft } from './newChatDraft';

describe('the saved new-chat draft at launch', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        useConnectionStore.getState().setConnection({ baseUrl: 'https://192.168.1.20:4243', pcId: 'pc-a' });
        useLastChatStore.setState({ loaded: false, lastChatId: null, choseNewChat: false, hasNewChatDraft: false });
    });

    it('is read with the last chat, and forgotten once the box is emptied', async () => {
        writeNewChatDraft('pc-a', 'Draft a status update');
        await useLastChatStore.getState().load();
        expect(useLastChatStore.getState().hasNewChatDraft).toBe(true);

        writeNewChatDraft('pc-a', '');
        useLastChatStore.setState({ loaded: false });
        await useLastChatStore.getState().load();
        expect(useLastChatStore.getState().hasNewChatDraft).toBe(false);
    });

    it("doesn't read another PC's draft, and reads it even when the last-chat read fails", async () => {
        writeNewChatDraft('pc-a', 'for A');
        useConnectionStore.getState().setConnection({ baseUrl: 'https://192.168.1.30:4243', pcId: 'pc-b' });
        await useLastChatStore.getState().load();
        expect(useLastChatStore.getState().hasNewChatDraft).toBe(false);

        useConnectionStore.getState().setConnection({ baseUrl: 'https://192.168.1.20:4243', pcId: 'pc-a' });
        useLastChatStore.setState({ loaded: false });
        jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key) => {
            if (key === 'gaia:last-session') throw new Error('unreadable');
            return 'for A';
        });
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        await useLastChatStore.getState().load();
        expect(useLastChatStore.getState().hasNewChatDraft).toBe(true);
        jest.restoreAllMocks();
    });
});
