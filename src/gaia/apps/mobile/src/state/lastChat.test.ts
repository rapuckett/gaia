// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useLastChatStore } from './lastChat';
import { writeNewChatDraft } from './newChatDraft';

describe('the saved new-chat draft at launch', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        useLastChatStore.setState({ loaded: false, lastChatId: null, choseNewChat: false, hasNewChatDraft: false });
    });

    it('is read with the last chat, and forgotten once the box is emptied', async () => {
        writeNewChatDraft('Draft a status update');
        await useLastChatStore.getState().load();
        expect(useLastChatStore.getState().hasNewChatDraft).toBe(true);

        writeNewChatDraft('');
        useLastChatStore.setState({ loaded: false });
        await useLastChatStore.getState().load();
        expect(useLastChatStore.getState().hasNewChatDraft).toBe(false);
    });
});
