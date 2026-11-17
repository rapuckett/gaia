// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useConnectionStore } from '@/state/connection';

import { ConnectorsGallery, type ConnectorScene } from './ConnectorsGallery';

// The real provider waits on font files the test environment doesn't have.
jest.mock('@/ui', () => {
    const actual = jest.requireActual('@/ui');
    const { createElement } = jest.requireActual('react');
    return { ...actual, UIProvider: ({ children }: { children: unknown }) => createElement(actual.ThemeProvider, null, createElement(actual.SheetScope, null, children)) };
});
jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const mount = (state: ConnectorScene) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ConnectorsGallery state={state} />
        </SafeAreaProvider>,
    );

describeNative('/dev/connectors scenes', () => {
    afterEach(() => useConnectionStore.setState({ connection: null }));

    it('many shows the search field', async () => {
        await mount('many');
        expect(await screen.findByLabelText('Search connectors')).toBeTruthy();
    });

    it('groups: the Custom agent servers header opens its tile', async () => {
        await mount('groups');
        expect(screen.queryByText('filesystem')).toBeNull();
        await fireEvent.press(await screen.findByTestId('connectors-group-agentServers'));
        expect(await screen.findByText('filesystem')).toBeTruthy();
    });

    it('personalize shows the after-connect offer', async () => {
        await mount('personalize');
        expect(await screen.findByText(/^Want GAIA to read your recent activity in Gmail/)).toBeTruthy();
        expect(screen.getByText('Personalize GAIA')).toBeTruthy();
    });

    it('personalizeTile shows the plain per-tile offer', async () => {
        await mount('personalizeTile');
        expect(await screen.findByText(/^Optional: let GAIA read/)).toBeTruthy();
    });

    it('personalizeFailed says it could not start, with the PC reason on its own line', async () => {
        await mount('personalizeFailed');
        await fireEvent.press(await screen.findByTestId('personalize-linear'));
        expect(await screen.findByText("Couldn't start personalization.")).toBeTruthy();
        expect(screen.getByText('The keyring is locked.')).toBeTruthy();
    });

    it('personalizeMcp shows the PC-only line and the connector name, no button', async () => {
        await mount('personalizeMcp');
        expect(await screen.findByTestId('personalize-pc-only-linear')).toBeTruthy();
        expect(screen.getAllByText(/Linear/).length).toBeGreaterThan(0);
        expect(screen.queryByTestId('personalize-linear')).toBeNull();
    });

    it.each([
        ['disconnected', /This provider has no API to revoke access remotely/],
        ['revoked', /did not confirm the revoke/],
    ] as const)('%s shows its notice after Disconnect is confirmed', async (state, text) => {
        await mount(state);
        await fireEvent.press((await screen.findAllByText('Disconnect'))[0]!);
        const confirm = await screen.findAllByText('Disconnect');
        await fireEvent.press(confirm[confirm.length - 1]!);
        expect(await screen.findByText(text)).toBeTruthy();
    });
});
