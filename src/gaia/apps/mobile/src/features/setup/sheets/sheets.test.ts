// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { readFileSync } from 'fs';
import { join } from 'path';

import { stripIsolates } from '@webui/i18n/registry';
import { translator } from '@webui/i18n/translator';

import { GaiaApiError } from '@/api/errors';
import type { Translate } from '@/i18n/useT';

import { createConfirmBroker } from './ConfirmSheet';
import { logsByStage } from './logLines';
import { lowDiskRequest, noFitRequest, redownloadRequest, serverConfirmRequest, setupConfirmFrom, type ConfirmRequest } from './setupConfirm';

type Say = (key: string, params?: Record<string, string>) => string;
const say: Say = (key, params) => `${key}${params ? JSON.stringify(params) : ''}`;
const t = Object.assign(say, { compose: (build: (say: Say, code: string) => string) => build(say, 'en') }) as unknown as Translate;
const request: ConfirmRequest = { title: 'T', body: [], confirmLabel: 'Yes', cancelLabel: 'No' };

describe('confirm broker', () => {
    it('hands the confirm to the caller that asked', async () => {
        const seen: unknown[] = [];
        const broker = createConfirmBroker((p) => seen.push(p));
        const answer = broker.ask(request);
        broker.settle(true);
        await expect(answer).resolves.toBe(true);
        expect(seen).toHaveLength(2);
        expect(seen[1]).toBeNull();
    });

    it('answers no on cancel and when a newer question replaces the open one', async () => {
        const broker = createConfirmBroker(() => undefined);
        const first = broker.ask(request);
        const second = broker.ask(request);
        await expect(first).resolves.toBe(false);
        broker.settle(false);
        await expect(second).resolves.toBe(false);
    });
});

describe('setupConfirmFrom', () => {
    const conflict = (body: Record<string, unknown> | null, status = 409) =>
        new GaiaApiError(status, 'x', undefined, undefined, body);

    it('reads a confirmable 409 and ignores every other error', () => {
        const body = { code: 'low_disk', message: 'm', acknowledge: 'acknowledge_low_disk' };
        expect(setupConfirmFrom(conflict(body))).toEqual(body);
        expect(setupConfirmFrom(conflict(body, 500))).toBeNull();
        expect(setupConfirmFrom(conflict({ code: 'busy', message: 'm' }))).toBeNull();
        expect(setupConfirmFrom(conflict(null))).toBeNull();
        expect(setupConfirmFrom(new Error('x'))).toBeNull();
    });
});

describe('confirm title', () => {
    it('wraps in full: the sheet title carries no line cap', () => {
        const host = readFileSync(join(__dirname, '../../../ui/overlays/SheetHost.tsx'), 'utf8');
        const title = host.slice(host.indexOf('accessibilityRole="header"') - 120, host.indexOf('{entry.title}') + 20);
        expect(title).toContain('{entry.title}');
        expect(title).not.toContain('numberOfLines');
    });
});

describe('confirm wording', () => {
    it('low disk carries the three sizes, kept left to right', () => {
        const r = lowDiskRequest({ needGb: 23.3, freeGb: 10, freeUpGb: 13.3 }, t);
        expect(r.title).toBe('setup.confirm.lowDiskTitle');
        expect(r.body[0]).toContain('23.3 GB');
        expect(r.body[0]).toContain('10.0 GB');
        expect(r.body[0]).toContain('13.3 GB');
        expect(r.cancelLabel).toBe('setup.confirm.changeModels');
    });

    it('may-not-fit names the model for one and lists each for many', () => {
        expect(noFitRequest([{ name: 'Big', why: 'w' }], t).title).toContain('"name":"\u2066Big\u2069"');
        const many = noFitRequest([{ name: 'A', why: 'a' }, { name: 'B', why: 'b' }], t);
        expect(many.title).toBe('setup.confirm.noFitMany');
        expect(many.body).toEqual(['A: a', 'B: b']);
    });

    it('low disk is one composed sentence with each value isolated, and no cap on the title', () => {
        const body = lowDiskRequest({ needGb: 23.3, freeGb: 10, freeUpGb: 13.3 }, t).body;
        expect(body).toHaveLength(1);
        const params = JSON.parse(body[0]!.slice('setup.summary.short'.length)) as Record<string, string>;
        expect(params.need).toBe('\u206623.3 GB\u2069');
        expect(params.drive).toBe('\u2066setup.summary.theDrive\u2069');
        expect(params.drive).not.toContain('{');
    });

    it('re-download names the model and the size as separate isolated values in one sentence', () => {
        const r = redownloadRequest('Qwen3 4B', 6_000_000_000, t);
        expect(r.title).toBe('setup.redownload.title{"name":"\u2066Qwen3 4B\u2069"}');
        expect(r.body).toHaveLength(1);
        const params = JSON.parse(r.body[0]!.slice('mobileApp.setup.redownload.body'.length)) as Record<string, string>;
        expect(stripIsolates(params.name!)).toBe('Qwen3 4B');
        expect(stripIsolates(params.size!)).toMatch(/^\(.*GB\)$/);
        expect(params.name).not.toContain('GB');
        expect(r.danger).toBe(true);
    });

    it('re-download in Arabic keeps "(6.0 GB)" as one unbreakable left-to-right unit with the parentheses inside', () => {
        const [body] = redownloadRequest('Qwen3 4B', 6_000_000_000, translator('ar')).body;
        expect(body).toContain('\u2068(6.0\u00A0GB)\u2069');
    });

    it('a server no-fit says "use it anyway" with the server message', () => {
        const r = serverConfirmRequest({ code: 'no_fit', message: 'msg', acknowledge: 'acknowledge_no_fit' }, t);
        expect(r.confirmLabel).toBe('setup.confirm.useAnyway');
        expect(r.body).toEqual(['msg']);
    });
});

describe('logsByStage', () => {
    it('lists only stages with lines, the screen notes first, redrawn bars collapsed', () => {
        const run = { state: 'running', logs: { download: ['a 10%', 'a 20%', 'done'] } } as never;
        const out = logsByStage(run, { check: ['noted'] });
        expect(out).toEqual([
            { stage: 'check', lines: ['noted'] },
            { stage: 'download', lines: ['a 20%', 'done'] },
        ]);
    });
});
