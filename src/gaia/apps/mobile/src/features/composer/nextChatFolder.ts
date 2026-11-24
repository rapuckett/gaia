// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { create } from 'zustand';

interface NextChatFolderState {
    /** The folder picked for the chat New chat is about to create (the web UI's `draftFolder`), given to it as it is made. */
    path: string | null;
    set(path: string | null): void;
}

export const useNextChatFolder = create<NextChatFolderState>((set) => ({
    path: null,
    set: (path) => set({ path }),
}));
