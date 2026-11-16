// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { router } from 'expo-router';

import { setNotificationFilter } from '@/state/notifications';

type Href = { pathname: '/notifications'; params: { receipt?: string } };

/** "View receipt": the notification center, filtered to policy alerts and scrolled to that block's receipt, as the web UI opens it. */
export function openPolicyReceipts(receiptId?: string, nav: { push(href: Href): void } = router): void {
    setNotificationFilter('policy_alert');
    nav.push({ pathname: '/notifications', params: receiptId ? { receipt: receiptId } : {} });
}
