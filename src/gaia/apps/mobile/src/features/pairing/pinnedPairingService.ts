// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { ENDPOINTS, UI_HEADERS } from '@/api/constants';
import { GaiaApiError, GaiaPinMismatchError, parseErrorDetail } from '@/api/errors';
import { normalizeBaseUrl } from '@/api/http';
import { isDeviceUnknown } from '@/platform/deviceGate';
import { onDeviceGone, pinnedFetch, transportError } from '@/platform/pinnedFetch';
import { useConnectionStore, type ConnectionConfig } from '@/state/connection';

import { GaiaTransport, transportAvailable } from '../../../modules/gaia-transport';
import { withDeadline } from './deadline';
import { PairingInviteError, type PairingInvite } from './invite';
import { routeOrigin, type RouteOrigin } from './homeNetwork';
import { probeOrigin, startRouteKeeper } from './routeKeeper';
import { setPairingService } from './registry';
import type { PairedPc, PairingService, PairingStatus, PcRecheck, RedeemResult } from './service';
import { notifyUnpair, notifyWipeAll } from './unpairListeners';

// Only what isn't secret; each PC's token and pin live in the Keychain, under its id.
const STORAGE_KEY = 'gaia:paired-pcs';
// Set once this install has run. AsyncStorage is wiped on uninstall but the Keychain is not.
const INSTALL_MARKER_KEY = 'gaia:install-marker';
// The route a paired device unpairs itself with (gaia/ui/devices SELF_ROUTE).
const SELF_ROUTE = '/api/devices/me';
// Every address the PC answers this device at, by route; a PC without away routes answers 404.
const ROUTES_ROUTE = '/api/devices/me/routes';

/** Where a redeemed code's secret waits for Allow, so a PC already paired keeps its own until then. */
const stagedId = (pcId: string) => `${pcId}.pending`;
/** Where a forgotten PC's secret waits while the PC is told; per pairing, so a newer pairing with that PC is never touched. */
const leavingId = (pc: SavedPc) => `${pc.id}.leaving.${pc.deviceId}`;
// Telling a forgotten PC waits this long at most; the PC then lists this phone until it is removed there.
const TELL_PC_MS = 10_000;

interface SavedPc {
    id: string;
    name: string;
    /** The address in use: the one chosen last. */
    origin: string;
    /** Every address the PC answers at; one saved before routes is its home address. */
    origins: RouteOrigin[];
    deviceId: string;
    /** ISO time of the last Allow; absent on a PC saved before it was kept. */
    pairedAt?: string;
}

interface Saved {
    pcs: SavedPc[];
    currentId: string | null;
    /** Redeemed, and waiting for Allow on the PC. */
    pending: Pending | null;
    /** Forgotten here, and not yet told: finished in the background, or at the next start after a kill. */
    leaving: SavedPc[];
}

type Pending = SavedPc & { expiresAt?: number };

interface PairAnswer {
    device_id: string;
    pc_name: string;
    expires_at?: string;
}

function connectionOf(pc: SavedPc): ConnectionConfig {
    return { baseUrl: pc.origin, pcId: pc.id, pinned: true, origins: pc.origins.map((o) => o.origin), routes: pc.origins };
}

function sameAddresses(a: ConnectionConfig, b: ConnectionConfig): boolean {
    return normalizeBaseUrl(a.baseUrl) === normalizeBaseUrl(b.baseUrl) && JSON.stringify(a.routes ?? null) === JSON.stringify(b.routes ?? null);
}

function withOrigins<T extends Omit<SavedPc, 'origins'> & { origins?: RouteOrigin[] }>(pc: T): T & SavedPc {
    return { ...pc, origins: pc.origins ?? [{ kind: 'home', origin: pc.origin }] };
}

function pairedOf(pc: SavedPc): PairedPc {
    return { id: pc.id, name: pc.name, connection: connectionOf(pc), pairedAt: pc.pairedAt, deviceId: pc.deviceId };
}

