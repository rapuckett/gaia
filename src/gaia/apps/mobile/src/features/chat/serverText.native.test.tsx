// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { item, type QueuedMessage } from '@webui/utils/messageQueue';

import { GaiaApiError, GaiaNetworkError, GaiaTurnError } from '@/api/errors';
import type { Message } from '@/api/client.types';
import { failureOf, type HeldMessage } from '@/features/composer/composerQueue';
import { StoppedNote } from '@/features/chat/EndingNotes';
import { QueuedMessages } from '@/features/composer/QueuedMessages';
import { createFirstSend } from '@/features/new-chat/firstSend';
import { describeHttpFailure, translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { AnswerComparison } from './compare/AnswerComparison';

const t = translator('en');
const describeNative = Platform.OS === 'web' ? describe.skip : describe;

const wrap = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>{children}</ThemeProvider>
    </SafeAreaProvider>
);

const SERVER_TEXT = 'llama-server exited with code 3';

describeNative('server text stays off the sentence in the chat area', () => {
    it('shows a failed queued message as "Not sent." with the reason on its own left-to-right line', async () => {
        const failed: QueuedMessage = { ...item('hello', 'failed'), error: SERVER_TEXT };
        await render(<QueuedMessages items={[failed]} replying={false} onRemove={() => undefined} onRetry={() => undefined} />, { wrapper: wrap });
        expect(screen.getByText(t('queue.notSentBare'))).toBeTruthy();
        expect(screen.getByTestId(`queued-retry-${failed.id}`)).toBeTruthy();
        const detail = screen.getByText(SERVER_TEXT);
        expect(StyleSheet.flatten(detail.props.style)).toMatchObject({ writingDirection: 'ltr' });
    });

    const failedRow = (err: unknown): HeldMessage => ({ ...item('hello', 'failed'), ...failureOf(err) });
    const drawRow = (row: HeldMessage) =>
        render(<QueuedMessages items={[row]} replying={false} onRemove={() => undefined} onRetry={() => undefined} />, { wrapper: wrap });

    it('shows a failed network send as a translated sentence, with no catalog key or params', async () => {
        await drawRow(failedRow(new GaiaNetworkError('http://pc:4200', new Error('refused'))));
        expect(screen.getByText(t('queue.notSentBare'))).toBeTruthy();
        expect(screen.getByText(t('mobileApp.error.network', { url: 'http://pc:4200', reason: 'refused' }))).toBeTruthy();
        expect(screen.queryByText(/mobileApp\.|\{/)).toBeNull();
    });

    it('shows a failed PC error as "Not sent." with the PC reason as a left-to-right detail', async () => {
        await drawRow(failedRow(new GaiaApiError(500, 'disk full')));
        expect(screen.getByText(t('queue.notSentBare'))).toBeTruthy();
        expect(screen.getByText(t('mobileApp.error.httpNoDetail'))).toBeTruthy();
        expect(StyleSheet.flatten(screen.getByText('disk full').props.style)).toMatchObject({ writingDirection: 'ltr' });
    });

    it('keeps the text of a plain Error as the detail', async () => {
        await drawRow(failedRow(new Error('no connection')));
        expect(screen.getByText('no connection')).toBeTruthy();
    });

    it('shows a failed comparison as our sentence with the PC reason as a left-to-right detail', async () => {
        const failure = describeHttpFailure(new GaiaApiError(500, SERVER_TEXT), t);
        const original = { id: 1, session_id: 'c', role: 'assistant', content: 'a', created_at: '', rag_sources: null } as Message;
        await render(
            <AnswerComparison
                original={original}
                comparison={{ messageId: 1, keeping: null, state: { status: 'failed', model: 'M', error: failure.text, detail: failure.detail } }}
                onKeep={() => undefined}
                onClose={() => undefined}
            />,
            { wrapper: wrap },
        );
        expect(screen.getByText(t('mobileApp.error.httpNoDetail'))).toBeTruthy();
        expect(StyleSheet.flatten(screen.getByText(SERVER_TEXT).props.style)).toMatchObject({ writingDirection: 'ltr' });
    });

    it('keeps the PC reason for a failed first send out of its sentence', async () => {
        const flow = createFirstSend({
            createSession: () => Promise.reject(new GaiaApiError(500, SERVER_TEXT)),
            deliver: async () => undefined,
            takeHeld: () => [],
            flush: async () => undefined,
            queueHeld: () => undefined,
            describeError: (err) => describeHttpFailure(err, t).text,
            describeDetail: (err) => describeHttpFailure(err, t).detail,
            firstNotSent: '',
        });
        await flow.submit('hi', () => undefined);
        expect(flow.getState().error).toBe(t('mobileApp.error.httpNoDetail'));
        expect(flow.getState().errorDetail).toBe(SERVER_TEXT);
    });

    it('shows an error while stopping as a reason-free sentence with the PC text as a left-to-right detail', async () => {
        await render(<StoppedNote stop={{ state: 'stopped', error: new GaiaTurnError(SERVER_TEXT) }} />, { wrapper: wrap });
        expect(screen.getByText(t('mobileApp.chat.stoppedErrorShort'))).toBeTruthy();
        expect(StyleSheet.flatten(screen.getByText(SERVER_TEXT).props.style)).toMatchObject({ writingDirection: 'ltr' });
    });
});
