// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '../../i18n/useT';
import { unsupportedView } from '../../utils/renderCards.core';

export interface UnsupportedCardProps {
    /** 'unknown' = no card registered for this render key; 'invalid' = the
     *  registered card rejected this data's shape. */
    variant: 'unknown' | 'invalid';
    /** The render key that failed to produce a card. */
    render: string;
    /** The raw payload — shown as a collapsible JSON dump either way, so
     *  the user (and whoever's debugging) can still see what arrived. */
    data: unknown;
}

/**
 * Explicit fallback card — the loud path for a render key with no
 * registered component, or a registered component whose payload validation
 * failed. Never renders nothing: an unrecognized card must be visible and
 * debuggable, not silently dropped.
 */
export function UnsupportedCard({ variant, render, data }: UnsupportedCardProps) {
    const t = useT();
    const { pretty, bytes } = unsupportedView(variant, data);
    const tooLarge = pretty === null;

    const message = t(variant === 'unknown' ? 'cards.unsupported.unknown' : 'cards.unsupported.invalid', { render });

    return (
        <div className="render-unsupported">
            <p className="render-unsupported__message">{message}</p>
            <details className="render-unsupported__details">
                <summary>{t('cards.unsupported.raw')}</summary>
                {tooLarge ? (
                    <p className="render-unsupported__too-large">
                        {t('cards.unsupported.tooLarge', { size: String(bytes) })}
                    </p>
                ) : (
                    <pre className="render-unsupported__json">{pretty}</pre>
                )}
            </details>
        </div>
    );
}