function devicePlatform(): 'ios' | 'ipados' | 'android' {
    if (Platform.OS === 'android') return 'android';
    return Platform.OS === 'ios' && Platform.isPad ? 'ipados' : 'ios';
}

/** The name the PC lists this phone under: the one its owner gave it, else its model. */
function deviceName(): string {
    const name = Device.deviceName ?? Device.modelName;
    if (!name) throw new Error("This phone reports neither a name nor a model, so the PC would have nothing to list it under.");
    return name;
}

const NO_ANSWER = new Set(['unreachable', 'not_home_network', 'network']);

/** A native failure's code, for a log line that never carries the secret's contents. */
function failureCode(err: unknown): string {
    return String((err as { code?: unknown } | null)?.code ?? (err instanceof Error ? err.name : typeof err));
}

/** Whether the secret under this PC's own id belongs to a pairing still in use: one listed, or one being redeemed. */
function ownsOwnId(state: Saved, pcId: string): boolean {
    return state.pcs.some((p) => p.id === pcId) || state.pending?.id === pcId;
}

/** The PairingService of an iOS build: everything over TLS pinned to the PC, the token kept natively. */
export interface PinnedPairingService extends PairingService {
    restore(): Promise<ConnectionConfig | null>;
    deviceGone(pcId: string): Promise<void>;
    /** Every address a paired PC answers at; empty for a PC this phone isn't paired with. */
    origins(pcId: string): Promise<RouteOrigin[]>;
    /** Makes `origin` the paired PC's address in use, and the app's when it is the current PC. */
    chose(pcId: string, origin: string): Promise<void>;
    /** Asks the PC, at `origin`, for its routes and keeps the valid ones here and natively; the addresses kept. */
    refreshRoutes(pcId: string, origin: string): Promise<RouteOrigin[]>;
}

