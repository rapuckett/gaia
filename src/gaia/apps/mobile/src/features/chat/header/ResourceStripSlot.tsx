// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { useT } from '@/i18n/useT';
import { Notice, Stack, useAnnounceOnIos, useAppearance } from '@/ui';

import { ResourceStrip } from './ResourceStrip';

const NOTE_MS = 12_000;

/** The strip while Settings has it on; closing it hides it in every chat and says how it comes back, as on the desktop. */
export function ResourceStripSlot() {
    const show = useAppearance((s) => s.showResources);
    const setShow = useAppearance((s) => s.setShowResources);
    const [note, setNote] = useState(false);

    const [prevShow, setPrevShow] = useState(show);
    if (show !== prevShow) {
        setPrevShow(show);
        if (show) setNote(false);
    }

    useEffect(() => {
        if (show || !note) return undefined;
        const timer = setTimeout(() => setNote(false), NOTE_MS);
        return () => clearTimeout(timer);
    }, [show, note]);

    if (show) {
        return (
            <ResourceStrip
                onClose={() => {
                    setShow(false);
                    setNote(true);
                }}
            />
        );
    }
    if (!note) return null;
    return <HiddenNote onShow={() => setShow(true)} />;
}

function HiddenNote({ onShow }: { onShow: () => void }) {
    const t = useT();
    const message = t('resources.hiddenNote');
    useAnnounceOnIos(message);
    return (
        <Stack paddingX="lg" paddingY="xs">
            <Notice tone="info" role="status" message={message} action={{ label: t('resources.show'), onPress: onShow }} testID="resources-hidden-note" />
        </Stack>
    );
}
