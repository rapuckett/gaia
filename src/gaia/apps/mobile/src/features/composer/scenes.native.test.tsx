// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { COMPARE_STATES } from '@/features/chat/compare/CompareGallery';
import { sheetStore } from '@/ui/overlays/sheetStore';

// Required inside the tests: the web project can't load the new-chat backdrop's SVG.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const composerRoute = () => require('@/app/dev/composer').default as () => React.JSX.Element;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const messagesRoute = () => require('@/app/dev/messages').default as () => React.JSX.Element;

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockState: string | undefined;
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => ({ state: mockState }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    useNavigation: () => ({ openDrawer: jest.fn() }),
    usePathname: () => '/dev/composer',
}));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const opts = { includeHiddenElements: true };
// Finds wait for async queries and sheet mounts; the 1 s default is tight in a full run under load.
const slow = { ...opts, timeout: 5000 };

const mount = (Route: () => React.JSX.Element) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <Route />
        </SafeAreaProvider>,
    );

describeNative('composer and retry scenes', () => {
    // Cold-loading the route graph on the first test outlasts its 5 s limit under load.
    beforeAll(() => {
        composerRoute();
        messagesRoute();
    }, 60000);
    beforeEach(() => sheetStore.reset());

    it('attachPaste opens the attach menu with Paste image', async () => {
        mockState = 'attachPaste';
        await mount(composerRoute());
        expect(await screen.findByText('Paste image', slow)).toBeTruthy();
    });

    it('menuCloud asks for consent before a cloud model, with the provider notice', async () => {
        mockState = 'menuCloud';
        await mount(composerRoute());
        fireEvent.press(await screen.findByTestId('model-row-accounts/fireworks/models/qwen3p6', slow));
        expect(await screen.findByText(/Chat history is sent to Fireworks AI/, slow)).toBeTruthy();
        expect(screen.getByText('Use Qwen3.6', opts)).toBeTruthy();
    });

    it('menuNeverStarted shows the download-never-started message', async () => {
        mockState = 'menuNeverStarted';
        await mount(composerRoute());
        expect(await screen.findByText(/never started/, slow)).toBeTruthy();
    });

    it.each([
        ['permissionMenu', 'Permission mode'],
        ['permissionMenu', /GAIA asks before it edits files/],
        ['permissionMenu', /Runs every tool and command without asking/],
        ['permissionFull', 'Full access'],
        ['private-off', 'Remember across chats: on'],
        ['private-on', 'Private'],
        ['private-memoryOff', 'Remember across chats: off'],
        ['spendOpen', 'Cloud spending'],
        ['spendOpen', /Not counted: 1 stopped answer/],
        ['folder-own', "GAIA's folder"],
    ])('%s shows %s', async (name, text) => {
        mockState = name as string;
        await mount(composerRoute());
        expect((await screen.findAllByText(text, opts)).length).toBeGreaterThan(0);
    });

    it('spend shows the chip with the at-least floor and no sheet', async () => {
        mockState = 'spend';
        await mount(composerRoute());
        expect(await screen.findByLabelText(/Cloud spending: ≥ .* in this chat/, slow)).toBeTruthy();
        expect(screen.queryByText('Cloud spending', opts)).toBeNull();
    });

    it('held shows the opening message waiting for GAIA to start', async () => {
        mockState = 'held';
        await mount(composerRoute());
        expect(await screen.findByText('Sends once GAIA has started.', slow)).toBeTruthy();
    });

    it.each([
        ['retry-sheet', 'Retry with…'],
        ['retry-loading', 'Loading models…'],
        ['retry-error', /did not answer/],
        ['compare-ready', 'Compare answers'],
        ['compare-running', 'Compare answers'],
        ['compare-failed', /Not enough free memory/],
    ])('%s renders', async (name, text) => {
        expect(COMPARE_STATES).toContain(name);
        mockState = name as string;
        await mount(messagesRoute());
        expect(await screen.findByText(text, slow)).toBeTruthy();
    });
});
