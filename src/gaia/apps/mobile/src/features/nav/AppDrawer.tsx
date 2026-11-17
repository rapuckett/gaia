// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useQueryClient } from '@tanstack/react-query';
import { useDrawerStatus, type DrawerContentComponentProps } from 'expo-router/drawer';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { queryKeys } from '@/data';
import { ChatDrawerContent } from '@/features/chats/ChatDrawerContent';
import { useDirection } from '@/i18n/useT';
import { useChatStreamStore } from '@/state/chatStreams';
import { useTheme } from '@/ui';

import { useIsPermanentDrawer } from './ScreenHeader';
import { activeChatId, liveRunsFromTurns, openChat, openNewChat } from './navigation';

// Queues are empty until the composer queue is wired to the drawer.
const NO_QUEUES = {};

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
    const live = useMemo(() => liveRunsFromTurns(turns), [turns]);
    const { colors } = useTheme();
    // The divider goes on the side facing the main pane (inline-end of a start-side sidebar); the web navigator draws it on the outer edge in rtl, so navigation.ts clears that one.
    const dir = useDirection();
    const rtlDivider = permanent && Platform.OS === 'web' && dir === 'rtl';
    return (
        <View
            testID="app-sidebar"
            style={[{ flex: 1 }, rtlDivider && { borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: colors.border }]}
        >
            <ChatDrawerContent
                activeId={activeChatId(pathname)}
                live={live}
                queues={NO_QUEUES}
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
                onClose={() => navigation.closeDrawer()}
            />
        </View>
    );
}
