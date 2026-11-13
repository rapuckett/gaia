// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useLocalSearchParams } from 'expo-router';

import { ChatScreen } from '@/features/chat/ChatScreen';

export default function ChatRoute() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return <ChatScreen sessionId={id} />;
}
