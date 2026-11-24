// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GaiaApiError } from '@/api/errors';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data';
import { PRESSABLE_MIN_SIZE, ThemeProvider } from '@/ui';
import { SheetHost } from '@/ui/overlays/SheetHost';

import Permissions from './Permissions';

// The web project's renderer can't mount react-native-web's DOM or the sheet host.
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

describeNative('Permissions pane', () => {
    it('a 403 on the default-mode switch leaves it off and shows the translated PC-only notice', async () => {
        const client = createFakeClient({ defaultPermissionMode: 'ask', defaultModePcOnly: true });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrap = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetHost>{children}</SheetHost>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<Permissions />, { wrapper: wrap });
        await screen.findByText(/^Off\. New chats ask/);

        fireEvent.press(screen.getByTestId('permissions-default-switch'));
        fireEvent.press(await screen.findByText('Turn on full access for new chats'));

        await screen.findByText('Change this on the PC running GAIA.');
        expect(screen.getByRole('switch', { checked: false })).toBe(screen.getByTestId('permissions-default-switch'));
        expect((await client.listAllPermissions()).default_mode).toBe('ask');
        queryClient.clear();
    });

    it('renders the tap targets the screenshot harness uses', async () => {
        const client = createFakeClient({
            sessions: [{ id: 'a', title: 'Chat a', created_at: '2026-11-13T00:00:00Z', updated_at: '2026-11-13T00:00:00Z' }] as never,
            permissions: { a: 'full_access' },
            permissionGrants: { a: [{ key: 'shell:ls', label: 'ls' }, { key: 'shell:pwd', label: 'pwd' }] },
            defaultPermissionMode: 'ask',
        });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrap = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={queryClient}>
                <GaiaClientProvider client={client}>
                    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                        <ThemeProvider>
                            <SheetHost>{children}</SheetHost>
                        </ThemeProvider>
                    </SafeAreaProvider>
                </GaiaClientProvider>
            </QueryClientProvider>
        );
        await render(<Permissions />, { wrapper: wrap });
        expect(await screen.findByTestId('perm-grant-revoke-a-0')).toBeTruthy();
        expect(screen.getByTestId('perm-grant-revoke-a-1')).toBeTruthy();
        fireEvent.press(screen.getByTestId('permissions-default-switch'));
        expect(await screen.findByTestId('perm-confirm')).toBeTruthy();
        fireEvent.press(screen.getByTestId('perm-confirm'));
        fireEvent.press(await screen.findByTestId('perm-chat-menu-a'));
        expect(await screen.findByTestId('perm-chat-turn-off-full')).toBeTruthy();
        expect(screen.getByTestId('perm-chat-revoke-all')).toBeTruthy();
        queryClient.clear();
    });

    it("a failed list shows our sentence and puts the PC's text on a left-to-right detail line", async () => {
        const client = { ...createFakeClient(), listAllPermissions: () => Promise.reject(new GaiaApiError(500, 'permissions table is locked')) };
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        await render(<Permissions />, {
            wrapper: ({ children }: { children: ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <GaiaClientProvider client={client}>
                        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                            <ThemeProvider>
                                <SheetHost>{children}</SheetHost>
                            </ThemeProvider>
                        </SafeAreaProvider>
                    </GaiaClientProvider>
                </QueryClientProvider>
            ),
        });
        await screen.findByText("Your PC couldn't do that.");
        const detail = screen.getByText('permissions table is locked') as unknown as { props: { style: { writingDirection?: string } } };
        expect(detail.props.style.writingDirection).toBe('ltr');
        queryClient.clear();
    });

    it('a chat without a menu keeps the trailing slot, so titles line up', async () => {
        const client = createFakeClient({
            permissionGrants: { a: [{ key: 'k1', label: 'ls' }, { key: 'k2', label: 'pwd' }], c: [{ key: 'k', label: 'ls' }] },
        });
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        await render(<Permissions />, {
            wrapper: ({ children }: { children: ReactNode }) => (
                <QueryClientProvider client={queryClient}>
                    <GaiaClientProvider client={client}>
                        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
                            <ThemeProvider>
                                <SheetHost>{children}</SheetHost>
                            </ThemeProvider>
                        </SafeAreaProvider>
                    </GaiaClientProvider>
                </QueryClientProvider>
            ),
        });
        const slot = await screen.findByTestId('permissions-row-menu-slot');
        expect(StyleSheet.flatten(slot.props.style).width).toBe(PRESSABLE_MIN_SIZE);
        queryClient.clear();
    });
});
