// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { bracketParts } from '@webui/i18n/registry';
import { translator } from '@webui/i18n/translator';

import type { LocalModelStatus } from '@/api/client.types';

import { needLine, pillText, restartControl } from './modelStatusText';

const t = translator('en');

function status(over: Partial<LocalModelStatus> = {}): LocalModelStatus {
    return {
        state: 'loaded',
        active_model: 'Gemma-4-E4B-it-GGUF',
        active_display_name: 'Gemma 4 E4B',
        active_remote: false,
        model: 'Gemma-4-E4B-it-GGUF',
        display_name: 'Gemma 4 E4B',
        placement: null,
        ctx_size: 65536,
        memory: null,
        memory_error: null,
        error: null,
        base_url: 'http://localhost:13305',
        owner: 'gaia',
        busy: false,
        restarting: false,
        restart_error: null,
        ...over,
    };
}

describe('pillText', () => {
    it('names the place and model, and says the state for a local one', () => {
        const pill = pillText(status(), t);
        expect(pill.text).toBe('On your PC · Gemma 4 E4B');
        expect(pill.aria).toBe('On your PC · Gemma 4 E4B, model loaded');
    });

    it('names only the cloud model for a remote one', () => {
        const pill = pillText(status({ active_remote: true, active_display_name: 'Claude' }), t);
        expect(pill).toMatchObject({
            text: 'Claude',
            remote: true,
            aria: 'Claude',
        });
    });

    it('falls back to "Model" before the PC has answered', () => {
        expect(pillText(undefined, t).text).toBe('Model');
    });
});

describe('restartControl', () => {
    it('offers nothing for a stopped server GAIA does not run', () => {
        expect(restartControl(status({ state: 'stopped', owner: 'user' }), false).shown).toBe(false);
    });

    it('asks first on a Lemonade GAIA does not own, and waits while the model is busy', () => {
        expect(restartControl(status({ owner: 'user' }), false).confirms).toBe(true);
        expect(restartControl(status({ busy: true, busy_reason: 'warm_up' }), false)).toMatchObject({
            disabled: true,
            hint: 'modelStatus.busyWarmUp',
        });
    });
});

describe('needLine', () => {
    it('brackets the Arabic "Free:" with its own value, with no separator between them and the sizes read left to right', () => {
        const [own, gloss] = bracketParts(needLine(translator('ar'), 'Gemma 4 E4B', 6, 120));
        expect(own).toBe('\u2066Gemma 4 E4B\u2069 · \u20666.0 GB\u2069 · \u2067المتاح: \u2066120.0 GB\u2069\u2069');
        expect(gloss).toBe('\u2066(Free: \u2066120.0 GB\u2069)\u2069');
    });
});
