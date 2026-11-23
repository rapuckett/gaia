// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';

import type { PushSecrets } from '../../../modules/gaia-push';
import type { PcPushClient, PcPushRecord, PcPushStatus } from './pcPushClient';
import { sweepStale, syncAll, syncPc, unregisterAll, unregisterPc, type PushDeps } from './pushRegistration';
import { RelayRequestError, RelayUnauthorizedError, RelayUnreachableError, type RelayClient, type RelayRegistration } from './relayClient';

const CONFIG = { relayUrl: 'https://relay.example', platform: 'apns', appId: 'com.example.gaia', environment: 'sandbox' } as const;

function world() {
    const log: string[] = [];
    const vault = new Map<string, PushSecrets>();
    const pcRecords = new Map<string, PcPushRecord | null>();
    const pcOff = new Set<string>();
    const pcDown = new Set<string>();
    const pcRefuses = new Map<string, string>();
    const dead = new Set<string>();
    let n = 0;
    let relayDown = false;
    let deleteDown = false;
    const relayHandles = new Set<string>();
    let maxHandles = Infinity;
    const relay: RelayClient = {
        async register(body: RelayRegistration) {
            if (relayDown) throw new RelayUnreachableError(null);
            if (relayHandles.size >= maxHandles) throw new RelayRequestError(409, 'too_many_handles');
            n += 1;
            relayHandles.add(`handle-${n}-aaaaaaaaaaaa`);
            log.push(`relay register ${JSON.stringify(body)}`);
            return { handle: `handle-${n}-aaaaaaaaaaaa`, secret: `secret-${n}`, sendToken: `send-${n}` };
        },
        async updateToken(h, token) {
            if (relayDown) throw new RelayUnreachableError(503);
            log.push(`relay put ${h.handle} ${token}`);
            if (dead.has(h.handle)) throw new RelayUnauthorizedError();
        },
        async remove(h) {
            log.push(`relay delete ${h.handle}`);
            if (deleteDown) throw new RelayUnreachableError(null);
            if (dead.has(h.handle)) throw new RelayUnauthorizedError();
            relayHandles.delete(h.handle);
        },
    };
    const pc = (pcId: string): PcPushClient => ({
        async put(record) {
            if (pcDown.has(pcId)) throw new Error('PC away');
            const refusal = pcRefuses.get(pcId);
            if (refusal) throw new GaiaApiError(422, refusal);
            log.push(`pc ${pcId} put ${JSON.stringify(record)}`);
            pcRecords.set(pcId, record);
            pcOff.delete(pcId);
        },
        async get(): Promise<PcPushStatus> {
            if (pcDown.has(pcId)) throw new Error('PC away');
            log.push(`pc ${pcId} get`);
            return { enabled: pcRecords.has(pcId) && !pcOff.has(pcId) };
        },
        async remove() {
            log.push(`pc ${pcId} delete`);
            pcRecords.delete(pcId);
        },
    });
    let k = 0;
    const deps: PushDeps = {
        config: CONFIG,
        relay,
        pc,
        vault: {
            load: async (id) => vault.get(id) ?? null,
            save: async (id, s) => void vault.set(id, s),
            dropKey: async (id) => {
                const s = vault.get(id);
                if (s) vault.set(id, { ...s, key: '' });
            },
            remove: async (id) => void vault.delete(id),
            removeAll: async () => vault.clear(),
            pcIds: async () => [...vault.keys()],
        },
        newKey: () => `key-${++k}`,
    };
    return {
        deps,
        log,
        vault,
        pcRecords,
        pcOff,
        pcDown,
        pcRefuses,
        dead,
        relayHandles,
        setRelayDown: (down: boolean) => (relayDown = down),
        setDeleteDown: (down: boolean) => (deleteDown = down),
        setMaxHandles: (max: number) => (maxHandles = max),
    };
}

let consoleOut: string[];
beforeEach(() => {
    consoleOut = [];
    for (const level of ['log', 'warn', 'error'] as const) {
        jest.spyOn(console, level).mockImplementation((...args: unknown[]) => void consoleOut.push(args.map((a) => (a instanceof Error ? `${a.message} ${String(a.cause)}` : String(a))).join(' ')));
    }
});
afterEach(() => {
    // Neither the relay secret, the send token nor the key is ever logged.
    expect(consoleOut.join('\n')).not.toMatch(/secret-\d|send-\d|key-\d/);
    jest.restoreAllMocks();
});

