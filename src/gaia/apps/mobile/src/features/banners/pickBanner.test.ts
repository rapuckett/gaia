// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { STATUS_LOST_MS } from '@/api/constants';
import { GaiaApiError, GaiaNetworkError } from '@/api/errors';
import type { SystemStatus } from '@/api/client.types';
import { createStatusHealth } from '@/data/statusHealth';
import { translator } from '@/i18n/useT';

import { pickBanner } from './pickBanner';

const t = translator('en');
const OK = {
    lemonade_running: true,
    context_size_sufficient: true,
    model_context_size: 65536,
    download_progress: null,
    init_state: 'ready',
} as unknown as SystemStatus;
const withStatus = (patch: Partial<SystemStatus>) => ({ ...OK, ...patch }) as SystemStatus;
const id = (status: SystemStatus | undefined, error: unknown = null) => pickBanner(status, error, t)?.id ?? null;

describe('pickBanner', () => {
    it('shows the web banner for each state, in the web order', () => {
        expect(id(OK)).toBeNull();
        expect(id(undefined)).toBeNull();
        expect(id(undefined, new GaiaNetworkError('http://pc', new Error('x')))).toBe('unreachable');
        const off = pickBanner(undefined, new GaiaNetworkError('http://pc', new Error('x')), t);
        expect(off?.title).toBe(t('mobileApp.pairing.off.title'));
        expect(off?.message).toBe(t('mobileApp.pairing.unreachable.body'));
        expect(pickBanner(undefined, new GaiaApiError(404, 'gone'), t)?.title).toBe(t('banner.unreachable'));
        expect(id(undefined, new GaiaApiError(503, 'busy'))).toBe('backendError');
        expect(id(undefined, new GaiaApiError(504, 'gateway timeout'))).toBe('slow');
        expect(id(withStatus({ init_state: 'initializing', init_tasks: [{ name: 'Models', status: 'running' }] }))).toBe('starting');
        expect(id(withStatus({ lemonade_running: false }))).toBe('serverStopped');
        expect(id(withStatus({ lemonade_running: false, lemonade_error: 'timed out' }))).toBe('serverHung');
        expect(id(withStatus({ context_size_sufficient: false }))).toBe('contextTooSmall');
        const download = { state: 'downloading', model_name: 'M', percent: 50, file: 'a.gguf', file_index: 1, total_files: 2, downloaded_bytes: 5e9, total_bytes: 1e10, message: null } as const;
        const banner = pickBanner(withStatus({ lemonade_running: false, download_progress: download }), null, t);
        expect(banner?.id).toBe('download');
        expect(banner?.progress?.value).toBe(0.5);
        expect(banner?.progress?.label).toBe('50% · 5.00 / 10.00 GB');
        expect(banner?.message).toBe(t('banner.download.file', { index: 1, total: 2 }));
        expect(banner?.detail).toBe('\u2066a.gguf\u2069');
        expect(id(withStatus({ download_progress: { ...download, state: 'error' } }))).toBe('download');
    });

    it('shows a picked model loading, or failing, ahead of connection trouble and after a download', () => {
        const load = { model: 'Qwen3-4B-Instruct-GGUF', seconds: 12, error: null };
        const loading = pickBanner(OK, new GaiaApiError(503, 'busy'), t, null, { load });
        expect(loading).toMatchObject({ id: 'pickLoad', tone: 'info', message: t('banner.pickLoad.canType'), progress: {} });
        expect(loading?.title).toBe(`${t('banner.pickLoad.loading', { model: 'Qwen3-4B-Instruct-GGUF' })} \u2066${t('banner.pickLoad.seconds', { s: 12 })}\u2069`);

        const failed = pickBanner(OK, null, t, null, { load: { ...load, error: { key: 'banner.pickLoad.lostTrack', reason: 'timed out' } }, name: 'Qwen 4B' });
        expect(failed).toMatchObject({ id: 'pickLoad', tone: 'danger', pickRetry: true, dismissible: true });
        expect(failed?.title).toBe(t('banner.pickLoad.failed', { model: 'Qwen 4B' }));
        expect(failed?.message).toBe(t('banner.pickLoad.lostTrack', { reason: 'timed out' }));
        expect(pickBanner(OK, null, t, null, { load: { ...load, error: { reason: 'out of memory' } } })?.message).toBe('out of memory');

        const download = { state: 'downloading', model_name: 'M', percent: 5, file: null, file_index: 1, total_files: 1, downloaded_bytes: 1, total_bytes: 10, message: null } as const;
        expect(pickBanner(withStatus({ download_progress: download }), null, t, null, { load })?.id).toBe('download');
        expect(pickBanner(OK, null, t, null, { load: null })).toBeNull();
    });
});

