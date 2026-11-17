// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { sheetStore } from '@/ui/overlays/sheetStore';

// Required inside the tests: the web project can't load these routes' SVG and font modules.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = (name: 'messages' | 'composer' | 'permission' | 'chat') => require(`@/app/dev/${name}`).default as () => React.JSX.Element;

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

describeNative('chat, new-chat, composer and permission scenes', () => {
    beforeAll(() => {
        route('messages');
        route('composer');
        route('chat');
        route('permission');
    }, 60000);
    beforeEach(() => sheetStore.reset());

    const open = async (name: 'messages' | 'composer' | 'chat' | 'permission', params: Record<string, string>) => {
        mockParams = params;
        await mount(route(name));
    };

    it('stopped shows the stopped note with Continue', async () => {
        await open('messages', { state: 'stopped' });
        expect((await screen.findAllByTestId('stopped-note', opts)).length).toBe(3);
        expect(screen.getByTestId('continue', opts)).toBeTruthy();
    });

    it('reply-errors lists one failed turn per error kind', async () => {
        await open('messages', { state: 'reply-errors' });
        for (const kind of ['stream', 'context', 'model_server', 'connection', 'timeout', 'unknown']) {
            expect(await screen.findByTestId(`reply-error-${kind}`, opts)).toBeTruthy();
        }
    });

    it('activity-terminal opens the shell step to its output', async () => {
        await open('messages', { state: 'activity-terminal' });
        fireEvent.press(await screen.findByTestId('step-row-0', opts));
        expect(await screen.findByTestId('terminal-output', opts)).toBeTruthy();
    });

    it('activity-plan shows the live plan checklist', async () => {
        await open('messages', { state: 'activity-plan' });
        expect(await screen.findByTestId('plan-checklist', opts)).toBeTruthy();
    });

    it('activity-thinking shows a live thought and a finished one on its call', async () => {
        await open('messages', { state: 'activity-thinking' });
        expect((await screen.findAllByTestId('activity-timeline', opts)).length).toBe(2);
    });

    it('activity-thinking shows both thought texts once their headers open', async () => {
        await open('messages', { state: 'activity-thinking' });
        await screen.findAllByTestId('activity-timeline', opts);
        expect(screen.queryByText(/compare them before drafting/, opts)).toBeNull();
        screen.getAllByLabelText(/^Thinking/, opts).forEach((header) => fireEvent.press(header));
        expect(await screen.findByText(/compare them before drafting/, opts)).toBeTruthy();
        fireEvent.press(await screen.findByTestId('step-row--1', opts));
        expect(await screen.findByText(/skip searching/, opts)).toBeTruthy();
    });

    it.each(['activity-plan', 'activity-thinking'])('%s reads an elapsed time under an hour', async (state) => {
        await open('messages', { state });
        await screen.findAllByTestId('activity-timeline', opts);
        expect(screen.queryByText(/\d{3,}m \d+s/, opts)).toBeNull();
        expect(screen.queryByText(/\b\d{2,}m \d+s/, opts)).toBeNull();
    });

    it('activity-filter shows the step filter once the seven calls are open', async () => {
        await open('messages', { state: 'activity-filter' });
        fireEvent.press(within(await screen.findByTestId('steps-summary', opts)).getAllByLabelText(/./, opts)[0]!);
        expect(await screen.findByTestId('step-filter', opts)).toBeTruthy();
    });

    it('activity-vision offers the vision model on the step', async () => {
        await open('messages', { state: 'activity-vision' });
        expect(await screen.findByTestId('vision-offer', opts)).toBeTruthy();
    });

    it('many-scrolled-up shows the jump button', async () => {
        await open('messages', { state: 'many-scrolled-up' });
        expect(await screen.findByTestId('jump-to-bottom', opts)).toBeTruthy();
    });

    it('turn-changes-untracked shows the untracked-work warning', async () => {
        await open('messages', { state: 'turn-changes-untracked' });
        expect(await screen.findByText(/it can't track/, opts)).toBeTruthy();
    });

    it('new-chat-setup-failed shows the setup banner', async () => {
        await open('composer', { state: 'new-chat-setup-failed' });
        expect(await screen.findByText(t('newChat.setupFailed.title'), opts)).toBeTruthy();
    });

    it('new-chat-library shows the documents attach panel', async () => {
        await open('composer', { state: 'new-chat-library' });
        expect(await screen.findByText(t('newChat.docs.forChat'), opts)).toBeTruthy();
        expect(screen.getByText(/board-notes\.pdf/, opts)).toBeTruthy();
    });

    it('new-chat-warmup shows the progress line', async () => {
        await open('composer', { state: 'new-chat-warmup' });
        expect(await screen.findByText(/Gemma-4-E4B-it-GGUF/, opts)).toBeTruthy();
    });

    it('new-chat-send-error puts the opening message back in the box', async () => {
        await open('composer', { state: 'new-chat-send-error' });
        expect(await screen.findByDisplayValue('Summarize the board notes for me', opts)).toBeTruthy();
    });

    it('new-chat-assistant shows the notice with Try again', async () => {
        await open('composer', { state: 'new-chat-assistant' });
        expect(await screen.findByText(t('newChat.assistantUnavailable'), opts)).toBeTruthy();
        expect(screen.getByText(t('newChat.tryAgain'), opts)).toBeTruthy();
        expect(screen.getByTestId('new-chat-details', opts)).toBeTruthy();
    });

    it('new-chat-doc-brief shows the Ask about your documents card', async () => {
        await open('composer', { state: 'new-chat-doc-brief' });
        expect(await screen.findByTestId('document-brief-card', opts)).toBeTruthy();
    });

    it('reply-server-down shows the model-server notice and Try again under a failed reply', async () => {
        await open('messages', { state: 'reply-server-down' });
        expect(await screen.findByTestId('server-down-notice', opts)).toBeTruthy();
        expect(screen.getByTestId('try-again', opts)).toBeTruthy();
    });

    it('failed-report shows Try again on the failed latest reply', async () => {
        await open('messages', { state: 'failed-report' });
        expect(await screen.findByTestId('try-again', opts)).toBeTruthy();
    });

    it('cutoff-schedule-paused shows Try again on the cut-off latest reply', async () => {
        await open('messages', { state: 'cutoff-schedule-paused' });
        expect(await screen.findByTestId('try-again', opts)).toBeTruthy();
    });

    it('reply-errors shows the unexpected-error report link', async () => {
        await open('messages', { state: 'reply-errors' });
        expect((await screen.findAllByTestId('report-github', opts)).length).toBeGreaterThan(0);
    });

    it('reply-errors shows each kind\'s own classified text', async () => {
        await open('messages', { state: 'reply-errors' });
        const expected: Record<string, string> = {
            stream: t('mobileApp.error.streamBroke'),
            context: t('chatError.context'),
            model_server: t('chatError.modelServer'),
            connection: t('chatError.connection'),
            timeout: t('chatError.timeout'),
            unknown: t('chatError.unknown'),
        };
        for (const [kind, text] of Object.entries(expected)) {
            const turn = await screen.findByTestId(`reply-error-${kind}`, opts);
            expect(within(turn).getAllByText(text, opts).length).toBeGreaterThan(0);
        }
    });

    it('chat question waits for an answer', async () => {
        await open('chat', { state: 'question' });
        expect(await screen.findByText('Which folder should I tidy?', opts)).toBeTruthy();
    });

    it('chat approval shows the approval-needed card', async () => {
        await open('chat', { state: 'approval' });
        expect(await screen.findByText('Send the report to the whole team.', opts)).toBeTruthy();
    });

    it('chat queue shows Add to this reply and Send again', async () => {
        await open('chat', { state: 'queue' });
        expect(await screen.findByTestId('queued-steer-9001', opts)).toBeTruthy();
        expect(screen.getByTestId('queued-retry-9002', opts)).toBeTruthy();
    });

    it('chat queue-stop returns the queued texts to the box after Stop', async () => {
        await open('chat', { state: 'queue-stop' });
        fireEvent.press(await screen.findByTestId('composer-stop', opts));
        await waitFor(() => expect(screen.getByDisplayValue(/Also check the budget sheet/, opts)).toBeTruthy());
    });

    it.each(['calendar-create', 'calendar-update', 'calendar-cancel'])('permission %s lists the event facts', async (only) => {
        await open('permission', { only });
        expect(await screen.findByTestId('perm-calendar', opts)).toBeTruthy();
    });
});
