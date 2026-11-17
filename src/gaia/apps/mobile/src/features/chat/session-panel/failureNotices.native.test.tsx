// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionEnvironment } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { capabilityFailure } from './capabilityState';
import { ChangesSection } from './ChangesSection';
import { OfflineNotice } from './OfflineNotice';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const LOCKED = 'Database is locked';

function wrapper(client: ReturnType<typeof createFakeClient>) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>{children}</ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
    }
    return Wrapper;
}

describeNative('PC errors stay off the translated sentence', () => {
    it('changes: a reason-free sentence, the PC text on its own line', async () => {
        const client = createFakeClient({});
        client.getSessionChanges = async () => {
            throw new GaiaApiError(500, LOCKED);
        };
        await render(<ChangesSection sessionId="s1" live={false} />, { wrapper: wrapper(client) });
        expect(await screen.findByText(/^.?Couldn't total this chat's changes\..?$/)).toBeTruthy();
        expect(screen.getByText(LOCKED)).toBeTruthy();
    });

    it('offline notice: the failed switch keeps the PC text off the sentence', async () => {
        const env: SessionEnvironment = { session_id: 's1', folders: [], removed: [], internet: false, enforced: true, internet_enforced: true };
        const client = createFakeClient({ environments: { s1: env } });
        client.setInternet = async () => {
            throw new GaiaApiError(500, LOCKED);
        };
        await render(<OfflineNotice sessionId="s1" />, { wrapper: wrapper(client) });
        await fireEvent.press(await screen.findByText(/Turn on/));
        expect(await screen.findByText(LOCKED)).toBeTruthy();
        expect(screen.getByTestId('offline-notice')).toBeTruthy();
        expect(screen.queryByText(new RegExp(`turn it on: ${LOCKED}`))).toBeNull();
    });
});

describe('capabilityFailure', () => {
    const t = translator('en');
    it('moves a PC error to the detail and keeps an unreachable cause inline', () => {
        const pc = capabilityFailure(new GaiaApiError(500, LOCKED), t, 'tools.listError', 'mobileApp.tools.listErrorShort');
        expect(pc).toEqual({ notRunning: false, text: expect.not.stringContaining(LOCKED), detail: LOCKED });
        const own = capabilityFailure(new Error('offline'), t, 'tools.listError', 'mobileApp.tools.listErrorShort');
        expect(own).toMatchObject({ notRunning: false, text: expect.stringContaining('offline') });
        expect('detail' in own && own.detail).toBeFalsy();
    });
});
