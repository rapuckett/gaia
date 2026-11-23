// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import type { GaiaNotification } from '@webui/types/agent';

import { translator } from '@/i18n/useT';

import { notificationText } from './notificationText';

describe('notificationText', () => {
    it("keeps the PC's English reason for a failed task in one left-to-right run, so Arabic doesn't reorder it", () => {
        const reason = 'The model stopped responding at step 1. The model server on this PC: 5 attempts failed, the last with HTTP 500.';
        const failed = { id: 'schedule-error-a-1', type: 'error', agentId: 'scheduler', agentName: 'GAIA', title: 'x', message: reason } as GaiaNotification;
        expect(notificationText(failed, translator('ar')).message).toBe(isolate(reason, 'ltr'));
    });

    it('codes a hidden character in an approval name inside its left-to-right isolate, as the card does', () => {
        const ask = { id: 'p1', type: 'permission_request', agentId: 'gaia', agentName: 'GAIA', title: '', message: '', tool: 'some_tool', toolLabel: 'inv\u200Doice' } as GaiaNotification;
        const { title, message } = notificationText(ask, translator('en'));
        for (const line of [title, message]) {
            expect(line).toContain(isolate('inv[U+200D]oice', 'ltr'));
            expect(line).not.toContain('\u200D');
        }
    });

    it('codes an override in an error while keeping its isolate', () => {
        const failed = { id: 'e1', type: 'error', agentId: 'gaia', agentName: 'GAIA', title: 'x', message: 'a\u202Eb' } as GaiaNotification;
        expect(notificationText(failed, translator('en')).message).toBe(isolate('a[U+202E]b', 'ltr'));
    });
});
