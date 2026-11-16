// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { useActiveModel } from '@/data';
import { openSettings } from '@/features/settings/openSettings';
import { useT } from '@/i18n/useT';
import { Notice } from '@/ui';

/** How long a restore that worked stays up, and how often a pending or retrying one is read again. */
const RESTORED_NOTICE_MS = 6000;
const RECHECK_MS = 5000;
const RECHECKS = 24;

/** What the PC said (`holdOk` keeps the success notice up, for the dev gallery's scene). about putting the saved model back: news for a moment when it worked, a way to pick another when it did not. */
export function ModelRestoreNotice({ onPick = () => openSettings('model'), holdOk = false }: { onPick?: () => void; holdOk?: boolean }) {
    const t = useT();
    const active = useActiveModel();
    const restore = active.data?.restore;
    const [dismissed, setDismissed] = useState<string | null>(null);
    const [rechecks, setRechecks] = useState(0);
    const ok = restore?.status === 'restored';
    const message = restore && restore.status !== 'none' ? restore.message : null;
    const recheck = restore?.status === 'pending' || (restore?.status === 'failed' && !!restore.retry);
    const { refetch } = active;

    useEffect(() => {
        if (!recheck || rechecks >= RECHECKS) return;
        const timer = setTimeout(() => {
            setRechecks((n) => n + 1);
            void refetch();
        }, RECHECK_MS);
        return () => clearTimeout(timer);
    }, [recheck, rechecks, refetch]);

    useEffect(() => {
        if (!ok || !message || holdOk) return;
        const timer = setTimeout(() => setDismissed(message), RESTORED_NOTICE_MS);
        return () => clearTimeout(timer);
    }, [ok, message, holdOk]);

    if (!message || dismissed === message) return null;
    return (
        <Notice
            tone={ok ? 'info' : 'warning'}
            message={message}
            action={ok ? undefined : { label: t('startup.pickModel'), onPress: () => { setDismissed(message); onPick(); } }}
            onDismiss={() => setDismissed(message)}
            dismissLabel={t('banner.dismiss')}
            role="status"
            testID="model-restore-notice"
        />
    );
}
