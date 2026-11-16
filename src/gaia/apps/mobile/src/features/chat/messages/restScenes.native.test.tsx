// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { sheetStore } from '@/ui/overlays/sheetStore';

// Required inside the tests: the web project can't load these routes' SVG and font modules.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = (name: 'messages' | 'connectors' | 'permission' | 'chat' | 'memory-gallery' | 'markdown') => require(`@/app/dev/${name}`).default as () => React.JSX.Element;

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
jest.mock('@/features/nav/ScreenHeader', () => ({
    ScreenHeader: ({ titleNode, end }: { titleNode?: React.ReactNode; end?: React.ReactNode }) => (
        <>
            {titleNode}
            {end}
        </>
    ),
}));

const t = translator('en');

jest.setTimeout(30000);

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const opts = { includeHiddenElements: true };

const mount = (Route: () => React.JSX.Element) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <Route />
            </QueryClientProvider>
        </SafeAreaProvider>,
    );

describeNative('card, connector and undo scenes', () => {
    beforeEach(() => sheetStore.reset());

    it('connector-retry offers Ask again once the account is connected', async () => {
        mockParams = { state: 'connector-retry' };
        await mount(route('messages'));
        expect(await screen.findByText('Ask again', opts)).toBeTruthy();
    });

    it('audio shows the caption and file name', async () => {
        mockParams = { state: 'audio' };
        await mount(route('messages'));
        expect(await screen.findByText('A calm piano theme for the intro.', opts)).toBeTruthy();
        expect(screen.getByText(/piano-theme\.wav/, opts)).toBeTruthy();
    });

    it('audio-failed shows the cannot-be-played error after Play', async () => {
        mockParams = { state: 'audio-failed' };
        await mount(route('messages'));
        fireEvent.press(await screen.findByTestId('card-audio-play', opts));
        expect(await screen.findByTestId('card-audio-failed', opts)).toBeTruthy();
    });

    it('guide-units shows the US and Metric switch on a recipe, and the tip until it is dismissed', async () => {
        mockParams = { state: 'guide-units' };
        await mount(route('messages'));
        expect(await screen.findByTestId('guide-units', opts)).toBeTruthy();
        expect(screen.getAllByText('Metric', opts).length).toBeGreaterThan(0);
        expect(screen.getByText(/switch units/, opts)).toBeTruthy();
    });

    it('guide-tip shows the one-time tip with its dismiss button', async () => {
        mockParams = { state: 'guide-tip' };
        await mount(route('messages'));
        expect(await screen.findByTestId('guide-tip', opts)).toBeTruthy();
        expect(screen.getByTestId('guide-tip-dismiss', opts)).toBeTruthy();
    });

    it('turn-changes shows the summary, Review changes and the undo confirm', async () => {
        mockParams = { state: 'turn-changes' };
        await mount(route('messages'));
        expect(await screen.findByText(t.plural('mobileApp.changes.summary', 2), opts)).toBeTruthy();
        expect(screen.getByText('Review changes', opts)).toBeTruthy();
        fireEvent.press(screen.getByTestId('turn-changes-undo', opts));
        expect(await screen.findByText(t.plural('mobileApp.changes.confirm', 2), opts)).toBeTruthy();
    });

    it('turn-changes-undone marks the summary undone and drops the undo button', async () => {
        mockParams = { state: 'turn-changes-undone' };
        await mount(route('messages'));
        expect(await screen.findByText(`${t.plural('mobileApp.changes.summary', 2)} · ${t('mobileApp.changes.undone')}`, opts)).toBeTruthy();
        expect(screen.queryByTestId('turn-changes-undo', opts)).toBeNull();
    });

    it('turn-changes-error puts the PC reason on its own line, outside the sentence', async () => {
        mockParams = { state: 'turn-changes-error' };
        await mount(route('messages'));
        expect(await screen.findByText(t('turnChanges.loadErrorNoReason'), opts)).toBeTruthy();
        expect(screen.getByText('database is locked', opts)).toBeTruthy();
    });

    it('turn-review lists each file with its badge and notes', async () => {
        mockParams = { state: 'turn-review' };
        await mount(route('messages'));
        expect(await screen.findByText(t('mobileApp.changes.reviewTitle'), opts)).toBeTruthy();
        expect(await screen.findByText(t('chg.deleted'), opts)).toBeTruthy();
        expect(screen.getByText(t('mobileApp.changes.truncated'), opts)).toBeTruthy();
    });

    it('turn-review-loading and turn-review-error show their states', async () => {
        mockParams = { state: 'turn-review-loading' };
        await mount(route('messages'));
        expect(await screen.findByText(t('mobileApp.changes.loading'), opts)).toBeTruthy();
    });

    it('turn-review-error keeps the PC reason out of the sentence', async () => {
        mockParams = { state: 'turn-review-error' };
        await mount(route('messages'));
        expect(await screen.findByText(t('mobileApp.changes.loadFailedNoReason'), opts)).toBeTruthy();
        expect(screen.getByText('diff store unreadable', opts)).toBeTruthy();
    });

    it('turn-undo-hang shows Undoing… after the confirm tap', async () => {
        mockParams = { state: 'turn-undo-hang' };
        await mount(route('messages'));
        fireEvent.press(await screen.findByTestId('turn-changes-undo', opts));
        fireEvent.press(await screen.findByTestId('turn-changes-confirm', opts));
        expect(await screen.findByText(t('chg.undoing'), opts)).toBeTruthy();
    });

    it('turn-undo-conflict offers Undo anyway after the confirm tap', async () => {
        mockParams = { state: 'turn-undo-conflict' };
        await mount(route('messages'));
        fireEvent.press(await screen.findByTestId('turn-changes-undo', opts));
        fireEvent.press(await screen.findByTestId('turn-changes-confirm', opts));
        expect(await screen.findByText('q3-summary.md changed after this turn', opts)).toBeTruthy();
        expect(screen.getByTestId('turn-changes-force', opts)).toBeTruthy();
    });

    it.each([
        ['export-error-http', t('mobileApp.share.exportHttp', { status: 500 })],
        ['export-error-unreachable', t('mobileApp.share.exportUnreachable')],
    ])('%s shows the export error after the Export tap', async (state, text) => {
        mockParams = { state };
        await mount(route('messages'));
        fireEvent.press(await screen.findByTestId('export-chat', opts));
        expect(await screen.findByText(text, opts)).toBeTruthy();
    });

    it.each([
        ['docs-past-cap', t('docsBar.pastCap', { limit: 100, n: 101 })],
        ['docs-past-size', t('docsBar.pastSize', { passages: '10,000', n: 3 })],
    ])('%s shows the documents bar notice', async (state, text) => {
        mockParams = { state };
        await mount(route('messages'));
        expect(await screen.findByText(text, opts)).toBeTruthy();
    });

    it('drop opens the later-messages question with its two buttons', async () => {
        mockParams = { state: 'drop' };
        await mount(route('messages'));
        expect(await screen.findByText('This also deletes the 2 later messages in this chat.', opts)).toBeTruthy();
        expect(screen.getByText('Delete and send', opts)).toBeTruthy();
    });

    it('guided-sets shows the set counter once the timer starts', async () => {
        mockParams = { state: 'guided-sets' };
        await mount(route('messages'));
        fireEvent.press(await screen.findByTestId('guided-timer-toggle', opts));
        expect(await screen.findByText(/Set 1 of 3/, opts)).toBeTruthy();
        expect(screen.getByText('Pause', opts)).toBeTruthy();
    });

    it('panel-chgGitPr leaves Create PR enabled', async () => {
        mockParams = { state: 'panel-chgGitPr' };
        await mount(route('messages'));
        const button = await screen.findByTestId('changes-pr', opts);
        expect(button.props.accessibilityState?.disabled).toBeFalsy();
    });

    it.each([
        ['running-empty', 'Thinking...'],
        ['running-status', 'Reading your request'],
    ])('chat %s shows its live line', async (state, text) => {
        mockParams = { state };
        await mount(route('chat'));
        expect(await screen.findByText(text, opts)).toBeTruthy();
    });

    it('goalsStoreDamaged offers a new goal list', async () => {
        mockParams = { scene: 'goalsStoreDamaged', tab: 'goals' };
        await mount(route('memory-gallery'));
        expect(await screen.findByTestId('goals-start-new-list', opts)).toBeTruthy();
    });

    it('the markdown gallery renders citations as links', async () => {
        mockParams = {};
        await mount(route('markdown'));
        expect((await screen.findAllByRole('link', opts)).length).toBeGreaterThan(0);
    });

    it.each([
        ['serverOn', 'Disable this MCP server'],
        ['serverOff', 'Enable this MCP server'],
        ['grants', 'Per-agent grants'],
    ])('connectors %s renders', async (state, text) => {
        mockParams = { state };
        await mount(route('connectors'));
        expect(await screen.findByText(text, opts)).toBeTruthy();
        if (state === 'grants') expect(screen.getByText('Who can use it', opts)).toBeTruthy();
    });

    it('permission undo shows the retention fields', async () => {
        mockParams = { only: 'undo' };
        await mount(route('permission'));
        expect(await screen.findByTestId('undo-days', opts)).toBeTruthy();
    });
});
