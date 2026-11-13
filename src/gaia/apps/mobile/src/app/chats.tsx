// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatDrawerContent } from '@/features/chats/ChatDrawerContent';

export default function Chats() {
    const router = useRouter();
    const { active } = useLocalSearchParams<{ active?: string }>();
    return (
        <ChatDrawerContent
            activeId={active ?? null}
            onSelect={(id) => router.replace({ pathname: '/chat/[id]', params: { id } })}
            onClose={() => router.back()}
        />
    );
}
