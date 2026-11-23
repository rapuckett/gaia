// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { keepTogether, pluralKey } from '@webui/i18n/registry';
import type { MessageKey, PluralKey } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';

import type { DeviceChange } from '@/api/client.types';

const P = 'settings.devices.change.';

/** Kinds worded by one fixed message. */
const KEYS = {
    providerKeySet: `${P}providerKeySet`,
    providerKeyRemoved: `${P}providerKeyRemoved`,
    gatewayChanged: `${P}gatewayChanged`,
    localOnlyOff: `${P}localOnlyOff`,
    permissionsDefault: `${P}permissionsDefault`,
    localOnlyOn: `${P}localOnlyOn`,
    agentInstalled: `${P}agentInstalled`,
    skillAdded: `${P}skillAdded`,
    skillAddedCode: `${P}skillAddedCode`,
    connectorSetup: `${P}connectorSetup`,
    discordPaired: `${P}discordPaired`,
    memoryWiped: `${P}memoryWiped`,
    profileScanOn: `${P}profileScanOn`,
    profileScanOff: `${P}profileScanOff`,
    pairingClosed: `${P}pairingClosed`,
    npuMemlockFixed: `${P}npuMemlockFixed`,
    folderAdded: `${P}folderAdded`,
    imageSettingsChanged: `${P}imageSettingsChanged`,
    folderRemoved: `${P}folderRemoved`,
    chatPermissionsAsk: `${P}chatPermissionsAsk`,
    chatPermissionsFull: `${P}chatPermissionsFull`,
    connectorRemoved: `${P}connectorRemoved`,
    gitCommitted: `${P}gitCommitted`,
    gitPullRequest: `${P}gitPullRequest`,
    goalApproved: `${P}goalApproved`,
    goalRejected: `${P}goalRejected`,
    scheduleCreated: `${P}scheduleCreated`,
    scheduleResumed: `${P}scheduleResumed`,
    scheduleRun: `${P}scheduleRun`,
    spendingAllowedMonth: `${P}spendingAllowedMonth`,
    spendingLimitCleared: `${P}spendingLimitCleared`,
    spendingLimitSet: `${P}spendingLimitSet`,
    undoLimitsChanged: `${P}undoLimitsChanged`,
} as const satisfies Record<string, MessageKey>;

const DISCORD_ACTIONS = {
    start: `${P}discord.start`,
    takeOver: `${P}discord.takeOver`,
    stop: `${P}discord.stop`,
    restart: `${P}discord.restart`,
    forgetAlways: `${P}discord.forgetAlways`,
    connect: `${P}discord.connect`,
    pair: `${P}discord.pair`,
    disconnect: `${P}discord.disconnect`,
} as const satisfies Record<string, MessageKey>;

const GPU_MEMORY_ACTIONS = {
    gpuMemoryApply: `${P}gpuMemoryApply`,
    gpuMemoryRevert: `${P}gpuMemoryRevert`,
} as const satisfies Record<string, MessageKey>;

const warned = new Set<string>();

const present = (v: unknown): v is string | number => (typeof v === 'string' && v !== '') || typeof v === 'number';

function warnOnce(id: string, message: string): void {
    if (warned.has(id)) return;
    warned.add(id);
    console.warn(`[device changes] ${message}`);
}

/** One change as a person reads it; a kind or variant this app doesn't know reads "Changed a setting" with the kind id as `detail`. */
export function changeText(change: DeviceChange, t: Translate): { title: string; detail?: string } {
    const generic = { title: t(`${P}unknown`), detail: change.kind };
    const p = change.params ?? {};
    const val = (name: string) => keepTogether(String(p[name]));
    const missing = (name: string) => {
        warnOnce(`${change.kind}:missing:${name}`, `a "${change.kind}" change came without ${name}; showing it as a generic change`);
        return generic;
    };
    const connectorAgent = (key: MessageKey) => {
        if (!present(p.connector)) return missing('connector');
        const agent = present(p.agent) ? p.agent : p.agent_id;
        if (!present(agent)) return missing('agent');
        return { title: t(key, { agent: keepTogether(String(agent)), connector: val('connector') }) };
    };

    switch (change.kind) {
        case 'connectorGrant':
            return connectorAgent(p.granted === false ? `${P}connectorGrantRemoved` : `${P}connectorGrant`);
        case 'connectorActivation':
            if (typeof p.active !== 'boolean') return missing('active');
            return connectorAgent(p.active ? `${P}connectorActivation` : `${P}connectorDeactivation`);
        case 'connectorEnable':
        case 'connectorDisable':
            if (!present(p.connector)) return missing('connector');
            return { title: t(change.kind === 'connectorEnable' ? `${P}connectorEnable` : `${P}connectorDisable`, { connector: val('connector') }) };
        case 'discordControl': {
            const key = typeof p.action === 'string' && Object.prototype.hasOwnProperty.call(DISCORD_ACTIONS, p.action) ? DISCORD_ACTIONS[p.action as keyof typeof DISCORD_ACTIONS] : undefined;
            if (!key) {
                warnOnce(`discordControl:${String(p.action)}`, `a Discord change with an action this app has no label for: ${String(p.action)}`);
                return generic;
            }
            return { title: t(key) };
        }
        case 'gpuMemoryChanged': {
            const key = typeof p.action === 'string' && Object.prototype.hasOwnProperty.call(GPU_MEMORY_ACTIONS, p.action) ? GPU_MEMORY_ACTIONS[p.action as keyof typeof GPU_MEMORY_ACTIONS] : undefined;
            if (!key) {
                warnOnce(`gpuMemoryChanged:${String(p.action)}`, `a GPU memory change with an action this app has no label for: ${String(p.action)}`);
                return generic;
            }
            return { title: t(key) };
        }
        case 'memoryCommit': {
            const count = p.count;
            if (typeof count !== 'number' || !Number.isFinite(count)) return missing('count');
            if (p.source !== 'discovery' && p.source !== 'inference') {
                warnOnce(`memoryCommit:${String(p.source)}`, `a memory change with a source this app has no label for: ${String(p.source)}`);
                return generic;
            }
            const base = (p.source === 'discovery' ? `${P}memoryCommitDiscovery` : `${P}memoryCommitInference`) as PluralKey;
            return { title: t(pluralKey(base, count), { count: keepTogether(String(count)) }) };
        }
        case 'permissionsDefault':
            if (p.mode === 'ask') return { title: t(`${P}permissionsDefaultAsk`) };
            if (p.mode === 'full_access') return { title: t(`${P}permissionsDefaultFull`) };
            if (present(p.mode)) warnOnce(`permissionsDefault:${String(p.mode)}`, `a permission change with a mode this app has no label for: ${String(p.mode)}`);
            return { title: t(KEYS.permissionsDefault) };
        case 'serverTarget':
            return { title: t(p.mode === 'gaia' ? `${P}serverTargetGaia` : `${P}serverTarget`) };
        case 'deviceRemoved':
            return present(p.device) ? { title: t(`${P}deviceRemoved`, { device: val('device') }) } : { title: t(`${P}deviceRemovedUnnamed`) };
    }

    const key = Object.prototype.hasOwnProperty.call(KEYS, change.kind) ? KEYS[change.kind as keyof typeof KEYS] : undefined;
    if (!key) {
        warnOnce(change.kind, `unknown change kind "${change.kind}"; showing it as a generic change`);
        return generic;
    }
    const params = Object.fromEntries(Object.entries(p).flatMap(([name, value]) => (value === null || value === undefined ? [] : [[name, keepTogether(String(value))]])));
    return { title: t(key, params) };
}
