// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';

import { getPairingService } from '@/features/pairing/registry';
import { onUnpair } from '@/features/pairing/unpairListeners';
import type { FetchLike } from '@/platform/fetch.types';
import { pinnedFetch } from '@/platform/pinnedFetch';

import { gaiaPush } from '../../../modules/gaia-push';
import { createPcPushClient } from './pcPushClient';
import { pushAvailable, pushBuildConfig } from './pushConfig';
import { newPushKey } from './pushCrypto';
import { syncAll, unregisterPc, type PushDeps } from './pushRegistration';
import { usePushStore, type PushPermission } from './pushStore';
import { createRelayClient } from './relayClient';

const relayFetch: FetchLike = (url, init) => fetch(url, init as RequestInit);

async function buildDeps(): Promise<{ deps: PushDeps; pairedIds: string[] } | null> {
    const config = pushBuildConfig();
    const vault = gaiaPush();
    if (!config || !vault) return null;
    const pcs = (await getPairingService().list()).filter((pc) => pc.connection.pinned);
    const byId = new Map(pcs.map((pc) => [pc.id, pc]));
    const deps: PushDeps = {
        config,
        relay: createRelayClient(config.relayUrl, relayFetch),
        pc: (pcId) => {
            const pc = byId.get(pcId);
            if (!pc) throw new Error(`This phone isn't paired with a PC whose id is ${pcId}, so it can't change push there.`);
            return createPcPushClient(pc.connection.baseUrl, (url, init) => pinnedFetch(pcId, url, init));
        },
        vault: {
            load: (pcId) => vault.load(pcId),
            save: (pcId, s) => vault.save(pcId, s.handle, s.secret, s.sendToken, s.key),
            dropKey: (pcId) => vault.dropKey(pcId),
            remove: (pcId) => vault.remove(pcId),
            pcIds: () => vault.pcIds(),
        },
        newKey: () => newPushKey((n) => Crypto.getRandomBytes(n)),
    };
    return { deps, pairedIds: pcs.map((pc) => pc.id) };
}

function permissionOf(status: Notifications.NotificationPermissionsStatus): PushPermission {
    // The enum is exported at runtime, through a pattern eslint-plugin-import can't follow.
    // eslint-disable-next-line import/namespace
    if (status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return status.status === Notifications.PermissionStatus.DENIED ? 'denied' : 'undetermined';
}

export async function refreshPermission(): Promise<PushPermission> {
    const permission = permissionOf(await Notifications.getPermissionsAsync());
    usePushStore.getState().setPermission(permission);
    return permission;
}

// One sync at a time: app start, a foreground and a new pairing can all ask at once.
let syncing: Promise<void> = Promise.resolve();

/** Registers every paired PC with this phone's current token (see syncAll); a no-op until notifications are allowed. Never rejects: a failure is logged and shown as unreachable, and the next start tries again. */
export function syncPush(): Promise<void> {
    const run = syncing
        .then(async () => {
            if ((await refreshPermission()) !== 'granted') return;
            const built = await buildDeps();
            if (!built) return;
            const { data: token } = await Notifications.getDevicePushTokenAsync();
            if (typeof token !== 'string' || !token) throw new Error('The phone gave GAIA no push token. Turn notifications off and on again in Settings.');
            const result = await syncAll(built.pairedIds, token, built.deps);
            usePushStore.getState().setRelay(result.relay);
            usePushStore.getState().setRefusal(result.refused[0]?.detail ?? null);
        })
        .catch((error: unknown) => {
            console.error('Registering this phone for push notifications failed', error);
            usePushStore.getState().setRelay('unreachable');
        });
    syncing = run;
    return run;
}

/** The OS prompt, after the explainer's "Turn on"; registers right away when allowed. */
export async function requestPushPermission(): Promise<PushPermission> {
    const answer = permissionOf(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }));
    usePushStore.getState().setPermission(answer);
    if (answer === 'granted') await syncPush();
    return answer;
}

let installed = false;

/** How push notifications show in the foreground, and push turned off at the PC and the relay when a PC is unpaired. Once, before the first render. */
export function installPush(): void {
    if (installed || !pushAvailable()) return;
    installed = true;
    // The app's own banners cover a chat in the foreground; a push that arrives then only goes to Notification Center.
    Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
    });
    onUnpair(async (pcId, pcKnowsPhone) => {
        const built = await buildDeps();
        if (built) await unregisterPc(pcId, built.deps, { pcKnowsPhone });
    });
}