describe('push registration, one handle per paired PC', () => {
    it('registers a new PC, confirms the handle with a token PUT, and gives the PC the send token, never the secret', async () => {
        const w = world();
        await expect(syncPc('pc-a', 'tok-1', w.deps)).resolves.toEqual({ outcome: 'on' });
        expect(w.log[0]).toBe(`relay register ${JSON.stringify({ platform: 'apns', token: 'tok-1', app_id: 'com.example.gaia', environment: 'sandbox' })}`);
        expect(w.log[1]).toBe('relay put handle-1-aaaaaaaaaaaa tok-1');
        expect(w.log[2]).toMatch(/^pc pc-a put /);
        expect(w.pcRecords.get('pc-a')).toEqual({ relay_url: 'https://relay.example', handle: 'handle-1-aaaaaaaaaaaa', send_token: 'send-1', key: 'key-1', platform: 'apns' });
        expect(JSON.stringify(w.pcRecords.get('pc-a'))).not.toContain('secret');
        expect(w.vault.get('pc-a')).toEqual({ handle: 'handle-1-aaaaaaaaaaaa', secret: 'secret-1', sendToken: 'send-1', key: 'key-1' });
    });

    it('gives each PC its own handle and key', async () => {
        const w = world();
        await syncAll(['pc-a', 'pc-b'], 'tok-1', w.deps);
        expect(w.vault.get('pc-a')?.handle).not.toBe(w.vault.get('pc-b')?.handle);
        expect(w.vault.get('pc-a')?.key).not.toBe(w.vault.get('pc-b')?.key);
    });

    it('re-sends the token to the relay on every start, and leaves a PC that has push alone', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.log.length = 0;
        await expect(syncPc('pc-a', 'tok-2', w.deps)).resolves.toEqual({ outcome: 'on' });
        expect(w.log).toEqual(['relay put handle-1-aaaaaaaaaaaa tok-2', 'pc pc-a get']);
    });

    it('re-registers on a relay 401 and gives the PC the new handle and send token', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.dead.add('handle-1-aaaaaaaaaaaa');
        w.log.length = 0;
        await expect(syncPc('pc-a', 'tok-1', w.deps)).resolves.toEqual({ outcome: 'on' });
        expect(w.log[0]).toBe('relay put handle-1-aaaaaaaaaaaa tok-1');
        expect(w.log[1]).toMatch(/^relay register /);
        expect(w.log[2]).toBe('relay put handle-2-aaaaaaaaaaaa tok-1');
        expect(w.pcRecords.get('pc-a')).toMatchObject({ handle: 'handle-2-aaaaaaaaaaaa', send_token: 'send-2', key: 'key-2' });
        expect(w.vault.get('pc-a')?.secret).toBe('secret-2');
    });

    it('re-registers when the PC says push is off, deleting the old handle first', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.pcOff.add('pc-a');
        w.log.length = 0;
        await syncPc('pc-a', 'tok-1', w.deps);
        expect(w.log.slice(0, 4)).toEqual(['relay put handle-1-aaaaaaaaaaaa tok-1', 'pc pc-a get', 'relay delete handle-1-aaaaaaaaaaaa', expect.stringMatching(/^relay register /)]);
        expect(w.pcRecords.get('pc-a')?.handle).toBe('handle-2-aaaaaaaaaaaa');
    });

    it('keeps the registration for a PC that is away, and replaces it next start without leaving the old handle', async () => {
        const w = world();
        w.pcDown.add('pc-a');
        await expect(syncPc('pc-a', 'tok-1', w.deps)).resolves.toEqual({ outcome: 'pc_unreachable' });
        expect(w.vault.get('pc-a')?.handle).toBe('handle-1-aaaaaaaaaaaa');
        w.pcDown.delete('pc-a');
        w.log.length = 0;
        await syncPc('pc-a', 'tok-1', w.deps);
        expect(w.log).toContain('relay delete handle-1-aaaaaaaaaaaa');
        expect(w.pcRecords.get('pc-a')?.handle).toBe('handle-2-aaaaaaaaaaaa');
    });

    it("reports a PC's 422 as refused, with the PC's own words", async () => {
        const w = world();
        w.pcRefuses.set('pc-a', 'send_token: must be 32 bytes, base64url');
        await expect(syncAll(['pc-a', 'pc-b'], 'tok-1', w.deps)).resolves.toEqual({
            relay: 'ok',
            refused: [{ pcId: 'pc-a', detail: 'send_token: must be 32 bytes, base64url' }],
        });
        expect(w.pcRecords.has('pc-b')).toBe(true);
    });

    it('reports an unreachable relay', async () => {
        const w = world();
        w.setRelayDown(true);
        await expect(syncAll(['pc-a'], 'tok-1', w.deps)).resolves.toEqual({ relay: 'unreachable', refused: [] });
        expect(w.vault.size).toBe(0);
    });

    it('on 409 too_many_handles, deletes its own unpaired handles and tries once more', async () => {
        const w = world();
        await syncAll(['pc-a', 'pc-b'], 'tok-1', w.deps);
        w.setDeleteDown(true);
        await unregisterPc('pc-a', w.deps, { pcKnowsPhone: false });
        w.setDeleteDown(false);
        w.setMaxHandles(2);
        w.log.length = 0;
        await expect(syncPc('pc-c', 'tok-1', w.deps, new Set(['pc-b', 'pc-c']))).resolves.toEqual({ outcome: 'on' });
        expect(w.log).toContain('relay delete handle-1-aaaaaaaaaaaa');
        expect([...w.vault.keys()].sort()).toEqual(['pc-b', 'pc-c']);
    });

    it("refuses loudly when the relay is full of handles it can't free", async () => {
        const w = world();
        w.setMaxHandles(0);
        await expect(syncPc('pc-a', 'tok-1', w.deps)).resolves.toEqual({ outcome: 'relay_refused' });
        expect(consoleOut.join('\n')).toMatch(/refused this phone's registration for the PC pc-a/);
    });

    it('queues a relay delete it could not make, with the key already dropped, and retries it on the next start', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.setDeleteDown(true);
        await unregisterPc('pc-a', w.deps, { pcKnowsPhone: true });
        expect(w.vault.get('pc-a')).toMatchObject({ handle: 'handle-1-aaaaaaaaaaaa', secret: 'secret-1', key: '' });
        w.setDeleteDown(false);
        w.log.length = 0;
        await syncAll([], 'tok-1', w.deps);
        expect(w.log).toEqual(['relay delete handle-1-aaaaaaaaaaaa']);
        expect(w.vault.size).toBe(0);
    });

    it('a PC paired again before its old handle was deleted gets a fresh registration', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.setDeleteDown(true);
        await unregisterPc('pc-a', w.deps, { pcKnowsPhone: true });
        w.setDeleteDown(false);
        w.log.length = 0;
        await syncPc('pc-a', 'tok-1', w.deps);
        expect(w.log.slice(0, 2)).toEqual(['relay delete handle-1-aaaaaaaaaaaa', expect.stringMatching(/^relay register /)]);
        expect(w.vault.get('pc-a')).toMatchObject({ handle: 'handle-2-aaaaaaaaaaaa', key: 'key-2' });
    });

    it('sweeps stale handles on its own, without a token or the permission', async () => {
        const w = world();
        await syncAll(['pc-a', 'pc-b'], 'tok-1', w.deps);
        w.log.length = 0;
        await sweepStale(['pc-b'], w.deps);
        expect(w.log).toEqual(['relay delete handle-1-aaaaaaaaaaaa']);
        expect([...w.vault.keys()]).toEqual(['pc-b']);
    });

    it('turning push off removes it at every PC and the relay, then every secret, even ones still queued', async () => {
        const w = world();
        await syncAll(['pc-a', 'pc-b'], 'tok-1', w.deps);
        w.dead.add('handle-2-aaaaaaaaaaaa');
        w.log.length = 0;
        await expect(unregisterAll(w.deps, { pcKnowsPhone: true })).resolves.toBe(0);
        expect(w.log).toEqual(['pc pc-a delete', 'relay delete handle-1-aaaaaaaaaaaa', 'pc pc-b delete', 'relay delete handle-2-aaaaaaaaaaaa']);
        expect(w.vault.size).toBe(0);

        await syncAll(['pc-a'], 'tok-1', w.deps);
        w.setDeleteDown(true);
        await expect(unregisterAll(w.deps, { pcKnowsPhone: false })).resolves.toBe(1);
        expect(w.vault.size).toBe(0);
        expect(consoleOut.join('\n')).toMatch(/1 push relay handle\(s\) couldn't be deleted/);
    });

    it('unpairing deletes push on the PC and at the relay, then drops the secrets', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.log.length = 0;
        await unregisterPc('pc-a', w.deps, { pcKnowsPhone: true });
        expect(w.log).toEqual(['pc pc-a delete', 'relay delete handle-1-aaaaaaaaaaaa']);
        expect(w.vault.has('pc-a')).toBe(false);
    });

    it('a PC that already refused this phone is skipped, and a handle the relay dropped still unpairs', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.dead.add('handle-1-aaaaaaaaaaaa');
        w.log.length = 0;
        await unregisterPc('pc-a', w.deps, { pcKnowsPhone: false });
        expect(w.log).toEqual(['relay delete handle-1-aaaaaaaaaaaa']);
        expect(w.vault.has('pc-a')).toBe(false);
    });

    it('removes registrations for PCs no longer paired (a missed unpair, a reinstall)', async () => {
        const w = world();
        await syncAll(['pc-a', 'pc-b'], 'tok-1', w.deps);
        w.log.length = 0;
        await syncAll(['pc-b'], 'tok-1', w.deps);
        expect(w.log[0]).toBe('relay delete handle-1-aaaaaaaaaaaa');
        expect([...w.vault.keys()]).toEqual(['pc-b']);
    });
});
