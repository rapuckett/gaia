// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

import { ENDPOINTS, UI_HEADERS } from '@/api/constants';
import { GaiaApiError, parseErrorDetail } from '@/api/errors';
import { pinnedFetch, transportError } from '@/platform/pinnedFetch';
import { currentPairedPc, usePairedPcsStore } from '@/state/pairedPcs';

import { GaiaTransport } from '../../../modules/gaia-transport';
import { parseOffer } from './parseOffer';
import { PairingError, type PairedPc, type PairedStatus, type PairingApi, type PairingOffer } from './pairing.types';

// The PC's routes for a paired device (gaia/ui/devices: PAIR_ROUTE, SELF_ROUTE).
const SELF_ROUTE = '/api/devices/me';

interface PairAnswer {
    device_id: string;
    pc_name: string;
    pc_id: string;
    status: 'pending';
    expires_at: string;
}

function devicePlatform(): 'ios' | 'ipados' | 'android' {
    if (Platform.OS === 'android') return 'android';
    return Platform.OS === 'ios' && Platform.isPad ? 'ipados' : 'ios';
}

/** A native rejection from reaching the PC, as the PairingError the screens show. */
function reachError(err: unknown): Error {
    const e = transportError(err);
    if (e instanceof PairingError) return e;
    switch ((e as { code?: unknown }).code) {
        case 'not_home_network':
            return new PairingError('not_home_network', e.message);
        case 'unreachable':
        case 'network':
            return new PairingError('unreachable', e.message);
        case 'invalid_pin':
            return new PairingError('invalid_code', e.message);
        default:
            return e;
    }
}

function pcOf(pcId: string): PairedPc {
    const pc = usePairedPcsStore.getState().pcs.find((p) => p.pcId === pcId);
    if (!pc) throw new Error(`No paired PC has the id ${pcId}. Pair this phone with it first.`);
    return pc;
}

async function redeem(offer: PairingOffer, deviceName: string): Promise<PairedPc> {
    if (offer.exp * 1000 <= Date.now()) throw new PairingError('expired', 'This pairing code has expired. Show a new one on the PC.');
    const body = JSON.stringify({ invitation: offer.invite, device_name: deviceName, platform: devicePlatform() });
    let answer;
    try {
        answer = await GaiaTransport.pair(offer.pc_id, offer.origins, offer.pin, { ...UI_HEADERS, 'Content-Type': 'application/json' }, body);
    } catch (err) {
        throw reachError(err);
    }
    if (answer.status === 403) throw new PairingError('refused', parseErrorDetail(answer.body));
    if (answer.status === 429) throw new PairingError('rate_limited', parseErrorDetail(answer.body));
    // 422: the device name had nothing printable left.
    if (answer.status === 422) throw new PairingError('refused', parseErrorDetail(answer.body));
    if (answer.status !== 200) throw new GaiaApiError(answer.status, parseErrorDetail(answer.body));
    const paired = JSON.parse(answer.body) as PairAnswer;
    const pc: PairedPc = {
        pcId: offer.pc_id,
        name: paired.pc_name || offer.name,
        origin: answer.origin,
        deviceId: paired.device_id,
        status: 'pending',
        pairedAt: new Date().toISOString(),
    };
    await usePairedPcsStore.getState().add(pc);
    return pc;
}

async function status(pcId: string): Promise<PairedStatus> {
    const pc = pcOf(pcId);
    let res;
    try {
        res = await pinnedFetch(pcId, `${pc.origin}${ENDPOINTS.health}`, { headers: { ...UI_HEADERS } });
    } catch (err) {
        throw reachError(err);
    }
    const text = await res.text();
    let next: PairedStatus;
    if (res.ok) next = 'allowed';
    else if (res.status === 401) next = 'revoked';
    else if (res.status === 403 && (JSON.parse(text) as { code?: string }).code === 'device_pending') next = 'pending';
    else if (res.status === 403) throw new PairingError('not_home_network', parseErrorDetail(text));
    else throw new GaiaApiError(res.status, parseErrorDetail(text));
    if (next !== pc.status) await usePairedPcsStore.getState().setStatus(pcId, next);
    return next;
}

async function forget(pcId: string): Promise<void> {
    const pc = pcOf(pcId);
    let told: Error | null = null;
    try {
        const res = await pinnedFetch(pcId, `${pc.origin}${SELF_ROUTE}`, { method: 'DELETE', headers: { ...UI_HEADERS } });
        await res.text();
        // 401: the PC had already unpaired this phone.
        if (!res.ok && res.status !== 401) told = new GaiaApiError(res.status, `The PC answered ${res.status}.`);
    } catch (err) {
        told = reachError(err);
    }
    await GaiaTransport.drop(pcId);
    await usePairedPcsStore.getState().remove(pcId);
    if (told) {
        throw new PairingError(
            'unreachable',
            `${pc.name} is forgotten on this phone, but the PC couldn't be told (${told.message}). Unpair this phone in the PC's Settings too.`,
        );
    }
}

export const pairingApi: PairingApi = {
    parseOffer: (text) => parseOffer(text),
    redeem,
    status,
    forget,
    async list() {
        await usePairedPcsStore.getState().load();
        return usePairedPcsStore.getState().pcs;
    },
    current: () => currentPairedPc(usePairedPcsStore.getState()),
};
