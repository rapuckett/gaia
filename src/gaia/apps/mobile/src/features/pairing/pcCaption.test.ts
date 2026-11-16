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
const caption = (p: PairedPc, all: PairedPc[]) => stripIsolates(pcCaption(p, all, t));

describe('pcCaption', () => {
    it('shows the pairing date alone when no other PC was paired that day', () => {
        const a = pc('a', 4243, '2020-11-10T09:00:00');
        const b = pc('b', 4245, '2020-11-12T09:00:00');
        expect(caption(a, [a, b])).toBe('Paired Nov 10, 2020');
    });

    it('adds the home address when another PC was paired the same day', () => {
        const a = pc('a', 4243, '2020-11-10T09:00:00');
        const b = pc('b', 4245, '2020-11-10T18:30:00');
        expect(caption(a, [a, b])).toBe('Paired Nov 10, 2020\n192.168.1.20:4243');
    });

    it('shows only the home address for a PC with no pairing date', () => {
        const a = pc('a', 4243);
        expect(caption(a, [a, pc('b', 4245, '2020-11-10T09:00:00')])).toBe('192.168.1.20:4243');
    });

    it('drops the year for a PC paired this year and keeps it for another year', () => {
        const thisYear = new Date(new Date().getFullYear(), 10, 10, 9).toISOString();
        const a = pc('a', 4243, thisYear);
        const b = pc('b', 4245, '2020-11-10T09:00:00');
        expect(caption(a, [a, b])).toBe('Paired Nov 10');
        expect(caption(b, [a, b])).toBe('Paired Nov 10, 2020');
    });

    it('wraps the date in a first-strong isolate in both halves of the Arabic caption', () => {
        const a = pc('a', 4243, '2020-11-10T09:00:00');
        const text = pcCaption(a, [a], translator('ar'));
        expect(text.match(/\u2068[^\u2068\u2069]*\u2069/g)).toHaveLength(2);
        expect(text).toContain('\u2068Nov 10, 2020\u2069');
    });

    it('writes the Arabic half in Arabic and its English gloss with the English date', () => {
        const a = pc('a', 4243, '2020-11-10T09:00:00');
        const text = stripIsolates(pcCaption(a, [a], translator('ar')));
        expect(text).toContain('(Paired Nov 10, 2020)');
        expect(text).toMatch(/نوفمبر/);
    });
});
