// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { usePathname, useRouter } from 'expo-router';
import { useMemo } from 'react';

import { ChatDrawerContent } from '@/features/chats/ChatDrawerContent';
import { useChatStreamStore } from '@/state/chatStreams';

import { activeChatId, liveRunsFromTurns, openChat, openNewChat } from './navigation';

// Queues are empty until the composer queue is wired to the drawer.
const NO_QUEUES = {};

export function AppDrawer({ navigation }: DrawerContentComponentProps) {
    const router = useRouter();
    const pathname = usePathname();
    const turns = useChatStreamStore((s) => s.turns);
    const live = useMemo(() => liveRunsFromTurns(turns), [turns]);
    return (
        <ChatDrawerContent
            activeId={activeChatId(pathname)}
            live={live}
            queues={NO_QUEUES}
            onSelect={(id) => {
                openChat(router, id);
                navigation.closeDrawer();
            }}
            onNewChat={() => {
                openNewChat(router);
                navigation.closeDrawer();
            }}
            onClose={() => navigation.closeDrawer()}
        />
    );
}