/** `onAllowed` hears each PC that has just allowed this phone, so its routes are fetched even when it was already the one in use. */
export function createPinnedPairingService(onAllowed?: (pcId: string) => void): PinnedPairingService {
    let saved: Saved | null = null;
    // Callers of status() while a check is out share its answer, so one redemption is never promoted twice.
    let checking: Promise<PairingStatus> | null = null;

    async function load(): Promise<Saved> {
        if (!saved) {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            const read: Omit<Saved, 'leaving'> & { leaving?: SavedPc[] } = raw ? JSON.parse(raw) : { pcs: [], currentId: null, pending: null };
            saved = { ...read, pcs: read.pcs.map(withOrigins), pending: read.pending && withOrigins(read.pending), leaving: read.leaving ?? [] };
        }
        return saved;
    }

    async function save(next: Saved): Promise<void> {
        saved = next;
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }

    /** The PC's answer to this phone's token: allowed, still pending, or unknown (unpaired, or never allowed in time). */
    async function check(pc: SavedPc): Promise<'allowed' | 'pending' | 'unknown'> {
        const res = await pinnedFetch(stagedId(pc.id), `${pc.origin}${ENDPOINTS.health}`, { headers: { ...UI_HEADERS } });
        const text = await res.text();
        if (res.ok) return 'allowed';
        if (res.status === 401) return 'unknown';
        if (res.status === 403 && (JSON.parse(text) as { code?: string }).code === 'device_pending') return 'pending';
        throw new GaiaApiError(res.status, parseErrorDetail(text));
    }

    /** Tells the PC to forget this phone; a 401 means it already had. */
    async function unpairOnPc(pc: SavedPc, vaultId: string = pc.id, signal?: AbortSignal): Promise<void> {
        const res = await pinnedFetch(vaultId, `${pc.origin}${SELF_ROUTE}`, { method: 'DELETE', headers: { ...UI_HEADERS }, signal });
        const text = await res.text();
        // 401: the PC no longer knows this phone.
        if (!res.ok && res.status !== 401) throw new GaiaApiError(res.status, parseErrorDetail(text));
    }

    async function updatePc(pcId: string, change: (pc: SavedPc) => SavedPc): Promise<SavedPc | null> {
        const state = await load();
        const pc = state.pcs.find((p) => p.id === pcId);
        if (!pc) return null;
        const next = change(pc);
        await save({ ...state, pcs: state.pcs.map((p) => (p.id === pcId ? next : p)) });
        const connection = useConnectionStore.getState();
        const updated = connectionOf(next);
        // Setting an unchanged connection would restart everything that watches it, the setup check among them.
        if (connection.connection?.pcId === pcId && !sameAddresses(connection.connection, updated)) connection.setConnection(updated);
        return next;
    }

    /** Ends a redemption the PC no longer knows, read afresh so a change saved during the check is kept. */
    async function dropPending(pending: Pending): Promise<PairingStatus> {
        const latest = await load();
        // A newer code replaced this one while it was checked; that one stands.
        if (latest.pending && latest.pending.deviceId !== pending.deviceId) return { state: 'pending', pcName: latest.pending.name, expiresAt: latest.pending.expiresAt };
        if (!latest.pending) return { state: 'none' };
        await GaiaTransport.drop(stagedId(pending.id));
        await save({ ...latest, pending: null });
        return { state: 'refused' };
    }

    /** The staged key went away during the check: promoted already, or this redemption can't finish. */
    async function stagedKeyGone(pending: Pending): Promise<PairingStatus> {
        const promoted = (await load()).pcs.find((p) => p.id === pending.id && p.deviceId === pending.deviceId);
        if (promoted) return { state: 'paired', pc: pairedOf(promoted) };
        return dropPending(pending);
    }

    async function checkStatus(): Promise<PairingStatus> {
        const { pending } = await load();
        if (!pending) return { state: 'none' };
        let answer;
        try {
            answer = await check(pending);
        } catch (err) {
            if (err instanceof GaiaPinMismatchError || err instanceof GaiaApiError) throw err;
            const code = String((err as { code?: unknown }).code);
            if (NO_ANSWER.has(code)) return { state: 'unreachable' };
            if (code !== 'not_paired') throw err;
            return stagedKeyGone(pending);
        }
        if (answer === 'pending') return { state: 'pending', pcName: pending.name, expiresAt: pending.expiresAt };
        if (answer === 'unknown') return dropPending(pending);
        try {
            await GaiaTransport.promote(stagedId(pending.id), pending.id);
        } catch (err) {
            if (String((err as { code?: unknown }).code) !== 'not_paired') throw err;
            return stagedKeyGone(pending);
        }
        const pc: SavedPc = { id: pending.id, name: pending.name, origin: pending.origin, origins: pending.origins, deviceId: pending.deviceId, pairedAt: new Date().toISOString() };
        // Read again: the other PCs' routes may have been refreshed while this one was being checked.
        const latest = await load();
        await save({ ...latest, pcs: [...latest.pcs.filter((p) => p.id !== pc.id), pc], currentId: pc.id, pending: null });
        onAllowed?.(pc.id);
        return { state: 'paired', pc: pairedOf(pc) };
    }

    /**
     * One address's answer to this phone's token, over the pin saved at pairing; never rejects. The token is sent only
     * once the PC has shown that pinned certificate, so a changed one is `mismatch`, never an answer.
     */
    async function askAt(pc: SavedPc, origin: string, signal?: AbortSignal): Promise<'known' | 'unknown' | 'mismatch' | 'none'> {
        try {
            const res = await pinnedFetch(pc.id, `${origin}${ENDPOINTS.health}`, { headers: { ...UI_HEADERS }, signal });
            const text = await res.text();
            if (res.ok) return 'known';
            // Only the device gate's own refusal says the PC dropped this phone; other layers send Bearer 401s too.
            if (isDeviceUnknown(res.status, res.headers.get('www-authenticate'), text)) return 'unknown';
            console.warn(`${pc.name} answered ${res.status} at ${origin} when asked whether it still knows this phone`);
            return 'none';
        } catch (err) {
            if (err instanceof GaiaPinMismatchError) return 'mismatch';
            console.warn(`${pc.name} didn't answer at ${origin} when asked whether it still knows this phone`, err);
            return 'none';
        }
    }

    /** Tells a forgotten PC to drop this phone and turns its push off, then drops its secret; never rejects, each failure logged. */
    async function finishLeaving(pc: SavedPc): Promise<void> {
        const vaultId = leavingId(pc);
        try {
            // After a kill the secret can still be under the PC's own id; a PC paired again since keeps its new one.
            if (!GaiaTransport.isPaired(vaultId) && GaiaTransport.isPaired(pc.id) && !ownsOwnId(await load(), pc.id)) {
                await GaiaTransport.promote(pc.id, vaultId);
            }
            // The PC drops its push record when it forgets the phone, so push only deletes at the relay (sweepStale retries).
            void notifyUnpair(pc.id, false);
            if (GaiaTransport.isPaired(vaultId)) {
                try {
                    await withDeadline(TELL_PC_MS, `Telling ${pc.name} to unpair this phone`, (signal) => unpairOnPc(pc, vaultId, signal));
                } catch (err) {
                    // A changed certificate stops the request at the handshake, before the token is sent.
                    console.warn(`Couldn't tell ${pc.name} to unpair this phone; it is forgotten here, and the PC lists it until it is removed there.`, err);
                }
                await GaiaTransport.drop(vaultId);
            }
            const latest = await load();
            const rest = { ...latest, leaving: latest.leaving.filter((p) => leavingId(p) !== vaultId) };
            await save(rest);
            // A kill inside the native move leaves a copy under the PC's own id. No await between the check and the
            // drop, so a pairing of this PC listed, redeeming or still leaving keeps its secret.
            if (GaiaTransport.isPaired(pc.id) && !ownsOwnId(rest, pc.id) && !rest.leaving.some((p) => p.id === pc.id)) await GaiaTransport.drop(pc.id);
        } catch (err) {
            console.error(`Finishing forgetting ${pc.name} failed; it is tried again at the next start`, err);
        }
    }

    /** A reinstalled app finds the old install's secrets in the Keychain; a fresh install has no marker and no saved PCs. */
    async function wipeKeychainOnReinstall(): Promise<void> {
        if ((await AsyncStorage.getItem(INSTALL_MARKER_KEY)) !== null) return;
        // An app updated from a build without the marker still has its saved PCs, so its secrets are its own.
        if ((await AsyncStorage.getItem(STORAGE_KEY)) === null) {
            await notifyWipeAll();
            await GaiaTransport.dropAll();
        }
        await AsyncStorage.setItem(INSTALL_MARKER_KEY, new Date().toISOString());
    }

    return {
        async origins(pcId) {
            return (await load()).pcs.find((p) => p.id === pcId)?.origins ?? [];
        },

        async chose(pcId, origin) {
            const current = useConnectionStore.getState().connection;
            if (current?.pcId === pcId && current.baseUrl === origin) return;
            await updatePc(pcId, (pc) => ({ ...pc, origin }));
        },

        async refreshRoutes(pcId, origin) {
            const res = await pinnedFetch(pcId, `${origin}${ROUTES_ROUTE}`, { headers: { ...UI_HEADERS } });
            const text = await res.text();
            const known = (await load()).pcs.find((p) => p.id === pcId)?.origins ?? [];
            // A PC without away routes: it answers at the home addresses this phone already has.
            if (res.status === 404) return known;
            if (!res.ok) throw new GaiaApiError(res.status, parseErrorDetail(text));
            const reported = (JSON.parse(text) as { origins?: unknown }).origins;
            if (!Array.isArray(reported)) throw new Error(`The PC's routes answer had no list of origins: ${text.slice(0, 200)}`);
            const routes: RouteOrigin[] = [];
            for (const entry of reported as { kind?: unknown; origin?: unknown }[]) {
                const route = routeOrigin(entry?.kind, entry?.origin);
                if (!route) console.warn(`Ignoring an address the PC reported that this phone won't use: ${JSON.stringify(entry)}`);
                else if (!routes.some((r) => r.origin === route.origin)) routes.push(route);
            }
            if (routes.length === 0) throw new Error(`The PC reported no address this phone can use, so its saved addresses were kept: ${text.slice(0, 200)}`);
            await GaiaTransport.setOrigins(pcId, JSON.stringify(routes));
            await updatePc(pcId, (pc) => ({ ...pc, origins: routes }));
            return routes;
        },

        /** The saved current PC's connection; null when there is none, or its token is no longer in the Keychain. */
        async restore() {
            await wipeKeychainOnReinstall();
            const state = await load();
            const current = state.pcs.find((p) => p.id === state.currentId);
            let restored: ConnectionConfig | null = null;
            if (current && !GaiaTransport.isPaired(current.id)) {
                console.warn(`${current.name}'s key is no longer on this phone, so it has to be paired again.`);
                await save({ ...state, pcs: state.pcs.filter((p) => p.id !== current.id), currentId: null });
            } else if (current) {
                restored = connectionOf(current);
            }
            for (const pc of (await load()).leaving) void finishLeaving(pc);
            return restored;
        },

        /** The PC refused this phone's token: drop it, and go back to pairing when it was the one in use. */
        async deviceGone(pcId) {
            const state = await load();
            const pc = state.pcs.find((p) => p.id === pcId);
            if (!pc) return;
            await notifyUnpair(pcId, false);
            await GaiaTransport.drop(pcId);
            await save({ ...state, pcs: state.pcs.filter((p) => p.id !== pcId), currentId: state.currentId === pcId ? null : state.currentId });
            const connection = useConnectionStore.getState();
            if (connection.connection?.pcId === pcId) connection.connectionRemoved(pc.name);
        },

        async redeem(invite: PairingInvite): Promise<RedeemResult> {
            const body = JSON.stringify({ invitation: invite.invite, device_name: deviceName(), platform: devicePlatform() });
            await GaiaTransport.drop(stagedId(invite.pc_id));
            let answer;
            try {
                answer = await GaiaTransport.pair(stagedId(invite.pc_id), invite.origins, invite.pin, { ...UI_HEADERS, 'Content-Type': 'application/json' }, body);
            } catch (err) {
                const e = transportError(err);
                const code = String((e as { code?: unknown }).code);
                if (code === 'not_home_origin') throw new PairingInviteError('mobileApp.pairing.invite.notHomeNetwork', undefined, { cause: err });
                if (NO_ANSWER.has(code)) return { state: 'unreachable' };
                throw e;
            }
            if (answer.status === 403) return { state: 'refused' };
            if (answer.status === 429) return { state: 'refused', rateLimited: true };
            if (answer.status !== 200) throw new GaiaApiError(answer.status, parseErrorDetail(answer.body));
            const paired = JSON.parse(answer.body) as PairAnswer;
            const expiresAt = paired.expires_at ? Date.parse(paired.expires_at) / 1000 : undefined;
            const origins = invite.origins.map((origin) => ({ kind: 'home' as const, origin }));
            const pending = { id: invite.pc_id, name: paired.pc_name || invite.name, origin: answer.origin, origins, deviceId: paired.device_id, expiresAt };
            // A PC already paired keeps its saved token, and stays the one in use, until this one is allowed.
            await save({ ...(await load()), pending });
            return { state: 'pending', pcName: pending.name, expiresAt };
        },

        status() {
            checking ??= checkStatus().finally(() => {
                checking = null;
            });
            return checking;
        },

        async cancel() {
            const state = await load();
            const { pending } = state;
            if (!pending) return;
            try {
                await unpairOnPc(pending, stagedId(pending.id));
            } catch (err) {
                // The PC drops a device nobody allowed after 10 minutes anyway.
                console.warn(`Couldn't tell ${pending.name} to forget this phone; it drops it in 10 minutes.`, err);
            }
            await GaiaTransport.drop(stagedId(pending.id));
            await save({ ...state, pending: null });
        },

        async list() {
            return (await load()).pcs.map(pairedOf);
        },

        async use(pcId) {
            const state = await load();
            const pc = state.pcs.find((p) => p.id === pcId);
            if (!pc) throw new Error(`This phone isn't paired with a PC whose id is ${pcId}. Pair it from the PC first.`);
            await save({ ...state, currentId: pcId });
            useConnectionStore.getState().setConnection(connectionOf(pc));
        },

        async forget(pcId) {
            const state = await load();
            const pc = state.pcs.find((p) => p.id === pcId);
            if (!pc) throw new Error(`This phone isn't paired with a PC whose id is ${pcId}.`);
            // The list first: after a kill here the next start moves the secret aside and finishes; a secret moved
            // first would leave the PC listed without it.
            await save({
                ...state,
                pcs: state.pcs.filter((p) => p.id !== pcId),
                currentId: state.currentId === pcId ? null : state.currentId,
                leaving: [...state.leaving.filter((p) => leavingId(p) !== leavingId(pc)), pc],
            });
            // Off the PC before its secret moves, so a failed move can't leave the app talking to it. No other PC is made current.
            const connection = useConnectionStore.getState();
            if (connection.connection?.pcId === pcId) connection.clearConnection();
            try {
                if (GaiaTransport.isPaired(pcId)) await GaiaTransport.promote(pcId, leavingId(pc));
            } catch (err) {
                // Its leaving entry is saved, so finishing (now, or at the next start) moves the secret again.
                console.error(`Moving the forgotten PC ${pcId}'s key aside failed (${failureCode(err)}); it is tried again.`);
            }
            void finishLeaving(pc);
        },

        async recheck(pcId, signal): Promise<PcRecheck> {
            const pc = (await load()).pcs.find((p) => p.id === pcId);
            if (!pc) throw new Error(`This phone isn't paired with a PC whose id is ${pcId}.`);
            const origins = [pc.origin, ...pc.origins.map((o) => o.origin).filter((o) => o !== pc.origin)];
            // A 2xx or the device gate's refusal settles it at once; a changed certificate settles it only at every address.
            const answer = await new Promise<{ state: 'known'; origin: string } | Exclude<PcRecheck, { state: 'known' }>>((resolve) => {
                let left = origins.length;
                let mismatched = 0;
                for (const origin of origins) {
                    void askAt(pc, origin, signal).then((kind) => {
                        if (kind === 'known') resolve({ state: 'known', origin });
                        else if (kind === 'unknown') resolve({ state: 'unknown' });
                        else if (kind === 'mismatch') mismatched += 1;
                        if (--left === 0) resolve(mismatched === origins.length ? { state: 'otherDevice' } : { state: 'unreachable' });
                    });
                }
            });
            if (answer.state !== 'known') return answer;
            // The caller gave up, and said so on screen: a late answer changes nothing.
            if (signal?.aborted) return { state: 'unreachable' };
            if (answer.origin !== pc.origin) await updatePc(pcId, (p) => ({ ...p, origin: answer.origin }));
            return { state: 'known' };
        },
    };
}

/**
 * Installs the pinned service on a build that has the transport, and reconnects to the PC used last.
 * A development build pointed at a dev backend (EXPO_PUBLIC_GAIA_URL) keeps the fake.
 */
export function installPinnedPairing(): void {
    if (!transportAvailable || (__DEV__ && process.env.EXPO_PUBLIC_GAIA_URL)) return;
    let keeper: ReturnType<typeof startRouteKeeper> | null = null;
    const service = createPinnedPairingService(() => void keeper?.rechoose('connected'));
    setPairingService(service);
    onDeviceGone((pcId) => {
        service.deviceGone(pcId).catch((err: unknown) => console.error(`Could not forget the PC ${pcId} after it refused this phone`, err));
    });
    keeper = startRouteKeeper({ service, probe: probeOrigin });
    const connection = useConnectionStore.getState();
    connection.beginRestore();
    service
        .restore()
        .then((restored) => useConnectionStore.getState().finishRestore(restored))
        .catch((err: unknown) => {
            console.error('Could not read the paired PC saved on this phone', err);
            useConnectionStore.getState().finishRestore(null);
        });
}
