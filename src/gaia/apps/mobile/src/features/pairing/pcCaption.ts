// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import type { Translate } from '@webui/i18n/translator';

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
export function pcCaption(pc: PairedPc, all: PairedPc[], t: Translate, locale: string): string {
    const address = isolate(homeAddress(pc), 'ltr');
    if (!pc.pairedAt || Number.isNaN(Date.parse(pc.pairedAt))) return address;
    const date = new Date(pc.pairedAt).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
    const paired = t.bare('mobileApp.pairing.pcs.pairedOn', { date: isolate(date, 'ltr') });
    const sameDay = all.some((o) => o.id !== pc.id && o.pairedAt && !Number.isNaN(Date.parse(o.pairedAt)) && dayKey(o.pairedAt) === dayKey(pc.pairedAt!));
    return sameDay ? `${paired}\n${address}` : paired;
}
