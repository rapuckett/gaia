// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';
import { formatDate } from '@webui/utils/memoryFormat.core';

import { composeDateLocale } from '@/features/schedules/scheduleText';

import type { PairedPc } from './service';

const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** host:port of the PC's home address, the one that tells two PCs of one name apart. */
function homeAddress(pc: PairedPc): string {
    const { routes, baseUrl } = pc.connection;
    const origin = routes?.find((r) => r.kind === 'home')?.origin ?? baseUrl;
    return origin.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');
}

/**
 * What tells a PC not in use apart from another of its name: the pairing date, plus the home
 * address when another listed PC was paired the same day, or alone when there is no date.
 */
export function pcCaption(pc: PairedPc, all: PairedPc[], t: Translate): string {
    const address = isolate(homeAddress(pc), 'ltr');
    if (!pc.pairedAt || Number.isNaN(Date.parse(pc.pairedAt))) return address;
    const paired = t.compose((say, code) => {
        // compose's `say` wraps the date in a first-strong isolate, so each half keeps it whole.
        return say('mobileApp.pairing.pcs.pairedOn', { date: formatDate(pc.pairedAt!, composeDateLocale(code, t)) });
    });
    const sameDay = all.some((o) => o.id !== pc.id && o.pairedAt && !Number.isNaN(Date.parse(o.pairedAt)) && dayKey(o.pairedAt) === dayKey(pc.pairedAt!));
    return sameDay ? `${paired}\n${address}` : paired;
}
