// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { firstSentence, isTypingSkillCommand, matchSkillCommands } from './skillCommands.core';

const SKILLS = [{ name: 'summarize' }, { name: 'sql-help' }, { name: 'coding' }];

describe('skill commands', () => {
    it('opens only for a "/" and a name, not for text around it', () => {
        expect(isTypingSkillCommand('/')).toBe(true);
        expect(isTypingSkillCommand('/sum')).toBe(true);
        expect(isTypingSkillCommand('hi /sum')).toBe(false);
        expect(isTypingSkillCommand('/sum now')).toBe(false);
        expect(isTypingSkillCommand('')).toBe(false);
    });

    it('filters by prefix, ignoring case', () => {
        expect(matchSkillCommands(SKILLS, '/').map((s) => s.name)).toEqual(['summarize', 'sql-help', 'coding']);
        expect(matchSkillCommands(SKILLS, '/S').map((s) => s.name)).toEqual(['summarize', 'sql-help']);
        expect(matchSkillCommands(SKILLS, '/sq').map((s) => s.name)).toEqual(['sql-help']);
        expect(matchSkillCommands(SKILLS, 'sum')).toEqual([]);
    });

    it('keeps a description to its first sentence', () => {
        expect(firstSentence('Does a thing.  Then\nmore. Even more.')).toBe('Does a thing.');
        expect(firstSentence('No full stop')).toBe('No full stop');
    });
});
