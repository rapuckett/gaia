// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Slot, usePathname } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { createContext, useContext } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { devGalleryEnabled } from '@/features/dev/devGallery';
import { useDirection, useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { useLargeText } from '@/ui/theme/a11y';

import { AppDrawer } from './AppDrawer';
import { drawerScreenOptions, FULL_SCREEN_ROUTES, fullScreenOptions } from './navigation';
import { ROUTES } from './routes';
import { AppErrorBoundary } from '@/features/errors/AppErrorBoundary';

const DrawerPresent = createContext(true);

/** False while the app shows no drawer (no PC paired), so a header draws no menu button. */
export function useDrawerPresent(): boolean {
    return useContext(DrawerPresent);
}

/**
 * The app's navigator. With no PC paired every menu destination is out of reach, so the screens render
 * with no drawer at any width, as on the welcome screen; pairing a PC brings the drawer in, and unpairing
 * the last one removes it, open or not. `/dev/*` scenes keep the drawer wherever the gallery is enabled (dev builds, a web export with the gallery flag, a native gallery build).
 */
export function AppNavigator() {
    const paired = useConnectionStore((s) => s.connection !== null);
    const route = usePathname();
    const { width } = useWindowDimensions();
    const largeText = useLargeText();
    const t = useT();
    const dir = useDirection();
    const webRtl = Platform.OS === 'web' && dir === 'rtl';
    const drawer = paired || (route.startsWith('/dev/') && devGalleryEnabled());

    if (!drawer) {
        return (
            <DrawerPresent.Provider value={false}>
                <Slot />
            </DrawerPresent.Provider>
        );
    }
    return (
        <Drawer
            drawerContent={(props) => (
                <AppErrorBoundary variant="compact">
                    <AppDrawer {...props} />
                </AppErrorBoundary>
            )}
            backBehavior="initialRoute"
            screenOptions={{ ...drawerScreenOptions({ width, largeText, webRtl }), overlayAccessibilityLabel: t('mobileApp.nav.closeDrawer') }}
        >
            {ROUTES.map((name) => (
                <Drawer.Screen key={name} name={name} options={FULL_SCREEN_ROUTES.includes(name) ? fullScreenOptions(webRtl) : undefined} />
            ))}
        </Drawer>
    );
}
