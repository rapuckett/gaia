// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';
import { useT, type Translate } from '../../i18n/useT';
import { UnsupportedCard } from './UnsupportedCard';

/**
 * ConfirmationCard — the stateless `needs_confirmation` surface (#2109, D1).
 *
 * Informational, not blocking: by the time this event reaches the UI the
 * sidecar run is already over, and the terminal `final` answer that follows
 * carries the actual hand-off guidance. So there is no Approve button (the
 * canonical event carries no args and no token to act on) and Dismiss is
 * local component state only — nothing is pending anywhere server-side.
 *
 * Rendering safety: `summary` embeds tool args derived from EMAIL CONTENT
 * (attacker-influenced). It must only ever render as a React text node —
 * never through ReactMarkdown/SafeMarkdown or any innerHTML path. Anti-spoof
 * layout: the machine `action` name is code-derived truth and is displayed
 * verbatim, visually separated from the summary block; the humanized label
 * derives from `action` alone, never by parsing `summary`.
 */

interface ConfirmationPayload {
    action: string;
    summary: string;
}

function isConfirmationPayload(value: unknown): value is ConfirmationPayload {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.action === 'string' && typeof v.summary === 'string';
}

/** Generic humanizer — no per-action lookup, so unknown tools stay safe. */
function humanizeAction(action: string, t: Translate): string {
    const words = action.replace(/_/g, ' ').trim();
    return words.length > 0 ? words : t.bare('cards.confirm.fallbackAction');
}

export function ConfirmationCard({ data }: { data: unknown }) {
    const t = useT();
    const [dismissed, setDismissed] = useState(false);

    if (!isConfirmationPayload(data)) {
        return <UnsupportedCard variant="invalid" render="needs_confirmation" data={data} />;
    }

    if (dismissed) {
        return (
            <div className="render-confirmation render-confirmation--dismissed">
                <span className="render-confirmation__dismissed-note">
                    {t('cards.confirm.dismissed')}
                </span>
            </div>
        );
    }

    return (
        <div className="render-confirmation">
            <div className="render-confirmation__header">
                <span className="render-confirmation__badge">{t('cards.confirm.badge')}</span>
                <span className="render-confirmation__label">{humanizeAction(data.action, t)}</span>
                <code className="render-confirmation__action">{data.action}</code>
            </div>
            {/* Plain text node only — attacker-influenced content. */}
            <pre className="render-confirmation__summary">{data.summary}</pre>
            <div className="render-confirmation__footer">
                <span className="render-confirmation__note">
                    {t('cards.confirm.note')}
                </span>
                <button
                    type="button"
                    className="render-confirmation__dismiss"
                    onClick={() => setDismissed(true)}
                >
                    {t('banner.dismiss')}
                </button>
            </div>
        </div>
    );
}
