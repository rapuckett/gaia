// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { createHttpClient } from '@/api/http';
import { shouldRetryQuery } from '@/data/queryRetry';
import { GaiaClientProvider } from '@/data/GaiaClientProvider';
import { AppErrorBoundary } from '@/features/errors/AppErrorBoundary';
import { ChatAlertFeed } from '@/features/banners/ChatAlertFeed';
import { AppBanner } from '@/features/banners/AppBanner';
import { ModelNeededHost } from '@/features/model';
import { AppPolls } from '@/features/notifications/AppPolls';
import { NotificationFeed } from '@/features/notifications';
import { AppNavigator } from '@/features/nav/AppNavigator';
import { RoutingEffects } from '@/features/nav/RoutingEffects';
import { INITIAL_ROUTE } from '@/features/nav/navigation';
import { sweepTempFiles } from '@/features/files/shareTemp';
import { installPinnedPairing, PairingGate } from '@/features/pairing';
import { SetupGate } from '@/features/setup/SetupGate';
import { LanguageSwitchHost } from '@/features/language/LanguageSwitchCover';
import { useDirection, useLocaleCode } from '@/i18n/useT';
import { applyDirection } from '@/platform/direction';
import { checkSystemLanguage } from '@/state/systemLanguage';
import { platformFetch } from '@/platform/fetch';
import { useConnectionStore } from '@/state/connection';
import { useLocaleStore } from '@/state/locale';
import { ScreenBannerProvider, UIProvider } from '@/ui';

// Before the first render, so the pairing screens and the saved PC use the pinned transport.
installPinnedPairing();

// Files a crash or a kill left in the cache (shared images, opened PC files, played audio).
if (Platform.OS !== 'web') {
    try {
        sweepTempFiles();
    } catch (error) {
        console.error('Clearing leftover temporary files failed', error);
    }
}

// A chat opened cold (deep link, notification) has the home screen beneath it.
export const unstable_settings = { anchor: INITIAL_ROUTE };

// Only the root gate gets the route, so a navigation re-renders it alone; dev scenes that show the gate render their own.
function RootSetupGate({ children }: { children: ReactNode }) {
    return <SetupGate route={usePathname()}>{children}</SetupGate>;
}

export default function RootLayout() {
    const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } }));
    const dir = useDirection();
    const lang = useLocaleCode();
    const connection = useConnectionStore((s) => s.connection);
    const client = useMemo(
        () => (connection ? createHttpClient({ ...connection, fetch: platformFetch }) : null),
        [connection],
    );

    // Coming back to the foreground re-reads what's stale, such as the PC's status.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
        return () => sub.remove();
    }, []);

    const localeLoaded = useLocaleStore((s) => s.hydrated);
    const picked = useLocaleStore((s) => s.locale !== null);

    // Before the saved pick loads, dir is the phone's and would overwrite the pick's flags.
    useEffect(() => {
        if (localeLoaded) applyDirection(dir, lang, picked);
    }, [dir, lang, picked, localeLoaded]);

    // Android's per-app language can change under the running app; the layout only follows after a restart.
    useEffect(() => {
        if (!localeLoaded) return;
        void checkSystemLanguage();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') void checkSystemLanguage();
        });
        return () => sub.remove();
    }, [localeLoaded]);

    if (!localeLoaded) return null;

    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <AppErrorBoundary variant="window">
                    <ScreenBannerProvider banner={<AppBanner />}>
                        <PairingGate>
                        <RootSetupGate>
                            <RoutingEffects />
                            <NotificationFeed />
                            <AppPolls />
                            <ChatAlertFeed />
                            <AppNavigator />
                            <ModelNeededHost />
                        </RootSetupGate>
                        </PairingGate>
                        <LanguageSwitchHost />
                    </ScreenBannerProvider>
                    </AppErrorBoundary>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
