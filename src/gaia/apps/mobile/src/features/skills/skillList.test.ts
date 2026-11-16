// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { translator } from '@/i18n/useT';

import { GROUPS, SKILLS_HOW_PARAMS } from './skillList';

describe('skill folder paths in Arabic', () => {
    it('keeps each path in its own left-to-right island inside the note, the empty text and the how-to', () => {
        const t = translator('ar');
        const yours = GROUPS.find((g) => g.source === 'user')!;
        const lines = [t(yours.note, yours.params), t(yours.empty!, yours.params), t('settings.skills.how', SKILLS_HOW_PARAMS)];
        for (const line of lines) expect(line).toContain('\u2066~/.gaia/skills\u2069');
    });
});
