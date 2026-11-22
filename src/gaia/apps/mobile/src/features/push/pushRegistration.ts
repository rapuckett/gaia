// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { PushSecrets } from '../../../modules/gaia-push';
import type { PcPushClient } from './pcPushClient';
import { RelayUnauthorizedError, RelayUnreachableError, type RelayClient } from './relayClient';

/** What this build registers with: from app.config.ts's `extra.push` for this platform. */
export interface PushBuildConfig {
    relayUrl: string;
    platform: 'apns' | 'fcm';
    appId: string;
    environment: 'sandbox' | 'production';
}

/** The native Keychain / Keystore store, one registration per paired PC. */
export interface PushVault {
    load(pcId: string): Promise<PushSecrets | null>;
    save(pcId: string, secrets: PushSecrets): Promise<void>;
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

/** How one PC's registration went: on, the relay unreachable, or the PC unreachable (it is tried again on the next start). */
export type PcPushOutcome = 'on' | 'relay_unreachable' | 'pc_unreachable';

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

/** A new handle and key for `pcId`, replacing `old` (deleted at the relay first, so it can't linger), then given to the PC. */
async function register(pcId: string, token: string, deps: PushDeps, old: PushSecrets | null): Promise<void> {
    if (old) {
        try {
            await deps.relay.remove(old);
        } catch (error) {
            // A handle the relay no longer accepts is already gone.
            if (!(error instanceof RelayUnauthorizedError)) throw error;
        }
    }
    const { platform, appId, environment } = deps.config;
    const handle = await deps.relay.register({ platform, token, app_id: appId, environment });
    const secrets: PushSecrets = { ...handle, key: deps.newKey() };
    // Saved before the PC hears of it: if the PC is away, the next start finds push off there and deletes this handle at the relay.
    await deps.vault.save(pcId, secrets);
    await putOnPc(pcId, secrets, deps);
}

/**
 * Brings one paired PC's push up to date with this phone's current token: registers when there's none,
 * re-sends the token to the relay otherwise (re-registering on a 401), and re-registers when the PC says push is off.
 */
export async function syncPc(pcId: string, token: string, deps: PushDeps): Promise<PcPushOutcome> {
    try {
        const saved = await deps.vault.load(pcId);
        if (!saved) {
            await register(pcId, token, deps, null);
            return 'on';
        }
        try {
            await deps.relay.updateToken(saved, token);
        } catch (error) {
            if (!(error instanceof RelayUnauthorizedError)) throw error;
            await register(pcId, token, deps, null);
            return 'on';
        }
        const status = await onPc(pcId, () => deps.pc(pcId).get());
        if (!status.enabled) await register(pcId, token, deps, saved);
        return 'on';
    } catch (error) {
        if (error instanceof RelayUnreachableError) return 'relay_unreachable';
        if (error instanceof PcCallError) {
            console.warn(`${error.message} It is tried again when the app next opens.`, error.cause);
            return 'pc_unreachable';
        }
        throw error;
    }
}

/** Unpairing: push off on the PC (when it still knows this phone), the handle deleted at the relay, the secrets dropped here. */
export async function unregisterPc(pcId: string, deps: PushDeps, { pcKnowsPhone }: { pcKnowsPhone: boolean }): Promise<void> {
    const saved = await deps.vault.load(pcId);
    if (!saved) return;
    if (pcKnowsPhone) {
        try {
            await deps.pc(pcId).remove();
        } catch (error) {
            // Unpairing drops the PC's push record too; this only turns it off sooner.
            console.warn(`Couldn't turn push off on the paired PC ${pcId}; unpairing removes it there.`, error);
        }
    }
    try {
        await deps.relay.remove(saved);
    } catch (error) {
        if (!(error instanceof RelayUnauthorizedError)) {
            console.warn(`Couldn't delete this phone's push handle for ${pcId} at the relay; it expires there unused.`, error);
        }
    }
    await deps.vault.remove(pcId);
}

export type RelayState = 'ok' | 'unreachable';

/** Every paired PC synced, and registrations for PCs no longer paired (a missed unpair, a reinstall) removed. */
export async function syncAll(pairedIds: readonly string[], token: string, deps: PushDeps): Promise<RelayState> {
    const paired = new Set(pairedIds);
    for (const stale of (await deps.vault.pcIds()).filter((id) => !paired.has(id))) {
        await unregisterPc(stale, deps, { pcKnowsPhone: false });
    }
    let relay: RelayState = 'ok';
    for (const pcId of pairedIds) {
        if ((await syncPc(pcId, token, deps)) === 'relay_unreachable') relay = 'unreachable';
    }
    return relay;
}
