// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { isolate } from '@webui/i18n/registry';

import { useActiveModel, useLocalModelStatus, useSelectModel } from '@/data';
import { pillText } from '@/features/model/modelStatusText';
import { useDirection, useT } from '@/i18n/useT';
import { Cloud, Cpu, Download, TriangleAlert } from '@/ui/icons';

import { ControlChip } from './ControlChip';
import { ModelMenu, type SwitchNotice } from './ModelMenu';

/** The model the next message runs on; tap to switch, download or see what only the PC can change. */
export function ModelChip({ turnRunning = false, initialOpen = false, initialInfoRow, forceSwitching, initialSwitchError, initialQueued }: { turnRunning?: boolean; initialOpen?: boolean; initialInfoRow?: string; forceSwitching?: string; initialSwitchError?: string; initialQueued?: string }) {
    const t = useT();
    const rtl = useDirection() === 'rtl';
    const [open, setOpen] = useState(initialOpen);
    // A model picked while a reply runs is used from the next message.
    const [queued, setQueued] = useState<string | null>(initialQueued ?? null);
    const { data } = useLocalModelStatus(open);
    const [switchError, setSwitchError] = useState<SwitchNotice | null>(initialSwitchError ? { message: initialSwitchError } : null);
    const active = useActiveModel().data;
    const select = useSelectModel();
    const { mutate } = select;
    useEffect(() => {
        if (turnRunning || !queued) return;
        mutate(queued, { onSettled: () => setQueued(null) });
    }, [turnRunning, queued, mutate]);
    const pill = pillText(data, t);
    const label = pill.name ?? t.bare('modelStatus.fallbackName');
    // Each model id is its own LTR island; the arrow follows the UI direction, and the fallback word follows the UI language.
    const queuedLabel = queued ? `${pill.name ? isolate(label, 'ltr') : label} ${rtl ? '←' : '→'} ${isolate(queued, 'ltr')}` : label;
    // As the desktop's chip: the provider for a cloud model, "Local" where the PC says a chat runs on it.
    const place = active?.remote ? active.provider_name || null : active?.inference_remote === false ? t.bare('modelStatus.local') : null;
    const notDownloaded = active?.downloaded === false;
    const warning = notDownloaded || !!switchError;
    const hint = switchError
        ? switchError.message
        : queued
          ? t('modelMenu.usedNext', { name: queued })
          : active?.config_error
            ? active.config_error
            : notDownloaded
              ? t('modelMenu.notDownloadedTitle', { name: label })
              : pill.remote
                ? undefined
                : t('modelStatus.runsHere');
    return (
        <>
            <ControlChip
                label={queuedLabel}
                place={queued ? null : place}
                icon={switchError ? TriangleAlert : notDownloaded ? Download : pill.remote ? Cloud : Cpu}
                warning={warning}
                accessibilityHint={hint}
                menu
                chip="model"
                value={pill.name && !queued ? 'ltr' : undefined}
                onPress={() => setOpen(true)}
                accessibilityLabel={pill.aria}
                testID="model-chip"
            />
            <ModelMenu
                open={open}
                onClose={() => setOpen(false)}
                turnRunning={turnRunning}
                queued={queued}
                onQueue={setQueued}
                initialInfoRow={initialInfoRow}
                forceSwitching={forceSwitching}
                switchError={switchError}
                onSwitchError={(message, detail) => setSwitchError(message ? { message, detail } : null)}
            />
        </>
    );
}
