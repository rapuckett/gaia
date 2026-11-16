// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useConnectionStore } from '@/state/connection';
import { UIProvider } from '@/ui';

import { PairingGate } from './PairingGate';

const describeAndroid = Platform.OS === 'android' ? describe : describe.skip;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <UIProvider>{children}</UIProvider>
    </SafeAreaProvider>
);

describeAndroid('PairingGate on Android', () => {
    it('shows the not-supported screen, with no pairing UI, even where the dev fake service exists', async () => {
        useConnectionStore.setState({ connection: null, restored: true });
        await render(
            <PairingGate>
                <Text>app</Text>
            </PairingGate>,
            { wrapper: wrap },
        );
        await waitFor(() => expect(screen.getByText('GAIA on Android is coming later')).toBeTruthy());
        expect(screen.queryByText('Pair with my PC')).toBeNull();
        expect(screen.queryByText('app')).toBeNull();
    });
});
