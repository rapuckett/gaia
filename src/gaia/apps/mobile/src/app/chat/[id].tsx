// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useLocalSearchParams } from 'expo-router';

import { AppErrorBoundary } from '@/features/errors/AppErrorBoundary';
import { ChatScreen } from '@/features/chat/ChatScreen';

export default function ChatRoute() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return (
        <AppErrorBoundary resetKey={id}>
            <ChatScreen sessionId={id} />
        </AppErrorBoundary>
    );
}
