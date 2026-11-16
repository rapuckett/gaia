// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { stripIsolates } from '@webui/i18n/registry';

import { translator } from '@/i18n/useT';

import { pcCaption } from './pcCaption';
import type { PairedPc } from './service';

const t = translator('en');
const pc = (id: string, port: number, pairedAt?: string): PairedPc => {
    const origin = `https://192.168.1.20:${port}`;
    return { id, name: 'air', pairedAt, connection: { baseUrl: origin, pcId: id, routes: [{ kind: 'home', origin }] } };
};
const caption = (p: PairedPc, all: PairedPc[]) => stripIsolates(pcCaption(p, all, t, 'en-US'));

describe('pcCaption', () => {
    it('shows the pairing date alone when no other PC was paired that day', () => {
        const a = pc('a', 4243, '2026-11-10T09:00:00');
        const b = pc('b', 4245, '2026-11-12T09:00:00');
        expect(caption(a, [a, b])).toBe('Paired Nov 10, 2026');
    });

    it('adds the home address when another PC was paired the same day', () => {
        const a = pc('a', 4243, '2026-11-10T09:00:00');
        const b = pc('b', 4245, '2026-11-10T18:30:00');
        expect(caption(a, [a, b])).toBe('Paired Nov 10, 2026\n192.168.1.20:4243');
    });

    it('shows only the home address for a PC with no pairing date', () => {
        const a = pc('a', 4243);
        expect(caption(a, [a, pc('b', 4245, '2026-11-10T09:00:00')])).toBe('192.168.1.20:4243');
    });
});
