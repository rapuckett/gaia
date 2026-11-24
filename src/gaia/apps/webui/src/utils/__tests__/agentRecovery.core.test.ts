// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { isFastAgent, offersAgentRecovery } from '../agentRecovery.core';

describe('agentRecovery.core', () => {
    it('names only gaiacpp as the fast agent', () => {
        expect(isFastAgent('gaiacpp')).toBe(true);
        expect(isFastAgent('gaiapy')).toBe(false);
        expect(isFastAgent(undefined)).toBe(false);
    });

    it('offers recovery on a retryable failed reply that is not the model server', () => {
        expect(offersAgentRecovery({ failed: true }, true)).toBe(true);
        expect(offersAgentRecovery({ failed: true }, false)).toBe(false);
        expect(offersAgentRecovery({ failed: false }, true)).toBe(false);
        expect(offersAgentRecovery({ failed: true, failure: 'model_server_down' }, true)).toBe(false);
    });
});
