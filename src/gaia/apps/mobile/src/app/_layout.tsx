// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Drawer } from 'expo-router/drawer';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { createHttpClient } from '@/api/http';
import { GaiaClientProvider } from '@/data/GaiaClientProvider';
import { AppDrawer } from '@/features/nav/AppDrawer';
import { INITIAL_ROUTE, PERMANENT_DRAWER_MIN_WIDTH } from '@/features/nav/navigation';
import { useDirection } from '@/i18n/useT';
import { applyDirection } from '@/platform/direction';
import { platformFetch } from '@/platform/fetch';
import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

// A chat opened cold (deep link, notification) has the home screen beneath it.
export const unstable_settings = { anchor: INITIAL_ROUTE };

// Expo Router renders only the screens a layout declares.
const ROUTES = [INITIAL_ROUTE, 'new', 'chat/[id]', 'dev/ui', 'dev/ui-lists', 'dev/composer', 'dev/markdown'];

export default function RootLayout() {
    const [queryClient] = useState(() => new QueryClient());
    const dir = useDirection();
    const { width } = useWindowDimensions();
    const connection = useConnectionStore((s) => s.connection);
    const client = useMemo(
        () => (connection ? createHttpClient({ ...connection, fetch: platformFetch }) : null),
        [connection],
    );

    useEffect(() => applyDirection(dir), [dir]);

    return (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <UIProvider>
                    <Drawer
                        drawerContent={(props) => <AppDrawer {...props} />}
                        backBehavior="initialRoute"
                        screenOptions={{
                            headerShown: false,
                            drawerPosition: dir === 'rtl' ? 'right' : 'left',
                            drawerType: width >= PERMANENT_DRAWER_MIN_WIDTH ? 'permanent' : 'front',
                        }}
                    >
                        {ROUTES.map((name) => (
                            <Drawer.Screen key={name} name={name} />
                        ))}
                    </Drawer>
                </UIProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
}
