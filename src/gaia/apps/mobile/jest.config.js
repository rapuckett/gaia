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
});

module.exports = {
    projects: [project('ios'), project('android'), project('web')],
};
