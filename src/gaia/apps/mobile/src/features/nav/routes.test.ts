// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import fs from 'fs';
import path from 'path';

import { INITIAL_ROUTE } from './navigation';
import { activeMenuRoute, LIBRARY_ROUTE, menuRouteNames, ROUTES } from './routes';

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

describe('library stack', () => {
    const app = path.join(__dirname, '..', '..', 'app');

    it('declares the library group once instead of its three pages', () => {
        expect(ROUTES).toContain(LIBRARY_ROUTE);
        for (const page of ['documents', 'files', 'file-preview']) expect(ROUTES).not.toContain(page);
    });

    it('keeps the three pages inside the library stack, which anchors on the browser root', () => {
        const dir = path.join(app, LIBRARY_ROUTE);
        for (const page of ['documents', 'files', 'file-preview']) expect(fs.existsSync(path.join(dir, `${page}.tsx`))).toBe(true);
        expect(fs.readFileSync(path.join(dir, '_layout.tsx'), 'utf8')).toContain("anchor: 'documents'");
    });

    it('closes the preview with back, falling back to the library on a cold link', () => {
        const src = fs.readFileSync(path.join(app, LIBRARY_ROUTE, 'file-preview.tsx'), 'utf8');
        expect(src).toContain("router.canGoBack() ? router.back() : router.replace('/documents')");
    });

    it('shows the library menu entry and lights it up on its pages', () => {
        expect(menuRouteNames(['index', LIBRARY_ROUTE])).toEqual(['index', 'documents']);
        expect(activeMenuRoute('/files')).toBe('documents');
        expect(activeMenuRoute('/file-preview')).toBe('documents');
        expect(activeMenuRoute('/skills')).toBe('skills');
        expect(activeMenuRoute('/')).toBeNull();
    });
});
