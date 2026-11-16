// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { TailIssues } from './ReplyErrors';
import type { TurnTail } from './tailState';

const mockOpen = jest.fn();
jest.mock('@/features/notifications/openPolicyReceipts', () => ({ openPolicyReceipts: (id?: string) => mockOpen(id) }));

const t = translator('en');
const tail = (patch: Partial<TurnTail>): TurnTail => ({ live: false, text: '', events: [], replyId: null, canTryAgain: false, canContinue: false, ...patch });

const mount = (value: TurnTail) =>
    render(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
            <ThemeProvider>
                <TailIssues tail={value} local={false} />
            </ThemeProvider>
        </SafeAreaProvider>,
    );

describe('TailIssues', () => {
    it('a blocked tool with a receipt offers View receipt, which opens the policy alerts at that receipt', async () => {
        await mount(tail({ policyAlert: { tool: 'delete_file', receiptId: 'r1', seq: 1 } }));
        fireEvent.press(screen.getByText(t('chat.policyViewReceipt')));
        expect(mockOpen).toHaveBeenCalledWith('r1');
    });

    it('a blocked tool without a receipt says it is unavailable', async () => {
        await mount(tail({ policyAlert: { tool: 'delete_file', seq: 1 } }));
        expect(screen.getByText(t('activity.policy.receiptUnavailable'))).toBeTruthy();
        expect(screen.queryByText(t('chat.policyViewReceipt'))).toBeNull();
    });
});
