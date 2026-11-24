// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import fs from 'fs';
import path from 'path';

import { INITIAL_ROUTE } from './navigation';
import { ROUTES } from './routes';

describe('dev routes', () => {
    it('declares every dev page in the root layout', () => {
        const dir = path.join(__dirname, '..', '..', 'app', 'dev');
        const missing = fs
            .readdirSync(dir)
            .filter((f) => /\.tsx?$/.test(f) && !f.startsWith('_'))
            .map((f) => `dev/${f.replace(/\.tsx?$/, '')}`)
            .filter((name) => !ROUTES.includes(name));
        expect(missing).toEqual([]);
    });

    it('sends back from any drawer destination to home, and home leaves the app', () => {
        const layout = fs.readFileSync(path.join(__dirname, 'AppNavigator.tsx'), 'utf8');
        expect(layout).toContain('backBehavior="initialRoute"');
        expect(ROUTES[0]).toBe(INITIAL_ROUTE);
        expect(INITIAL_ROUTE).toBe('index');
    });
});
