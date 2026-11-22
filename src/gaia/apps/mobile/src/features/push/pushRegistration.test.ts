// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { PushSecrets } from '../../../modules/gaia-push';
import type { PcPushClient, PcPushRecord, PcPushStatus } from './pcPushClient';
import { syncAll, syncPc, unregisterPc, type PushDeps } from './pushRegistration';
import { RelayUnauthorizedError, RelayUnreachableError, type RelayClient, type RelayRegistration } from './relayClient';

const CONFIG = { relayUrl: 'https://relay.example', platform: 'apns', appId: 'com.example.gaia', environment: 'sandbox' } as const;

function world() {
    const log: string[] = [];
    const vault = new Map<string, PushSecrets>();
    const pcRecords = new Map<string, PcPushRecord | null>();
    const pcOff = new Set<string>();
    const pcDown = new Set<string>();
    const dead = new Set<string>();
    let n = 0;
    let relayDown = false;
    const relay: RelayClient = {
        async register(body: RelayRegistration) {
            if (relayDown) throw new RelayUnreachableError(null);
            n += 1;
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
            if (dead.has(h.handle)) throw new RelayUnauthorizedError();
        },
    };
    const pc = (pcId: string): PcPushClient => ({
        async put(record) {
            if (pcDown.has(pcId)) throw new Error('PC away');
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
            remove: async (id) => void vault.delete(id),
            pcIds: async () => [...vault.keys()],
        },
        newKey: () => `key-${++k}`,
    };
    return { deps, log, vault, pcRecords, pcOff, pcDown, dead, setRelayDown: (down: boolean) => (relayDown = down) };
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
    it('registers a new PC and gives it the send token, never the secret', async () => {
        const w = world();
        await expect(syncPc('pc-a', 'tok-1', w.deps)).resolves.toBe('on');
        expect(w.log[0]).toBe(`relay register ${JSON.stringify({ platform: 'apns', token: 'tok-1', app_id: 'com.example.gaia', environment: 'sandbox' })}`);
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
        await expect(syncPc('pc-a', 'tok-2', w.deps)).resolves.toBe('on');
        expect(w.log).toEqual(['relay put handle-1-aaaaaaaaaaaa tok-2', 'pc pc-a get']);
    });

    it('re-registers on a relay 401 and gives the PC the new handle and send token', async () => {
        const w = world();
        await syncPc('pc-a', 'tok-1', w.deps);
        w.dead.add('handle-1-aaaaaaaaaaaa');
        w.log.length = 0;
        await expect(syncPc('pc-a', 'tok-1', w.deps)).resolves.toBe('on');
        expect(w.log[0]).toBe('relay put handle-1-aaaaaaaaaaaa tok-1');
        expect(w.log[1]).toMatch(/^relay register /);
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
        await expect(syncPc('pc-a', 'tok-1', w.deps)).resolves.toBe('pc_unreachable');
        expect(w.vault.get('pc-a')?.handle).toBe('handle-1-aaaaaaaaaaaa');
        w.pcDown.delete('pc-a');
        w.log.length = 0;
        await syncPc('pc-a', 'tok-1', w.deps);
        expect(w.log).toContain('relay delete handle-1-aaaaaaaaaaaa');
        expect(w.pcRecords.get('pc-a')?.handle).toBe('handle-2-aaaaaaaaaaaa');
    });

    it('reports an unreachable relay', async () => {
        const w = world();
        w.setRelayDown(true);
        await expect(syncAll(['pc-a'], 'tok-1', w.deps)).resolves.toBe('unreachable');
        expect(w.vault.size).toBe(0);
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
