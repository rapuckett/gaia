// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useGaiaClient, useModelActions } from '@/data';
import { useT } from '@/i18n/useT';
import { openChat } from '@/features/nav/navigation';
import { reopenSetup } from '@/features/setup/reopenSetup';
import { useGateRecheck } from '@/features/setup/gateRecheck';
import { useAnnounce } from '@/platform/useAnnounce';
import { useBannerDismissedStore } from '@/state/bannerDismissed';
import { useChatAlertBannerStore, type ChatAlertBanner } from '@/state/chatAlertBanner';
import { usePickLoadStore } from '@/state/pickLoad';
import { Disclosure, Ltr, Notice, ProgressLine, Stack } from '@/ui';

import { isServerDownBanner } from './pickBanner';
import { ServerDownCard } from './ServerDownCard';
import { useBannerPick } from './useBannerPick';

export function ChatAlertNotice({ alert }: { alert: ChatAlertBanner }) {
    const t = useT();
    const router = useRouter();
    const dismiss = useChatAlertBannerStore((s) => s.dismiss);
    return (
        <Notice
            tone={alert.tone}
            title={alert.title}
            message={alert.message}
            onDismiss={dismiss}
            action={{
                label: t('mobileApp.banner.openChat'),
                onPress: () => {
                        dismiss();
                        openChat(router, alert.sessionId);
                    },
                }}
            testID="banner-chat-alert"
        />
    );
}

function BannerDetails({ text }: { text: string }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    return (
        <Disclosure title={t('setup.progress.details')} open={open} onToggle={() => setOpen((o) => !o)}>
            <Ltr>{text}</Ltr>
        </Disclosure>
    );
}

/** The banner for the top of a `Screen`: a chat alert, then connection trouble; nothing while all is well or no PC is connected. */
export function ConnectionBanner({ hideServerDown = false }: { /** Settings carries the model server's state in its own pane, so no server-down card sits above it. */ hideServerDown?: boolean } = {}) {
    const t = useT();
    const client = useGaiaClient();
    const { picked, refetch, status } = useBannerPick();
    const redownload = useModelActions(picked?.downloadRetry ?? null, status.data);
    const { dismissed, dismiss, reconcile } = useBannerDismissedStore();
    useEffect(() => reconcile(picked), [picked?.id, picked?.dismissible, reconcile]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = hideServerDown && isServerDownBanner(picked) ? null : picked;
    const banner = shown && shown.id === dismissed ? null : shown;
    const recheckGate = useGateRecheck();
    const alert = useChatAlertBannerStore((s) => s.alert);
    useAnnounce([alert?.title, alert?.message, banner?.title, banner?.message].filter(Boolean).join('. '));
    if (!banner && !alert) return null;
    return (
        <Stack gap="sm">
            {alert ? <ChatAlertNotice alert={alert} /> : null}
            {banner ? (
                <Stack gap="sm" testID={`banner-${banner.id}`}>
                    {isServerDownBanner(banner) ? (
                        <ServerDownCard
                            banner={banner}
                            onDismiss={() => dismiss(banner.id)}
                            onCheckAgain={() => {
                                void refetch();
                                void recheckGate?.();
                            }}
                            onOpenSetup={banner.setup ? reopenSetup : undefined}
                        />
                    ) : (
                    <Notice
                        tone={banner.tone}
                        title={banner.title}
                        message={banner.message}
                        detail={banner.detail ?? banner.command}
                        onDismiss={banner.dismissible ? () => (banner.id === 'pickLoad' ? usePickLoadStore.getState().clear() : dismiss(banner.id)) : undefined}
                        action={
                            banner.downloadRetry
                                ? { label: t('docs.retry'), onPress: () => void redownload.download(false) }
                                : banner.pickRetry && client
                                  ? { label: t('banner.pickLoad.retry'), onPress: () => void usePickLoadStore.getState().retry(client) }
                                  : banner.retry
                                    ? { label: t('settings.key.checkAgain'), onPress: () => void refetch() }
                                    : undefined
                        }
                    />
                    )}
                    {banner.details ? <BannerDetails text={banner.details} /> : null}
                    {banner.progress ? <ProgressLine value={banner.progress.value} label={banner.progress.label} /> : null}
                </Stack>
            ) : null}
        </Stack>
    );
}
