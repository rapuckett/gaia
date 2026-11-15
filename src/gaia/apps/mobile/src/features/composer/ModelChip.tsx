// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { useLocalModelStatus, useSelectModel } from '@/data';
import { pillText } from '@/features/model/modelStatusText';
import { useT } from '@/i18n/useT';
import { Cloud, Cpu } from '@/ui/icons';

import { ControlChip } from './ControlChip';
import { ModelMenu } from './ModelMenu';

/** The model the next message runs on; tap to switch, download or see what only the PC can change. */
export function ModelChip({ turnRunning = false }: { turnRunning?: boolean }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    // A model picked while a reply runs is used from the next message.
    const [queued, setQueued] = useState<string | null>(null);
    const { data } = useLocalModelStatus(open);
    const select = useSelectModel();
    const { mutate } = select;
    useEffect(() => {
        if (turnRunning || !queued) return;
        mutate(queued, { onSettled: () => setQueued(null) });
    }, [turnRunning, queued, mutate]);
    const pill = pillText(data, t);
    const label = pill.name ?? t.bare('modelStatus.fallbackName');
    return (
        <>
            <ControlChip
                label={queued ? `${label} → ${queued}` : label}
                icon={pill.remote ? Cloud : Cpu}
                menu
                onPress={() => setOpen(true)}
                accessibilityLabel={pill.aria}
                testID="model-chip"
            />
            <ModelMenu open={open} onClose={() => setOpen(false)} turnRunning={turnRunning} queued={queued} onQueue={setQueued} />
        </>
    );
}
