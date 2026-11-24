// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { translator } from '@/i18n/useT';

import { policyText } from './Privacy';

const t = translator('en');
const down = { code: 'saved_models_not_checked', cause: 'model_server_down', severity: 'warning' as const };

describe('policyText for saved models the PC could not check', () => {
    it('says the model server is down, one model or several', () => {
        expect(policyText(t, [{ ...down, models: ['Qwen3'] }], true).text).toContain("because the model server isn't answering, so it is still saved");
        expect(policyText(t, [{ ...down, models: ['A', 'B'] }], true).text).toContain("because the model server isn't answering, so they are still saved");
    });

    it('keeps the general wording for another cause or no models', () => {
        const general = t('mobileApp.settings.privacy.savedModelsNotChecked');
        expect(policyText(t, [{ ...down, cause: 'other', models: ['A'] }], true).text).toBe(general);
        expect(policyText(t, [{ ...down, models: [] }], true).text).toBe(general);
    });
});

describe('policyText model names', () => {
    it('names the model by the catalog name the caller gives, not its raw id', () => {
        const text = policyText(t, [{ ...down, models: ['Qwen3.6-35B-A3B-GGUF'] }], true, () => 'Qwen 3.6 35B A3B').text;
        expect(text).toContain('Qwen 3.6 35B A3B');
        expect(text).not.toContain('Qwen3.6-35B-A3B-GGUF');
    });
});
