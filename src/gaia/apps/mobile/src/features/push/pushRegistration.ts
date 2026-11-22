// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { PushSecrets } from '../../../modules/gaia-push';
import type { PcPushClient } from './pcPushClient';
import { RelayRequestError, RelayUnauthorizedError, RelayUnreachableError, type RelayClient } from './relayClient';

/** What this build registers with: from app.config.ts's `extra.push` for this platform. */
export interface PushBuildConfig {
    relayUrl: string;
    platform: 'apns' | 'fcm';
    appId: string;
    environment: 'sandbox' | 'production';
}

/** The native Keychain / Keystore store, one registration per paired PC. */
export interface PushVault {
    /** A registration whose `key` is empty belongs to an unpaired PC whose relay handle still waits to be deleted. */
    load(pcId: string): Promise<PushSecrets | null>;
    save(pcId: string, secrets: PushSecrets): Promise<void>;
    /** Stops pushes from that PC opening on this phone, keeping what deleting its handle at the relay needs. */
    dropKey(pcId: string): Promise<void>;
    remove(pcId: string): Promise<void>;
    pcIds(): Promise<string[]>;
}

export interface PushDeps {
    config: PushBuildConfig;
    relay: RelayClient;
    /** The paired PC's push route, over its pinned transport. */
    pc(pcId: string): PcPushClient;
    vault: PushVault;
    newKey(): string;
}

/**
 * How one PC's registration went: on; the relay unreachable; the relay refusing it (logged; a contract or quota
 * problem the app can't fix by itself); or the PC unreachable. Each is tried again on the next start.
 */
export type PcPushOutcome = 'on' | 'relay_unreachable' | 'relay_refused' | 'pc_unreachable';

class PcCallError extends Error {
    constructor(readonly pcId: string, cause: unknown) {
        super(`The paired PC ${pcId} didn't take this phone's push registration.`, { cause });
        this.name = 'PcCallError';
    }
}

async function onPc<T>(pcId: string, call: () => Promise<T>): Promise<T> {
    try {
        return await call();
    } catch (error) {
        throw new PcCallError(pcId, error);
    }
}

async function putOnPc(pcId: string, secrets: PushSecrets, deps: PushDeps): Promise<void> {
    const { relayUrl, platform } = deps.config;
    await onPc(pcId, () => deps.pc(pcId).put({ relay_url: relayUrl, handle: secrets.handle, send_token: secrets.sendToken, key: secrets.key, platform }));
}

/** Deletes a handle at the relay; true once it's gone (a 401 means it already was). */
async function deleteAtRelay(secrets: PushSecrets, deps: PushDeps): Promise<boolean> {
    try {
        await deps.relay.remove(secrets);
        return true;
    } catch (error) {
        if (error instanceof RelayUnauthorizedError) return true;
        if (error instanceof RelayUnreachableError) return false;
        throw error;
    }
}

/** Frees relay room for this token: deletes the handles of PCs no longer paired, which this phone still holds the secrets for. */
async function deleteStaleHandles(deps: PushDeps, paired: ReadonlySet<string>): Promise<number> {
    let freed = 0;
    for (const pcId of await deps.vault.pcIds()) {
        if (paired.has(pcId)) continue;
        const stale = await deps.vault.load(pcId);
        if (stale && (await deleteAtRelay(stale, deps))) {
            await deps.vault.remove(pcId);
            freed += 1;
        }
    }
    return freed;
}

const isTooMany = (error: unknown) => error instanceof RelayRequestError && error.status === 409 && error.code === 'too_many_handles';

/**
 * A new handle and key for `pcId`, replacing `old` (deleted at the relay first, so it can't linger): confirmed at the
 * relay with a token PUT (unconfirmed handles expire), saved, then given to the PC. A 409 too_many_handles frees this
 * phone's own stale handles and tries once more.
 */
