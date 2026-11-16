// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useLocalSearchParams, useRouter } from 'expo-router';

import { openChat } from '@/features/nav/navigation';
import { NotificationCenterScreen } from '@/features/notifications';

export default function Notifications() {
    const router = useRouter();
    const { receipt } = useLocalSearchParams<{ receipt?: string }>();
    return (
        <NotificationCenterScreen
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            onOpenChat={(id) => openChat(router, id)}
            receiptId={receipt}
        />
    );
}
