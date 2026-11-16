// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { router } from 'expo-router';

import { setNotificationFilter } from '@/state/notifications';

/** "View receipt": the notification center, filtered to policy alerts, as the web UI opens it. */
export function openPolicyReceipts(nav: { push(href: '/notifications'): void } = router): void {
    setNotificationFilter('policy_alert');
    nav.push('/notifications');
}
