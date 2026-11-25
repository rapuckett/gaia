// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import * as memoryApi from '../../services/memoryApi';
import { useT } from '../../i18n/useT';
import { useAnnounce } from '../LiveAnnouncer';
import { isolate } from '../../i18n/registry';
import {
    EMBEDDER_PROFILE as PROFILE,
    embedderChoices,
    embedderDeviceKey,
    embedderHints,
    embedderRequestDevice,
    embedderSelected,
} from '../../utils/embedderSetting.core';

/** Where documents and memory are embedded, and the choice to move it. */
export function EmbedderSetting() {
    const t = useT();
    const [view, setView] = useState<memoryApi.EmbedderView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(false);
    useAnnounce(notice ? t('settings.memory.embedder.changed') : null);

    useEffect(() => {
        memoryApi.getEmbedder()
            .then(setView)
            .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, []);

    const apply = useCallback(async (value: string) => {
        setBusy(true);
        setError(null);
        setNotice(false);
        try {
            const next = await memoryApi.setEmbedder(embedderRequestDevice(value));
            setView(next);
            setNotice(next.changed !== false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            // Show what is saved now, not the choice that was refused.
            await memoryApi.getEmbedder().then(setView).catch(() => undefined);
        } finally {
            setBusy(false);
        }
    }, []);

    if (!view) {
        if (error) return <p className="settings-error" role="alert">{error}</p>;
        return <p className="settings-hint"><Loader2 size={13} className="spin" /> {t('settings.memory.embedder.checking')}</p>;
    }
    const { current, npuUnproven, notDownloaded } = embedderHints(view);
    const deviceName = (device: string) => t.bare(embedderDeviceKey(device));
    const choiceLabel = (c: ReturnType<typeof embedderChoices>[number]) => {
        if (c.kind === 'default') return t.bare('settings.memory.embedder.default', { device: deviceName(c.device) });
        if (c.kind === 'unavailable') return t.bare('settings.memory.embedder.unavailable', { device: deviceName(c.device) });
        if (c.kind === 'unproven') return t.bare('settings.memory.embedder.unproven', { device: deviceName(c.device) });
        return deviceName(c.device);
    };
    return (
        <>
            <div className="model-in-use-field">
                <label className="settings-label" htmlFor="embedder-device">{t('settings.memory.embedder.label')}</label>
                <select
                    id="embedder-device"
                    className="settings-input"
                    value={embedderSelected(view)}
                    onChange={(e) => void apply(e.target.value)}
                    disabled={busy}
                >
                    {embedderChoices(view).map((c) => (
                        <option key={c.value} value={c.value} disabled={c.disabled}>{choiceLabel(c)}</option>
                    ))}
                </select>
            </div>
            <span className="settings-hint">
                {t('settings.memory.embedder.runsOn', { name: isolate(current?.display_name ?? view.device, 'ltr'), device: deviceName(view.device) })}
                {' '}{t('settings.memory.embedder.why')}
            </span>
            {npuUnproven && (
                <span className="settings-hint">{t('settings.memory.embedder.npuUnproven')}</span>
            )}
            {notDownloaded && (
                <span className="settings-hint">{t('settings.memory.embedder.notDownloaded')}</span>
            )}
            {busy && <span className="settings-hint"><Loader2 size={13} className="spin" /> {t('settings.memory.embedder.applying')}</span>}
            {notice && <p className="settings-ok">{t('settings.memory.embedder.changed')}</p>}
            {error && <p className="settings-error" role="alert">{error}</p>}
        </>
    );
}
