// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { AgentPrograms, SetupCatalogEntry } from '../../../types';
import { chatRows, planAgentLabel } from '../jobModels.core';

const e = (o: Partial<SetupCatalogEntry>) => ({
    id: 'x', roles: ['chat'], chat_choice: true, gaia_model: true, setup_offer: true, support: 'verified', ...o,
}) as SetupCatalogEntry;

describe('chatRows', () => {
    it('puts tested models first and the rest in the fold', () => {
        const rows = chatRows([e({ id: 'u', support: 'untested' }), e({ id: 'v' }), e({ id: 'n', support: null }), e({ id: 'hidden', setup_offer: false })], 'v');
        expect(rows.verified.map((r) => r.id)).toEqual(['v']);
        expect(rows.untested.map((r) => r.id)).toEqual(['u', 'n']);
        expect(rows.untestedPicked).toBe(false);
    });

    it('opens the fold on an untested pick, and keeps a picked unoffered model listed', () => {
        const rows = chatRows([e({ id: 'u', support: 'untested', setup_offer: false })], 'u');
        expect(rows.untested.map((r) => r.id)).toEqual(['u']);
        expect(rows.untestedPicked).toBe(true);
    });
});

describe('planAgentLabel', () => {
    const agents = (current: string, cpp: boolean): AgentPrograms => ({
        current,
        programs: [
            { id: 'gaiapy', installed: true, size_bytes: 1, can_download: false, unavailable_reason: null, unavailable_code: null },
            { id: 'gaiacpp', installed: false, size_bytes: 1, can_download: cpp, unavailable_reason: null, unavailable_code: null },
        ],
        download: { state: 'idle', bytes_done: 0, bytes_total: null, error: null },
    });
    it('names the agent in use, or the pick over it', () => {
        expect(planAgentLabel(agents('gaiapy', true))).toBe('setup.agent.gaiapy');
        expect(planAgentLabel(agents('gaiapy', true), 'gaiacpp')).toBe('setup.agent.gaiacpp');
    });
    it('says nothing without a second agent on offer, or for an unknown one', () => {
        expect(planAgentLabel(agents('gaiapy', false))).toBeNull();
        expect(planAgentLabel(undefined)).toBeNull();
        expect(planAgentLabel(agents('gaiacode', true))).toBeNull();
    });
});
