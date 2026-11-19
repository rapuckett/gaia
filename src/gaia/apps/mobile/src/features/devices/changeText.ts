// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { keepTogether } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';

import type { DeviceChange } from '@/api/client.types';

/** The kinds this app words; a newer PC may send others. */
const KEYS = {
    providerKeySet: 'settings.devices.change.providerKeySet',
    providerKeyRemoved: 'settings.devices.change.providerKeyRemoved',
    gatewayChanged: 'settings.devices.change.gatewayChanged',
    serverTarget: 'settings.devices.change.serverTarget',
    localOnlyOff: 'settings.devices.change.localOnlyOff',
    permissionsDefault: 'settings.devices.change.permissionsDefault',
    skillAdded: 'settings.devices.change.skillAdded',
    skillAddedCode: 'settings.devices.change.skillAddedCode',
    connectorSetup: 'settings.devices.change.connectorSetup',
    connectorGrant: 'settings.devices.change.connectorGrant',
    discordPaired: 'settings.devices.change.discordPaired',
    memoryWiped: 'settings.devices.change.memoryWiped',
    profileScanOn: 'settings.devices.change.profileScanOn',
} as const;

const warned = new Set<string>();

/** One change as a person reads it; for a kind this app doesn't know, "Changed a setting" with the kind id as `detail`. */
export function changeText(change: DeviceChange, t: Translate): { title: string; detail?: string } {
    const key = (KEYS as Record<string, (typeof KEYS)[keyof typeof KEYS]>)[change.kind];
    if (!key) {
        if (!warned.has(change.kind)) {
            warned.add(change.kind);
            console.warn(`[device changes] unknown change kind "${change.kind}"; showing it as a generic change`);
        }
        return { title: t('settings.devices.change.unknown'), detail: change.kind };
    }
    const params = Object.fromEntries(Object.entries(change.params ?? {}).flatMap(([name, value]) => (value === null || value === undefined ? [] : [[name, keepTogether(String(value))]])));
    return { title: t(key, params) };
}
