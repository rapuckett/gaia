// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { examplePath } from '@webui/utils/platform';

import { phonePathExample } from './phonePathExample';

describe('phonePathExample', () => {
    it.each([
        ['Mac', '/Users/you/Documents'],
        ['Win32', 'C:\\Users\\you\\Documents'],
        ['Linux x86_64', '/home/you/Documents'],
    ])('shows the folder, not the file, for %s', (platform, folder) => {
        expect(phonePathExample(examplePath(platform))).toBe(folder);
    });
});
