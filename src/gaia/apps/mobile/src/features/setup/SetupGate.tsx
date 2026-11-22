// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState, type ReactNode } from 'react';

import { GaiaApiError, GaiaNetworkError, GaiaPinMismatchError } from '@/api/errors';
import { useGaiaClient, useSetupGate } from '@/data';
import { devGalleryEnabled } from '@/features/dev/devGallery';
import { PinMismatchScreen, usePairAgain } from '@/features/pairing';
import { hasTailnetRoute } from '@/features/pairing/routes';
import { describeErrorWith, serverText, technicalDetail, useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { Button, Disclosure, Ltr, Notice, ScreenBannerProvider, Stack, useScreenBanner } from '@/ui';

import { isServerDownBanner } from '@/features/banners/pickBanner';
import { isSettingsRoute } from '@/features/banners/settingsRoute';
import { useBannerPick } from '@/features/banners/useBannerPick';

import { registerReopenSetup } from './reopenSetup';
import { GateRecheckProvider } from './gateRecheck';
import { GateUnreachableProvider } from './gateUnreachable';
import { SetupScreen, type SetupScreenProps } from './SetupScreen';
import { StartupScreen } from './StartupScreen';

export { reopenSetup } from './reopenSetup';

/**
 * The first-run gate around the app: "Starting GAIA…" until the check answers, the setup screen in
 * place of the app when setup is needed, and the app, with a notice above it, when the PC's model
 * server is down or the check couldn't be answered. With no PC connected the app shows its own state.
 * `route` is the root layout's path: a gallery build lets its `/dev/*` scenes past the gate, which need no PC.
 */
export function SetupGate({
    children,
    renderStep,
    route,
}: {
    children: ReactNode;
    renderStep?: SetupScreenProps['renderStep'];
    route?: string;
}) {
    const client = useGaiaClient();
    const t = useT();
    const { gate, recheck, finish, open } = useSetupGate();
    const pairAgain = usePairAgain();
    const connection = useConnectionStore((s) => s.connection);
    const ambientBanner = useScreenBanner();
    const serverBanner = isServerDownBanner(useBannerPick().picked);

    useEffect(() => registerReopenSetup(open), [open]);

    // Same provider stack as the notice path below, so the navigator never remounts when the gate changes state.
    const passThrough = (
        <GateUnreachableProvider value={false}>
            <GateRecheckProvider value={null}>
                <ScreenBannerProvider banner={ambientBanner}>{children}</ScreenBannerProvider>
            </GateRecheckProvider>
        </GateUnreachableProvider>
    );
    if (!client || (route?.startsWith('/dev/') && devGalleryEnabled())) return passThrough;
    if (gate.state === 'checking') return <StartupScreen />;
    if (gate.state === 'upgrading') return <StartupScreen upgrading />;
    if (gate.state === 'needed') return <SetupScreen onReady={finish} renderStep={renderStep} />;
    if (gate.state === 'addingLocal') return <SetupScreen onReady={finish} onClose={finish} renderStep={renderStep} />;
    if (gate.state === 'ready') return passThrough;

    // A PC whose certificate changed is a hard stop: the only way on is to pair again.
    if (gate.state === 'unknown' && gate.error instanceof GaiaPinMismatchError) {
        return <PinMismatchScreen onPairAgain={() => pairAgain.mutate()} busy={pairAgain.isPending} />;
    }
    const unreachable = gate.state === 'unknown' && !gate.upgradeFailed && gate.error instanceof GaiaNetworkError;

    // One cause, one message: the server card in the app banner says it on chat and home, the Model pane on Settings.
    const serverDownSaid = gate.state === 'serverDown' && !gate.modelListUnread && (serverBanner || isSettingsRoute(route));
    const notice = serverDownSaid ? null : unreachable ? (
        <Notice
            tone="warning"
            title={t('mobileApp.pairing.off.title')}
            message={t(hasTailnetRoute(connection) ? 'mobileApp.pairing.unreachable.away' : 'mobileApp.pairing.unreachable.body')}
            action={{ label: t('mobileApp.pairing.off.retry'), onPress: () => void recheck() }}
        />
    ) :
        gate.state === 'serverDown' ? (
            <Notice
                tone="warning"
                message={t(gate.modelListUnread ? 'setup.modelListUnread.notice' : 'setup.serverDown.notice')}
                action={{ label: t('setup.unknown.retry'), onPress: () => void recheck({ quiet: true }) }}
            />
        ) : (
            <Notice
                tone="danger"
                message={
                    gate.upgradeFailed
                        ? serverText(gate.error)
                            ? t('setup.upgrading.failedNoReason')
                            : t.compose((say) => say('setup.upgrading.failed', { error: describeErrorWith(gate.error, say) }))
                        : gate.error instanceof GaiaApiError
                          ? t('mobileApp.error.setupCheckHttp', { status: gate.error.status })
                          : t.compose((say) => say('setup.unknown.failed', { error: describeErrorWith(gate.error, say) }))
                }
                detail={gate.upgradeFailed ? serverText(gate.error) : undefined}
                action={{
                    label: t(gate.upgradeFailed ? 'setup.upgrading.retry' : 'setup.unknown.retry'),
                    onPress: () => void recheck(),
                }}
            />
        );
    // The notice rides the ambient banner slot, so each main-pane screen shows it above its own header and the sidebar (banner={null}) never does.
    return (
        <GateUnreachableProvider value={unreachable}>
        <GateRecheckProvider value={gate.state === 'serverDown' ? () => recheck({ quiet: true }) : null}>
        <ScreenBannerProvider
            banner={
                <Stack gap="md">
                    {notice}
                    {gate.state === 'unknown' && !unreachable ? <ErrorDetails error={gate.error} /> : null}
                    {gate.state === 'serverDown' && !gate.modelListUnread && !serverDownSaid ? (
                        <Button variant="secondary" label={t('setup.serverDown.setup')} onPress={open} />
                    ) : null}
                    {/* An unreachable PC is already said by the notice; the connection banner would repeat it. */}
                    {unreachable ? null : ambientBanner}
                </Stack>
            }
        >
            {children}
        </ScreenBannerProvider>
        </GateRecheckProvider>
        </GateUnreachableProvider>
    );
}

function ErrorDetails({ error }: { error: unknown }) {
    const t = useT();
    const [open, setOpen] = useState(false);
    return (
        <Disclosure title={t('setup.progress.details')} open={open} onToggle={() => setOpen((o) => !o)}>
            <Ltr>{technicalDetail(error)}</Ltr>
        </Disclosure>
    );
}
