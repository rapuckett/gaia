// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { MessageKey } from '@webui/i18n/registry';

import type { Translate } from '@/i18n/useT';

import type { ConfirmRequest } from '../setup/sheets/setupConfirm';

/** What turning System discovery on asks, shared by the Advanced switch and the profile scans. */
export const DISCOVERY_CONFIRM: { title: MessageKey; description: MessageKey; bullets: MessageKey[] } = {
    title: 'mem.beta.discovery.title',
    description: 'mem.beta.discovery.desc',
    bullets: ['mem.beta.discovery.collects', 'mem.beta.discovery.scans', 'mobileApp.mem.beta.discovery.local'],
};

/** The sheet a scan opens while consent is off: turning discovery on and starting the scan are one choice. */
export function discoveryScanRequest(t: Translate): ConfirmRequest {
    return {
        title: t(DISCOVERY_CONFIRM.title),
        body: [t(DISCOVERY_CONFIRM.description), ...DISCOVERY_CONFIRM.bullets.map((key) => `• ${t(key)}`)],
        note: t('mobileApp.mem.beta.discovery.audit'),
        confirmLabel: t('mem.beta.discovery.confirmScan'),
        cancelLabel: t('mem.cancel'),
    };
}
