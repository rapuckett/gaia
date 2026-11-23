// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { GaiaApiError } from '@/api/errors';
import type { Translate } from '@/i18n/useT';
import { formatBytes, formatSize } from '@webui/components/setup/format';
import { onlyTight } from '@webui/components/setup/selection';
import { getLocale, isolate, isolateUnit, keepTogether } from '@webui/i18n/registry';
import type { SetupCatalogEntry, SetupConfirm } from '@webui/types';

import { tooBigText } from '../steps/modelsView';

/** What a confirm sheet asks: the caller learns the answer from `useConfirmSheet().ask`. */
export interface ConfirmRequest {
    title: string;
    body: string[];
    /** A muted line under the body. */
    note?: string;
    confirmLabel: string;
    cancelLabel: string;
    /** Danger styling for a choice that deletes something. */
    danger?: boolean;
}

/** The confirmation a setup choice's 409 asks for, or null for any other error; the web UI's `setupConfirmFrom`. */
export function setupConfirmFrom(err: unknown): SetupConfirm | null {
    if (!(err instanceof GaiaApiError) || err.status !== 409 || !err.body) return null;
    const { code, acknowledge } = err.body;
    if ((code === 'no_fit' || code === 'low_disk') && typeof acknowledge === 'string') {
        return err.body as unknown as SetupConfirm;
    }
    return null;
}

/** The chosen models need more disk than is free: "Not enough free disk space". */
export function lowDiskRequest(short: { needGb: number; freeGb: number; freeUpGb: number }, t: Translate): ConfirmRequest {
    return {
        title: t('setup.confirm.lowDiskTitle'),
        body: [
            t.compose((say, code) =>
                say('setup.summary.short', {
                    need: isolateUnit(formatSize(short.needGb)),
                    free: isolateUnit(formatSize(short.freeGb)),
                    drive: isolate(say('setup.summary.theDrive'), getLocale(code).meta.dir),
                    freeUp: isolateUnit(formatSize(short.freeUpGb)),
                }),
            ),
        ],
        confirmLabel: t('setup.confirm.downloadAnyway'),
        cancelLabel: t('setup.confirm.changeModels'),
    };
}

/** Chosen models may not fit this PC's memory, or one fits but leaves other apps little; `why` is each one's reason, as the model list words it. */
export function noFitRequest(models: { name: string; why: string; tight?: boolean }[], t: Translate): ConfirmRequest {
    const tight = models.length > 0 && models.every((m) => m.tight);
    return {
        title: tight
            ? t('setup.confirm.tightOne', { name: isolateUnit(models[0].name) })
            : models.length === 1 ? t('setup.confirm.noFitOne', { name: isolateUnit(models[0].name) }) : t('setup.confirm.noFitMany'),
        body: tight ? [t('setup.confirm.tightBody')] : models.map((m) => `${m.name}: ${m.why}`),
        confirmLabel: t(tight ? 'setup.confirm.useAnyway' : 'setup.confirm.downloadAnyway'),
        cancelLabel: t('setup.confirm.pickSmaller'),
    };
}

/** The client's own question for the models `tooBig` returned; null when none, or one lacks the numbers and the server's 409 asks instead. */
export function noFitAsk(asks: SetupCatalogEntry[], t: Translate, locale: string): ConfirmRequest | null {
    if (asks.length === 0 || !asks.every((e) => e.need_gb != null)) return null;
    const tight = onlyTight(asks);
    return noFitRequest(asks.map((e) => ({ name: e.name, why: tooBigText(e, t, locale), tight })), t);
}

/** The model downloaded but failed its check: delete the copy and fetch it again. */
export function redownloadRequest(name: string, bytesTotal: number, t: Translate): ConfirmRequest {
    return {
        title: t('setup.redownload.title', { name: isolateUnit(name) }),
        body: [t.compose((say) => say('mobileApp.setup.redownload.body', { name: isolateUnit(name), size: keepTogether(`(${formatBytes(bytesTotal)})`) }))],
        confirmLabel: t('setup.redownload.confirm'),
        cancelLabel: t('setup.redownload.keep'),
        danger: true,
    };
}

/** A 409 from the server, worded by `detail.code` and carrying the server's own message. */
export function serverConfirmRequest(detail: SetupConfirm, t: Translate): ConfirmRequest {
    const lowDisk = detail.code === 'low_disk';
    return {
        title: lowDisk ? t('setup.confirm.lowDiskTitle') : t('setup.confirm.noFitServerTitle'),
        body: [detail.message],
        confirmLabel: lowDisk ? t('setup.confirm.downloadAnyway') : t('setup.confirm.useAnyway'),
        cancelLabel: t('setup.confirm.changeModels'),
    };
}