async function register(pcId: string, token: string, deps: PushDeps, old: PushSecrets | null, paired: ReadonlySet<string>): Promise<void> {
    if (old && !(await deleteAtRelay(old, deps))) throw new RelayUnreachableError(null);
    const { platform, appId, environment } = deps.config;
    const body = { platform, token, app_id: appId, environment };
    let issued;
    try {
        issued = await deps.relay.register(body);
    } catch (error) {
        if (!isTooMany(error) || (await deleteStaleHandles(deps, paired)) === 0) throw error;
        issued = await deps.relay.register(body);
    }
    const secrets: PushSecrets = { ...issued, key: deps.newKey() };
    // Saved before anything else can fail, so the next start can confirm it, or delete it at the relay.
    await deps.vault.save(pcId, secrets);
    await deps.relay.updateToken(secrets, token);
    await putOnPc(pcId, secrets, deps);
}

/**
 * Brings one paired PC's push up to date with this phone's current token: registers when there's none,
 * re-sends the token to the relay otherwise (re-registering on a 401), and re-registers when the PC says push is off.
 * `paired` is every PC this phone is paired with, so a full relay can be freed of unpaired PCs' handles.
 */
export async function syncPc(pcId: string, token: string, deps: PushDeps, paired: ReadonlySet<string> = new Set([pcId])): Promise<PcPushOutcome> {
    try {
        const saved = await deps.vault.load(pcId);
        // An empty key is a PC unpaired and paired again before its old handle was deleted.
        if (!saved || !saved.key) {
            await register(pcId, token, deps, saved, paired);
            return 'on';
        }
        try {
            await deps.relay.updateToken(saved, token);
        } catch (error) {
            if (!(error instanceof RelayUnauthorizedError)) throw error;
            await register(pcId, token, deps, null, paired);
            return 'on';
        }
        const status = await onPc(pcId, () => deps.pc(pcId).get());
        if (!status.enabled) await register(pcId, token, deps, saved, paired);
        return 'on';
    } catch (error) {
        if (error instanceof RelayUnreachableError) return 'relay_unreachable';
        if (error instanceof RelayRequestError) {
            console.error(`The push relay refused this phone's registration for the PC ${pcId}. It is tried again when the app next opens.`, error);
            return 'relay_refused';
        }
        if (error instanceof PcCallError) {
            console.warn(`${error.message} It is tried again when the app next opens.`, error.cause);
            return 'pc_unreachable';
        }
        throw error;
    }
}

/**
 * Unpairing: push off on the PC (when it still knows this phone), the key dropped here so its pushes stop opening,
 * and the handle deleted at the relay. A delete the relay didn't take stays queued and is retried on every start.
 */
export async function unregisterPc(pcId: string, deps: PushDeps, { pcKnowsPhone }: { pcKnowsPhone: boolean }): Promise<void> {
    const saved = await deps.vault.load(pcId);
    if (!saved) return;
    if (pcKnowsPhone && saved.key) {
        try {
            await deps.pc(pcId).remove();
        } catch (error) {
            // Unpairing drops the PC's push record too; this only turns it off sooner.
            console.warn(`Couldn't turn push off on the paired PC ${pcId}; unpairing removes it there.`, error);
        }
    }
    if (saved.key) await deps.vault.dropKey(pcId);
    let deleted = false;
    try {
        deleted = await deleteAtRelay(saved, deps);
    } catch (error) {
        console.error(`The push relay refused to delete this phone's handle for ${pcId}; it is tried again when the app next opens.`, error);
        return;
    }
    if (deleted) await deps.vault.remove(pcId);
    else console.warn(`Couldn't reach the push relay to delete this phone's handle for ${pcId}; it is tried again when the app next opens.`);
}

export type RelayState = 'ok' | 'unreachable';

/** Every paired PC synced, and the handles of PCs no longer paired (a missed unpair, a queued delete, a reinstall) deleted. */
export async function syncAll(pairedIds: readonly string[], token: string, deps: PushDeps): Promise<RelayState> {
    const paired = new Set(pairedIds);
    for (const stale of (await deps.vault.pcIds()).filter((id) => !paired.has(id))) {
        await unregisterPc(stale, deps, { pcKnowsPhone: false });
    }
    let relay: RelayState = 'ok';
    for (const pcId of pairedIds) {
        const outcome = await syncPc(pcId, token, deps, paired);
        // A PC that's away isn't the relay's problem; the row shows only what stops push reaching this phone.
        if (outcome === 'relay_unreachable' || outcome === 'relay_refused') relay = 'unreachable';
    }
    return relay;
}
