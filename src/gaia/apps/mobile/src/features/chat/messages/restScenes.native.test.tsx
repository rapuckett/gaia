// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { sheetStore } from '@/ui/overlays/sheetStore';

// Required inside the tests: the web project can't load these routes' SVG and font modules.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = (name: 'messages' | 'connectors' | 'permission') => require(`@/app/dev/${name}`).default as () => React.JSX.Element;

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
    Redirect: () => null,
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
    useNavigation: () => ({ openDrawer: jest.fn() }),
    usePathname: () => '/dev',
}));
jest.mock('@/features/nav/ScreenHeader', () => ({ ScreenHeader: () => null }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const opts = { includeHiddenElements: true };
// Findings wait for async queries; the 1 s default is tight under load.
const slow = { ...opts, timeout: 5000 };

const mount = (Route: () => React.JSX.Element) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <Route />
        </SafeAreaProvider>,
    );

describeNative('card, connector and undo scenes', () => {
    beforeAll(() => {
        route('messages');
        route('connectors');
        route('permission');
    }, 60000);
    beforeEach(() => sheetStore.reset());

    it('connector-retry offers Ask again once the account is connected', async () => {
        mockParams = { state: 'connector-retry' };
        await mount(route('messages'));
        expect(await screen.findByText('Ask again', slow)).toBeTruthy();
    });

    it('audio shows the caption and file name', async () => {
        mockParams = { state: 'audio' };
        await mount(route('messages'));
        expect(await screen.findByText('A calm piano theme for the intro.', slow)).toBeTruthy();
        expect(screen.getByText(/piano-theme\.wav/, opts)).toBeTruthy();
    });

    it('audio-failed shows the cannot-be-played error after Play', async () => {
        mockParams = { state: 'audio-failed' };
        await mount(route('messages'));
        fireEvent.press(await screen.findByTestId('card-audio-play', slow));
        expect(await screen.findByTestId('card-audio-failed', slow)).toBeTruthy();
    });

    it('guide-units shows the US and Metric switch on a recipe, and the tip until it is dismissed', async () => {
        mockParams = { state: 'guide-units' };
        await mount(route('messages'));
        expect(await screen.findByTestId('guide-units', slow)).toBeTruthy();
        expect(screen.getAllByText('Metric', opts).length).toBeGreaterThan(0);
        expect(screen.getByText(/switch units/, opts)).toBeTruthy();
    });

    it('guide-tip shows the one-time tip with its dismiss button', async () => {
        mockParams = { state: 'guide-tip' };
        await mount(route('messages'));
        expect(await screen.findByTestId('guide-tip', slow)).toBeTruthy();
        expect(screen.getByTestId('guide-tip-dismiss', opts)).toBeTruthy();
    });

    it.each([
        ['serverOn', 'Disable this MCP server'],
        ['serverOff', 'Enable this MCP server'],
        ['grants', 'Per-agent grants'],
    ])('connectors %s renders', async (state, text) => {
        mockParams = { state };
        await mount(route('connectors'));
        expect(await screen.findByText(text, slow)).toBeTruthy();
        if (state === 'grants') expect(screen.getByText('Who can use it', opts)).toBeTruthy();
    });

    it('permission undo shows the retention fields', async () => {
        mockParams = { only: 'undo' };
        await mount(route('permission'));
        expect(await screen.findByTestId('undo-days', slow)).toBeTruthy();
    });
});
