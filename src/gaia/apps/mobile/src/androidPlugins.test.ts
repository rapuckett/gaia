// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/* eslint-disable @typescript-eslint/no-require-imports */
const { withBlockBeforeRootProject } = require('../plugins/withNinjaJobs');

const ROOT = ['buildscript {}', '', 'apply plugin: "expo-root-project"', 'apply plugin: "com.facebook.react.rootproject"', ''].join('\n');

describe('withNinjaJobs', () => {
    it('inserts its block before the root-project plugin, once, however often it runs', () => {
        const once = withBlockBeforeRootProject(ROOT);
        const twice = withBlockBeforeRootProject(once);
        expect(twice).toBe(once);
        expect(once.split('@generated begin withNinjaJobs')).toHaveLength(2);
        expect(once.indexOf('@generated end withNinjaJobs')).toBeLessThan(once.indexOf('apply plugin: "expo-root-project"'));
    });

    it('moves a block an older run appended after the anchor', () => {
        const old = `${ROOT}\n// @generated begin withNinjaJobs (plugins/withNinjaJobs.js)\nold\n// @generated end withNinjaJobs\n`;
        const fixed = withBlockBeforeRootProject(old);
        expect(fixed).not.toContain('\nold\n');
        expect(fixed.split('@generated begin withNinjaJobs')).toHaveLength(2);
    });

    it('fails loudly when the anchor line is missing', () => {
        expect(() => withBlockBeforeRootProject('buildscript {}\n')).toThrow(/apply plugin: "expo-root-project"/);
    });
});
