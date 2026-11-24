// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SessionEnvironment } from '@/api/client.types';
import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { ThemeProvider } from '@/ui';

import { EnvironmentSection } from './EnvironmentSection';
import { useSessionPanelStore } from './panelStore';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const ENV: SessionEnvironment = {
    session_id: 's1',
    folders: [
        { path: '/Users/me/Reports', name: 'Reports', kind: 'folder', source: 'added', removable: true },
        { path: '/Users/me/.gaia/documents', name: 'documents', kind: 'folder', source: 'gaia_documents', removable: false },
    ],
    removed: [],
    internet: true,
    enforced: true,
    internet_enforced: true,
};

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

describeNative('Environment: removing a folder', () => {
    it('asks first, and only the confirmation sends the removal', async () => {
        const client = createFakeClient({ environments: { s1: ENV } });
        await render(<EnvironmentSection sessionId="s1" live={false} />, { wrapper: wrapper(client) });
        expect(await screen.findByText(/^.?Reports.?$/)).toBeTruthy();
        expect(screen.queryByTestId('environment-remove-/Users/me/.gaia/documents')).toBeNull();

        await fireEvent.press(screen.getByTestId('environment-remove-/Users/me/Reports'));
        expect(client.environmentChanges).toEqual([]);

        await fireEvent.press(screen.getByTestId('environment-remove-confirm'));
        expect(await screen.findByText(/Removed: .?Reports/)).toBeTruthy();
        expect(client.environmentChanges).toEqual([{ sessionId: 's1', remove: '/Users/me/Reports' }]);
    });

    it('adds the folder the picker is on, and not one the PC refuses', async () => {
        const listing = (path: string, folder_refusal: string | null) => ({ current_path: path, parent_path: null, entries: [], quick_links: [], folder_refusal });
        const client = createFakeClient({ environments: { s1: ENV }, fileFolders: { '': listing('/Users/me', 'That is your whole user folder.') } });
        await render(<EnvironmentSection sessionId="s1" live={false} />, { wrapper: wrapper(client) });
        await fireEvent.press(await screen.findByTestId('environment-add-folder'));
        expect(await screen.findByText('That is your whole user folder.')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('folder-picker-use'));
        expect(client.environmentChanges).toEqual([]);

        client.browseFiles = async () => listing('/Users/me/Taxes', null);
        await fireEvent.press(screen.getByText('Go'));
        await waitFor(() => expect(screen.getByDisplayValue('/Users/me/Taxes')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('folder-picker-use'));
        expect(await screen.findByTestId('environment-add-folder')).toBeTruthy();
        expect(client.environmentChanges).toEqual([{ sessionId: 's1', add: '/Users/me/Taxes' }]);
    });
});

describeNative('Environment: a folder the PC won\'t give this phone', () => {
    const refuse = (client: ReturnType<typeof createFakeClient>, body: Record<string, unknown> | null) => {
        client.addEnvironmentFolder = async () => {
            throw new GaiaApiError(403, 'The PC refused it.', undefined, undefined, body);
        };
    };
    const pick = async (client: ReturnType<typeof createFakeClient>) => {
        await render(<EnvironmentSection sessionId="s1" live={false} />, { wrapper: wrapper(client) });
        await fireEvent.press(await screen.findByTestId('environment-add-folder'));
        await screen.findByDisplayValue('/Users/me/.ssh');
        await fireEvent.press(screen.getByTestId('folder-picker-use'));
    };
    const listing = { current_path: '/Users/me/.ssh', parent_path: null, entries: [], quick_links: [], folder_refusal: null };
    afterEach(() => useSessionPanelStore.getState().setEnvPicking(false));

    it('words a coded refusal in the picker, with the PC\'s reason on its own line', async () => {
        const client = createFakeClient({ environments: { s1: ENV }, fileFolders: { '': listing } });
        refuse(client, { code: 'device_folder_withheld', message: 'The PC refused it.' });
        await pick(client);
        const notice = await screen.findByTestId('folder-picker-error');
        expect(within(notice).getByText(/GAIA can't use this folder from a phone because it holds passwords or keys/)).toBeTruthy();
        expect(within(notice).getByText('The PC refused it.')).toBeTruthy();
        expect(screen.queryByTestId('environment-add-pc-only')).toBeNull();
    });

    it('keeps "change this on your PC" for a 403 with no folder code', async () => {
        const client = createFakeClient({ environments: { s1: ENV }, fileFolders: { '': listing } });
        refuse(client, null);
        await pick(client);
        expect(await screen.findByTestId('environment-add-pc-only')).toBeTruthy();
        expect(screen.queryByTestId('folder-picker-error')).toBeNull();
    });
});

describeNative('Environment: a failed folder read', () => {
    it('says it in one sentence and puts the PC\'s raw reason on its own line', async () => {
        const client = createFakeClient({ sessions: [] });
        await render(<EnvironmentSection sessionId="missing" live={false} />, { wrapper: wrapper(client) });
        expect(await screen.findByText(/^.?Couldn't read this chat's folders\..?$/)).toBeTruthy();
        expect(screen.getByText('Session not found')).toBeTruthy();
    });
});

describeNative('Environment: a failed folder removal', () => {
    it('puts the PC\'s raw reason on its own line, under a sentence without it', async () => {
        const client = createFakeClient({ environments: { s1: ENV } });
        client.removeEnvironmentFolder = async () => {
            throw new GaiaApiError(500, 'disk is read-only');
        };
        await render(<EnvironmentSection sessionId="s1" live={false} />, { wrapper: wrapper(client) });
        await fireEvent.press(await screen.findByTestId('environment-remove-/Users/me/Reports'));
        await fireEvent.press(screen.getByTestId('environment-remove-confirm'));
        const notice = await screen.findByTestId('environment-remove-error');
        expect(within(notice).getByText(/Couldn't remove that folder\./)).toBeTruthy();
        expect(within(notice).getByText('disk is read-only')).toBeTruthy();
        expect(within(notice).queryByText(/Couldn't remove that folder\..*disk is read-only/)).toBeNull();
    });
});
