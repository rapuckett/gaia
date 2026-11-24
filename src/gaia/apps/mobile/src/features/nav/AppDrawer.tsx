// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { useDrawerStatus, type DrawerContentComponentProps } from 'expo-router/drawer';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { queryKeys, useActiveRuns } from '@/data';
import { ChatDrawerContent } from '@/features/chats/ChatDrawerContent';
import { useComposerQueueStore } from '@/features/composer/composerQueue';
import { useChatStreamStore } from '@/state/chatStreams';
import { useTheme } from '@/ui';

import { useIsPermanentDrawer } from './ScreenHeader';
import { activeChatId, liveRunsFromTurns, openChat, openNewChat } from './navigation';

export function AppDrawer({ navigation, state }: DrawerContentComponentProps) {
    const router = useRouter();
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const drawerStatus = useDrawerStatus();
    useEffect(() => {
        if (drawerStatus === 'open') void queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    }, [drawerStatus, queryClient]);
    // Rotating into the permanent sidebar must not leave an overlay open for when it rotates back.
    const permanent = useIsPermanentDrawer();
    useEffect(() => {
        if (permanent) navigation.closeDrawer();
    }, [permanent, navigation]);
    const turns = useChatStreamStore((s) => s.turns);
    const active = useActiveRuns().data;
    const live = useMemo(() => liveRunsFromTurns(turns, active), [turns, active]);
    const queues = useComposerQueueStore((s) => s.byChat);
    const { colors } = useTheme();
    // The divider faces the main pane; navigation.ts clears the navigator's own, whose colour and side ignore our theme.
    return (
        <View
            testID="app-sidebar"
            style={[{ flex: 1 }, permanent && { borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: colors.border }]}
        >
            <ChatDrawerContent
                activeId={activeChatId(pathname)}
                live={live}
                queues={queues}
                routeNames={state.routeNames}
                activeRoute={pathname.split('/')[1] || null}
                onOpenRoute={(route) => {
                    router.push(`/${route}`);
                    navigation.closeDrawer();
                }}
                onSelect={(id) => {
                    openChat(router, id);
                    navigation.closeDrawer();
                }}
                onNewChat={() => {
                    openNewChat(router);
                    navigation.closeDrawer();
                }}
                onPcs={() => {
                    router.push('/pair/pcs');
                    navigation.closeDrawer();
                }}
                onClose={permanent ? undefined : () => navigation.closeDrawer()}
            />
        </View>
    );
}