describe('backend errors read as one sentence', () => {
    it.each([[502, 'down', '502 down'], [503, '', '503']])('%i puts the status once in the title and the raw cause in details', (status, body, details) => {
        const banner = pickBanner(undefined, new GaiaApiError(status, body), t);
        expect(banner?.title).toBe(t('mobileApp.error.backend', { status }));
        expect(banner?.title).not.toMatch(/answered with an error/);
        expect(banner?.details).toBe(details);
    });

    it('a network error keeps its own message and has no details', () => {
        const banner = pickBanner(undefined, new GaiaNetworkError('http://pc', new Error('x')), t);
        expect(banner?.title).toBe(t('mobileApp.pairing.off.title'));
        expect(banner?.details).toBeUndefined();
    });

    it('glosses a download of unknown size once in Arabic', () => {
        const title = pickBanner(withStatus({ download_progress: { state: 'starting', model_name: 'M', percent: 0, file: null, file_index: 0, total_files: 0, downloaded_bytes: 0, total_bytes: 0, message: null } }), null, translator('ar'))?.title ?? '';
        expect(title.match(/large download/g)).toHaveLength(1);
        expect(title).toContain('تنزيل كبير');
    });

    it('shows slow for a 504 only, below the downloads and pick loads, and clears with the error', () => {
        const slow = new GaiaApiError(504, 'gateway timeout');
        const banner = pickBanner(undefined, slow, t);
        expect([banner?.title, banner?.message, banner?.tone, banner?.retry]).toEqual([t('banner.slow'), t('banner.slowHint'), 'warning', true]);
        const download = { state: 'downloading', model_name: 'M', percent: 50, file: 'a.gguf', file_index: 1, total_files: 2, downloaded_bytes: 5e9, total_bytes: 1e10, message: null } as const;
        expect(id(withStatus({ download_progress: download }), slow)).toBe('download');
        expect(pickBanner(undefined, slow, t, null, { load: { model: 'M', seconds: 3 } as never })?.id).toBe('pickLoad');
        expect(id(OK)).toBeNull();
    });

    it('says a PC that answered mid-download has gone away rather than show its last download, and keeps it for an HTTP error', () => {
        const download = { state: 'downloading', model_name: 'M', percent: 50, file: 'a.gguf', file_index: 1, total_files: 2, downloaded_bytes: 5e9, total_bytes: 1e10, message: null } as const;
        const last = withStatus({ download_progress: download });
        expect(id(last, new GaiaNetworkError('http://pc', new Error('refused')))).toBe('unreachable');
        expect(pickBanner(last, new Error('aborted'), t, null, { lost: true })?.id).toBe('unreachable');
        expect(id(OK, new GaiaNetworkError('http://pc', new Error('refused')))).toBe('unreachable');
        expect(id(last, new GaiaApiError(503, 'busy'))).toBe('download');
        expect(id(OK, new GaiaApiError(503, 'busy'))).toBe('backendError');
    });

    it('follows the status streak: nothing for the first two slow answers, slow at three, unreachable when lost', () => {
        const h = createStatusHealth();
        const timeout = new Error('aborted');
        const pick = () => ({ ...h.get() });
        const shown = (e: unknown) => pickBanner(undefined, e, t, null, pick())?.id ?? null;
        h.record('slow');
        expect(shown(timeout)).toBeNull();
        expect(shown(new GaiaApiError(504, 'gateway'))).toBeNull();
        h.record('slow');
        expect(shown(timeout)).toBeNull();
        h.record('slow');
        expect(shown(timeout)).toBe('slow');
        expect(shown(new GaiaApiError(500, 'boom'))).toBe('slow');
    });

    it('still shows unreachable for a real network failure, a 502 and five silent minutes', () => {
        let now = 0;
        const h = createStatusHealth(() => now);
        h.record('slow');
        h.record('unreachable');
        expect(pickBanner(undefined, new GaiaNetworkError('u', new Error('r')), t, null, h.get())?.id).toBe('unreachable');
        h.record('ok');
        h.record('slow');
        now = STATUS_LOST_MS;
        h.record('slow');
        expect(pickBanner(undefined, new GaiaApiError(504, 'gateway'), t, null, h.get())?.id).toBe('unreachable');
        expect(pickBanner(undefined, new Error('aborted'), t, null, h.get())?.id).toBe('unreachable');
    });
});
