// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/data';
import { ChatScreen } from '@/features/chat/ChatScreen';
import { leaveMissingChat } from '@/features/nav/launch';

export default function ChatRoute() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { error } = useSession(id);
    useEffect(() => {
        if (error) leaveMissingChat(error, router);
    }, [error, router]);
    return <ChatScreen sessionId={id} />;
}
