// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

const moduleNameMapper = {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@webui/(.*)$': '<rootDir>/../webui/src/$1',
};

const project = (preset) => ({
    displayName: preset,
    preset: `jest-expo/${preset}`,
    moduleNameMapper,
    testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
    // Sheets are native-only: the web project has no BackHandler or native gesture module to test.
    testPathIgnorePatterns: preset === 'web' ? ['/node_modules/', '/SheetHost\\.test\\.tsx$'] : ['/node_modules/'],
});

module.exports = {
    projects: [project('ios'), project('android'), project('web')],
};
