// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { formatFitGb, ltrIn } from '@webui/components/setup/format';
import {
    catalogOf, extraModels, isNpu, pendingDownloads, shortfall, totals, type Selection, type Shortfall, type Totals,
} from '@webui/components/setup/selection';
import type { PreflightReport, SetupCatalogEntry, SetupPlan } from '@webui/types';
import type { ProviderSummary } from '@webui/types/api.gen';

import type { SetupRunOptions } from '@/api/client.types';
import type { Translate } from '@/i18n/useT';

import { tooBigText } from './modelsView';

export interface PlanView {
    chat: SetupCatalogEntry | undefined;
    /** Models the run will download, largest first. */
    pending: SetupCatalogEntry[];
    totals: Totals;
    /** The disk is short for the ticked models; null when they fit or the space is unknown. */
    short: Shortfall | null;
    /** A bigger verified model this PC lacks the memory for, named as a reason. */
    bigger: SetupCatalogEntry | undefined;
    /** What the chat model runs on: the NPU, or the graphics chip's name (null: the processor). */
    onNpu: boolean;
    gpuName: string | null;
    blocked: boolean;
    blockers: string[];
    /** RAM left for other apps with the recommended model loaded; null when unknown or the model has its own GPU memory. */
    leftForAppsGb: number | null;
}

/** What the plan card says and what Continue may do, from the plan, the selection and the PC's report. */
export function planView(plan: SetupPlan, selection: Selection, preflight: PreflightReport | undefined): PlanView {
    const catalog = catalogOf(plan);
    const chat = catalog.find((e) => e.id === selection.defaultChat);
    const bigger = catalog.find((e) => e.fit_code === 'memory' && e.chat_choice && e.support === 'verified');
    const blockers = preflight?.blockers ?? [];
    return {
        chat,
        pending: pendingDownloads(catalog, selection),
        totals: totals(plan, selection),
        short: shortfall(plan, selection),
        bigger: bigger && bigger.id !== chat?.id ? bigger : undefined,
        onNpu: !!chat && isNpu(chat),
        gpuName: preflight?.gpu_name ?? null,
        blocked: !!preflight && !preflight.compatible && blockers.length > 0,
        blockers,
        leftForAppsGb: plan.left_for_apps_gb ?? null,
    };
}

/** Local only is on when no cloud provider can be picked. */
export function cloudIsBlocked(providers: readonly Pick<ProviderSummary, 'id' | 'blocked'>[] | undefined): boolean {
    const cloud = (providers ?? []).filter((p) => p.id === 'fireworks' || p.id === 'amd');
    return cloud.length > 0 && cloud.every((p) => p.blocked);
}

/** What the plan's Continue starts the run with: the ticked models setup doesn't plan, whether the low disk was confirmed, and whether to wait out a dropped connection. */
export function startOptions(plan: SetupPlan, selection: Selection, acknowledgeLowDisk: boolean, keepTrying: boolean): SetupRunOptions {
    return { acknowledgeLowDisk, keepTrying, extraModels: extraModels(plan, selection) };
}

/** The reasons under the "this PC" card, in order: the model's room note, the fit line only for a plain fit, and no bigger-model pitch for a model short of room. */
export function planReasons(view: PlanView, chatChosen: boolean, t: Translate, locale: string): string[] {
    const { chat, bigger } = view;
    const reasons: string[] = [];
    if (!chatChosen) reasons.push(t('setup.plan.why.evaluated'));
    if (!chatChosen && view.leftForAppsGb != null) {
        reasons.push(t('setup.plan.why.headroom', { left: ltrIn(locale, formatFitGb(view.leftForAppsGb)) }));
    }
    const tight = chat?.fits === true && !!chat.tight;
    if (chat && (chat.fits === false || tight)) reasons.push(tooBigText(chat, t, locale));
    if (chat?.need_gb != null && chat.capacity_gb != null && chat.fits && !tight) {
        reasons.push(t('setup.plan.why.fits', { need: ltrIn(locale, formatFitGb(chat.need_gb)), have: ltrIn(locale, formatFitGb(chat.capacity_gb)) }));
    }
    reasons.push(t('setup.plan.why.private'));
    if (view.onNpu) reasons.push(t('setup.plan.why.noImagesNpu'));
    if (bigger?.need_gb != null && bigger.capacity_gb != null && chat?.fits !== false && !tight) {
        reasons.push(t('setup.plan.why.bigger', {
            name: bigger.name, need: ltrIn(locale, formatFitGb(bigger.need_gb)), have: ltrIn(locale, formatFitGb(bigger.capacity_gb)),
        }));
    }
    return reasons;
}
