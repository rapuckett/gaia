// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakeClient, type FakeClientData } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { useConnectionStore } from '@/state/connection';
import { SheetScope, ThemeProvider } from '@/ui';

import { ProfilePane } from './ProfilePane';

let mockRefused = false;
jest.mock('@/api/routeAccess', () => ({
    ...jest.requireActual('@/api/routeAccess'),
    useDeviceRefused: () => mockRefused,
}));

// The web project's renderer can't mount react-native-web's DOM.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

async function mount(data: FakeClientData) {
    const client = createFakeClient(data);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <GaiaClientProvider client={client}>
                <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                    <ThemeProvider>
                        <SheetScope>{children}</SheetScope>
                    </ThemeProvider>
                </SafeAreaProvider>
            </GaiaClientProvider>
        </QueryClientProvider>
    );
    await render(<ProfilePane notify={() => undefined} memoryEnabled onOpenAdvanced={() => undefined} />, { wrapper: wrap });
    return client;
}

const finding = (content: string) => ({ type: 'finding' as const, source: 'installed_apps', item: { content, category: 'profile', context: 'global', confidence: 0.8, _source_name: 'installed_apps' } });

describeNative('ProfilePane', () => {
    it('saves nothing until the review is confirmed, and only what is left checked', async () => {
        const client = await mount({
            profileStreams: { discovery: { events: [finding('Uses Firefox'), finding('Uses Blender'), { type: 'done', total: 2 }] } },
        });
        fireEvent.press(screen.getByTestId('profile-discovery-run'));
        await screen.findByTestId('profile-discovery-review');
        expect(client.profileCommits).toEqual([]);

        fireEvent.press(screen.getByLabelText(/^Uses Blender/));
        await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Uses Blender/, checked: false })).toBeOnTheScreen());
        fireEvent.press(screen.getByTestId('profile-discovery-save'));
        await waitFor(() => expect(client.profileCommits).toHaveLength(1));
        expect(client.profileCommits[0]!.items).toEqual([expect.objectContaining({ content: 'Uses Firefox' })]);
    });

    it('aborts the stream when Stop is pressed, and keeps the browser history off by default', async () => {
        const client = await mount({ profileStreams: { inference: { events: [{ type: 'log', message: 'Calling local LLM...' }], hang: true } } });
        fireEvent.press(screen.getByTestId('profile-inference-run'));
        const stop = await screen.findByTestId('profile-inference-stop');
        expect(client.profileStreamOpens).toEqual([{ kind: 'inference', includeBrowser: false, stopped: false }]);
        fireEvent.press(stop);
        await waitFor(() => expect(client.profileStreamOpens[0]!.stopped).toBe(true));
        await waitFor(() => expect(screen.queryByTestId('profile-inference-stop')).toBeNull());
    });

    it('offers Run on a paired phone the PC allows to scan, and says PC only when the route is refused', async () => {
        useConnectionStore.setState({ connection: { baseUrl: 'https://pc.local:4443', pcId: 'pc-1', pinned: true } });
        try {
            await mount({});
            expect(screen.getByTestId('profile-discovery-run')).toBeTruthy();
            expect(screen.getByTestId('profile-inference-run')).toBeTruthy();
            expect(screen.queryByTestId('profile-discovery-pc-only')).toBeNull();
        } finally {
            useConnectionStore.setState({ connection: null });
        }
        mockRefused = true;
        try {
            const client = await mount({});
            expect(screen.getByTestId('profile-discovery-pc-only')).toBeTruthy();
            expect(screen.getByTestId('profile-inference-pc-only')).toBeTruthy();
            expect(screen.queryByTestId('profile-discovery-run')).toBeNull();
            expect(client.profileStreamOpens).toEqual([]);
        } finally {
            mockRefused = false;
        }
    });

    const settings = (consent: boolean) => ({ memory_enabled: true, mcp_memory_enabled: false, system_discovery_consent: consent });
    const refusal = { profileStreams: { discovery: { events: [{ type: 'error' as const, source: 'consent', message: 'NO_DISCOVERY_CONSENT' }, { type: 'done' as const, total: 0 }] } } };

    it('shows one muted line, and no notice, at rest with consent off', async () => {
        await mount({ memorySettings: settings(false) });
        expect(await screen.findByTestId('profile-consent-off')).toBeTruthy();
        expect(screen.queryByTestId('profile-discovery-consent-off')).toBeNull();
        expect(screen.getByTestId('profile-discovery-run').props.accessibilityState?.disabled).toBeFalsy();
    });

    it('asks first with consent off: Cancel changes nothing, Confirm turns it on and then scans', async () => {
        const data = { memorySettings: settings(false), profileStreams: { discovery: { events: [{ type: 'done' as const, total: 0 }] } } };
        const client = await mount(data);
        await screen.findByTestId('profile-consent-off');
        fireEvent.press(screen.getByTestId('profile-discovery-run'));
        fireEvent.press(await screen.findByTestId('confirm-cancel'));
        await waitFor(() => expect(screen.queryByTestId('confirm-ok')).toBeNull());
        expect(data.memorySettings.system_discovery_consent).toBe(false);
        expect(client.profileStreamOpens).toEqual([]);

        fireEvent.press(screen.getByTestId('profile-discovery-run'));
        expect(await screen.findByText('Your PC lists this under Changes made from this phone.')).toBeTruthy();
        fireEvent.press(screen.getByTestId('confirm-ok'));
        await waitFor(() => expect(client.profileStreamOpens).toHaveLength(1));
        expect(data.memorySettings.system_discovery_consent).toBe(true);
    });

    it('answers a refusal that races the toggle with our words alone, and asks again next time', async () => {
        const client = await mount({ memorySettings: settings(true), ...refusal });
        fireEvent.press(await screen.findByTestId('profile-discovery-run'));
        await screen.findByTestId('profile-discovery-consent-off');
        expect(screen.getByText(/System discovery is off, so GAIA read nothing on your PC/)).toBeTruthy();
        expect(screen.queryByText('NO_DISCOVERY_CONSENT')).toBeNull();
        expect(await screen.findByTestId('profile-consent-off')).toBeTruthy();
        fireEvent.press(screen.getByTestId('profile-discovery-run'));
        expect(await screen.findByTestId('confirm-ok')).toBeTruthy();
        expect(client.profileStreamOpens).toHaveLength(1);
    });
});
