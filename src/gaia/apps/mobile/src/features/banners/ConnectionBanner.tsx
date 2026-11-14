// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';

import { useSystemStatus } from '@/data';
import { useT } from '@/i18n/useT';
import { useBannerDismissedStore } from '@/state/bannerDismissed';
import { Notice, ProgressLine, Stack } from '@/ui';

import { pickBanner } from './pickBanner';

/** The connection banner for the top of a `Screen`; renders nothing while all is well or no PC is connected. */
export function ConnectionBanner() {
    const t = useT();
    const { data, error, refetch } = useSystemStatus();
    const picked = pickBanner(data, error, t);
    const { dismissed, dismiss, reconcile } = useBannerDismissedStore();
    useEffect(() => reconcile(picked), [picked?.id, picked?.dismissible, reconcile]); // eslint-disable-line react-hooks/exhaustive-deps
    const banner = picked && picked.id === dismissed ? null : picked;
    if (!banner) return null;
    return (
        <Stack gap="sm" testID={`banner-${banner.id}`}>
            <Notice
                tone={banner.tone}
                title={banner.title}
                message={banner.message}
                onDismiss={banner.dismissible ? () => dismiss(banner.id) : undefined}
                action={banner.retry ? { label: t('settings.key.checkAgain'), onPress: () => void refetch() } : undefined}
            />
            {banner.progress ? <ProgressLine value={banner.progress.value} label={banner.progress.label} /> : null}
        </Stack>
    );
}
