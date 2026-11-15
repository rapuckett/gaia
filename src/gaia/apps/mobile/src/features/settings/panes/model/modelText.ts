// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { ref, type MessageKey } from '@webui/i18n/registry';

import { GaiaApiError } from '@/api/errors';
import type { ContextChoice, ProviderModel } from '@/api/client.types';
import { describeError, type Translate } from '@/i18n/useT';
import { ctxLabel } from '@webui/components/modelMeta';
import { usd } from '@webui/components/settings/cloudPrice';
import type { ModelPrice } from '@webui/types';

export { ctxLabel };

/** Same local model: Lemonade lists a registered `user.X` as `X`, in any case. */
export function sameModelId(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    const bare = (id: string) => id.toLowerCase().replace(/^user\./, '');
    return bare(a) === bare(b);
}

function shortName(model: string): string {
    const bare = /^(fireworks|amd)\./.test(model) ? model.slice(model.indexOf('.') + 1) : model;
    return bare.slice(bare.lastIndexOf('/') + 1);
}

export function modelLabel(m: Pick<ProviderModel, 'id' | 'display_name'>): string {
    return m.display_name || shortName(m.id);
}

/** What went wrong, in the PC's own words when it gave them. */
export function errorText(err: unknown, t: Translate): string {
    return err instanceof GaiaApiError ? err.detail : describeError(err, t);
}

/** Keeps a size with its unit whole inside right-to-left text. */
export function isolate(text: string): string {
    return `⁦${text}⁩`;
}

export const AUTOMATIC = 'auto';

/** The line that says what saving a context size did, as the web's ModelContextSize words it. */
export function contextOutcome(next: ContextChoice, t: Translate): string {
    const params = {
        name: next.display_name,
        size: next.chosen ? isolate(ctxLabel(next.chosen)) : ref('settings.ctx.automaticSize'),
    };
    const reason = next.reload?.reason;
    const key: MessageKey = next.reload?.started ? 'settings.ctx.reloading'
        : reason === 'already_loaded' ? 'settings.ctx.alreadyLoaded'
        : reason === 'warm_up' ? 'settings.ctx.warmUp'
        : reason === 'busy' ? 'settings.ctx.busy'
        : reason === 'not_gaias_server' ? 'settings.ctx.ownServer'
        : reason === 'restarting' ? 'settings.ctx.restarting'
        : 'settings.ctx.nextLoad';
    return t(key, params);
}

/** "$0.15 in · $0.50 out per 1M tokens", each price kept whole inside right-to-left text. */
export function priceText(price: ModelPrice | null | undefined, t: Translate): string {
    if (!price) return t('settings.price.unknown');
    return t('settings.price.perMillion', {
        input: isolate(usd(price.input_per_million)),
        output: isolate(usd(price.output_per_million)),
    });
}
