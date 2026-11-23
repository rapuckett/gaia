// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';

import { getPairingService } from '@/features/pairing/registry';
import { onUnpair, onWipeAll } from '@/features/pairing/unpairListeners';
import type { FetchLike } from '@/platform/fetch.types';
import { pinnedFetch } from '@/platform/pinnedFetch';

import { gaiaPush } from '../../../modules/gaia-push';
import { createPcPushClient } from './pcPushClient';
import { pushAvailable, pushBuildConfig } from './pushConfig';
import { newPushKey } from './pushCrypto';
import { sweepStale, syncAll, unregisterAll, unregisterPc, type PushDeps } from './pushRegistration';
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
            removeAll: () => vault.removeAll(),
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

// One push job at a time: app start, a foreground, a new pairing and an unpair can all ask at once, and an unpair
// must not run while a registration for the same PC is still saving.
let queue: Promise<void> = Promise.resolve();

function enqueue(job: () => Promise<void>, onError: (error: unknown) => void): Promise<void> {
    const run = queue.then(job).catch(onError);
    queue = run;
    return run;
}

/**
 * Deletes handles of PCs no longer paired (including queued deletes the relay missed) whatever the permission, then
 * registers every paired PC once notifications are allowed (see syncAll). Never rejects: a failure is logged and shown
 * as unreachable (a failed sweep before Allow only warns), and the next start tries again.
 */
export function syncPush(): Promise<void> {
    let registering = false;
    return enqueue(
        async () => {
            const permission = await refreshPermission();
            const built = await buildDeps();
            if (!built) return;
            if (permission !== 'granted') {
                await sweepStale(built.pairedIds, built.deps);
                return;
            }
            registering = true;
            const { data: token } = await Notifications.getDevicePushTokenAsync();
            if (typeof token !== 'string' || !token) throw new Error('The phone gave GAIA no push token. Turn notifications off and on again in Settings.');
            const result = await syncAll(built.pairedIds, token, built.deps);
            usePushStore.getState().setRelay(result.relay);
            usePushStore.getState().setRefusal(result.refused[0]?.detail ?? null);
        },
        (error) => {
            if (!registering) {
                // Nothing is registered before Allow, so this says nothing about the relay row.
                console.warn('Deleting push handles of unpaired PCs failed; tried again when the app next opens', error);
                return;
            }
            console.error('Registering this phone for push notifications failed', error);
            usePushStore.getState().setRelay('unreachable');
        },
    );
}

/** Notifications turned off for GAIA: push off at every PC and the relay, and every secret removed, so turning them on registers afresh. */
export function resetPush(): Promise<void> {
    return enqueue(
        async () => {
            const built = await buildDeps();
            if (built) await unregisterAll(built.deps, { pcKnowsPhone: true });
            usePushStore.getState().setRelay('ok');
            usePushStore.getState().setRefusal(null);
        },
        (error) => console.error('Turning push off on this phone failed', error),
    );
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
    // Queued behind any registration in flight, so it can't save again after the unpair. Unregistering deletes the
    // handle at the relay now, whatever the permission, and an offline delete is retried on every start (sweepStale).
    onUnpair((pcId, pcKnowsPhone) =>
        enqueue(
            async () => {
                const built = await buildDeps();
                if (built) await unregisterPc(pcId, built.deps, { pcKnowsPhone });
            },
            (error) => console.error(`Turning push off for the unpaired PC ${pcId} failed; it is retried when the app next opens`, error),
        ),
    );
    // A reinstall: delete each old handle at the relay with its stored secret, then every push secret.
    onWipeAll(() =>
        enqueue(
            async () => {
                const built = await buildDeps();
                if (built) await unregisterAll(built.deps, { pcKnowsPhone: false });
            },
            (error) => console.error('Removing the previous install\'s push registrations failed', error),
        ),
    );
}
