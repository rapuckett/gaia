// @vitest-environment node
// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// The RTL screenshots only cover screens that have a scene, so a whole screen could
// ship in English (#6590, #6591, #6585). This counts English written outside the
// en/ar catalogs in every .ts and .tsx file and fails when a file gains any.

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { scanAll, scanSource, type Skipped } from './hardcodedTextScan';

const BASELINE = resolve(__dirname, 'hardcodedText.baseline.json');

/** What a snippet reports, as `text` (or `name="text"` for attributes and copy properties). */
const found = (code: string, file = 'x.tsx') => scanSource(code, file).map((h) => h.text);

describe('English written outside the catalogs', () => {
    it('finds text, quoted children and text attributes, not translated ones', () => {
        const code = `const A = () => <div title="Delete chat" aria-label={t('x')} className="row">
            Saved {n} files {'Try again'} {t('ok')} GAIA <b>NPU</b></div>;`;
        expect(found(code)).toEqual(['title="Delete chat"', 'Saved', 'files', 'Try again']);
    });

    it('finds text inside ternaries, logical expressions and template strings', () => {
        const code = `const A = () => <div>
            {busy ? 'Saving' : 'Save'} {err && 'Something failed'} {name || 'Untitled'}
            {\`Try again\`} {\`\${n} files left\`} {(label as string) ?? 'None yet'}</div>;`;
        expect(found(code)).toEqual([
            'Saving', 'Save', 'Something failed', 'Untitled', 'Try again', '${} files left', 'None yet',
        ]);
    });

    it('finds text attributes written as expressions', () => {
        const code = `const A = () => <button title={'Delete'} placeholder={\`Search\`}
            aria-label={x ? 'Open menu' : 'Close menu'} alt={ok && 'Preview'} />;`;
        expect(found(code)).toEqual([
            'title="Delete"', 'placeholder="Search"', 'aria-label="Open menu"', 'aria-label="Close menu"',
            'alt="Preview"',
        ]);
    });

    it('ignores ids, class names, roles, conditions, translated calls and all-caps names', () => {
        const code = `const A = () => <div data-testid={x ? 'save-button' : 'saveButton'}
            className={busy ? 'row busy' : 'row'} id={'main panel'} key={'Item one'} role={'dialog'}
            aria-hidden={x ? 'true' : 'false'} title={x ? t('a') : t('b')} aria-label={label}>
            {isOpen === 'Open state' ? null : <b>{t('ok')}</b>} {x ? 'GAIA' : 'NPU'} {busy && n}
            {\`\${n}\`} {ok ? <i>{t('y')}</i> : null}</div>;`;
        expect(found(code)).toEqual([]);
    });

    it('finds English passed to formatting calls, message setters and toasts', () => {
        const code = `const A = () => { setError('Could not save the file'); toast('Saved'); return <p>{format('Hello there')}</p>; };`;
        expect(found(code)).toEqual(['Could not save the file', 'Saved', 'Hello there']);
    });

    it('finds copy properties and switch-case returns in plain .ts files', () => {
        const code = `export const rows = [{ label: 'Thinking', id: 'think-row' }];
            export function name(k: string) { switch (k) { case 'a': return 'Working'; default: return 'Idle'; } }
            export const msg = \`\${n} files left to send\`;`;
        expect(found(code, 'x.ts')).toEqual(['label="Thinking"', 'Working', 'Idle', '${} files left to send']);
    });

    it('ignores types, imports, lookups, log lines, thrown errors and catalog keys', () => {
        const code = `import x from 'some package';
            type Mode = 'Dark mode' | 'Light mode';
            const m = { 'Some label': 1 }[k]; if (s === 'Not started') {}
            console.log('Starting the server now'); throw new Error('Server is not reachable');
            t('sidebar.label'); const k = 'settings.model.title';`;
        expect(found(code, 'x.ts')).toEqual([]);
    });

    it('skips values passed to keepTogether and isolate', () => {
        const code = `const a = { newApp: keepTogether('New Application') }; const b = isolate('Some Value Here', 'ltr');`;
        expect(found(code, 'x.ts')).toEqual([]);
    });

    it('excludes literals on a line marked // english: with a reason', () => {
        const code = `const a = { title: 'Support HEIC files' }; // english: GitHub issue title
            // english: matched against the backend's text
            const b = { label: 'Image', c: 'Support video files' };
            const c = { title: 'Still counted' };`;
        expect(found(code, 'x.ts')).toEqual(['title="Still counted"']);
    });

    it('fails on // english: with no reason', () => {
        expect(() => scanSource(`const a = { title: 'Support HEIC files' }; // english:   `, 'x.ts')).toThrow(/needs a reason/);
    });

    it('does not grow in any file', () => {
        const skipped: Skipped = {};
        const hits = scanAll(skipped);
        const counts = Object.fromEntries(Object.entries(hits).sort().map(([f, h]) => [f, h.length]));
        // UPDATE_I18N_BASELINE=1 npx vitest run hardcodedText rewrites the counts.
        if (process.env.UPDATE_I18N_BASELINE) {
            writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
        }
        const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE, 'utf-8'));
        const grew = Object.entries(hits)
            .filter(([file, list]) => list.length > (baseline[file] ?? 0))
            .flatMap(([file, list]) => [
                `${file}: ${list.length} (allowed ${baseline[file] ?? 0}), add a key in en.ts and ar.ts:`,
                ...list.map((h) => `  ${file}:${h.line} [${h.kind}] ${h.text}`),
            ]);
        expect(grew, 'Put new user-facing text through useT (see .claude/skills/reviewing-agent-ui/SKILL.md)').toEqual([]);
        const shrank = Object.entries(baseline)
            .filter(([file, n]) => (counts[file] ?? 0) < n)
            .map(([file, n]) => `${file}: ${counts[file] ?? 0} (baseline ${n})`);
        expect(shrank, 'Fewer hard-coded strings: lower the baseline so they cannot come back').toEqual([]);
    });
});
