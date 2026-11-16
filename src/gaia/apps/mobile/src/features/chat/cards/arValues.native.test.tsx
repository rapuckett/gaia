// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { glossParts } from '@webui/i18n/registry';
import { translator } from '@/i18n/useT';
import { ThemeProvider } from '@/ui';

import { DiffCard } from './DiffCard';
import { KeyValueCard } from './KeyValueCard';
import { TableCard } from './TableCard';
import { valueDir } from './valueDir';
import { expandLabel } from '../markdown/expandLabel';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));

const describeNative = Platform.OS === 'web' ? describe.skip : describe;
const dirOf = (node: unknown) => (node as { props: { style: { writingDirection?: string } } }).props.style.writingDirection;

describe('valueDir', () => {
    it('keeps numbers, dates and English left to right, and Arabic on its own direction', () => {
        expect(valueDir('1204')).toBe('ltr');
        expect(valueDir('02:00 2026-11-08')).toBe('ltr');
        expect(valueDir('Verified')).toBe('ltr');
        expect(valueDir('مرحبا')).toBe('auto');
    });
});

describe('expandLabel', () => {
    it('words the line count once per language, so the English gloss holds no Arabic', () => {
        const label = expandLabel(translator('ar'), 43);
        const gloss = (glossParts(label)?.find((p) => p.gloss)?.text ?? '').replace(/[\u2066-\u2069]/g, '');
        expect(gloss).toContain('Expand');
        expect(gloss).toContain('43 lines');
        expect(gloss).not.toMatch(/[\u0600-\u06FF]/);
    });
});

describeNative('card values', () => {
    it('key-value cells run left to right, numbers included', async () => {
        await render(
            <ThemeProvider>
                <KeyValueCard data={{ items: [{ key: 'Files copied', value: 1204 }, { key: 'Source', value: 'C:\\Users\\me' }] }} />
            </ThemeProvider>,
        );
        expect(dirOf(screen.getByText('1204'))).toBe('ltr');
        expect(dirOf(screen.getByText('C:\\Users\\me'))).toBe('ltr');
    });

    it('table date cells run left to right', async () => {
        await render(
            <ThemeProvider>
                <TableCard data={{ columns: ['Run', 'Started'], rows: [['Run 1', '02:00 2026-11-08']] }} />
            </ThemeProvider>,
        );
        expect(dirOf(screen.getByText('02:00 2026-11-08'))).toBe('ltr');
    });

    it('a diff file name runs left to right', async () => {
        await render(
            <ThemeProvider>
                <DiffCard data={{ title: 'report.py', path: 'scripts/report.py', badge: 'Edited', unified: '' }} />
            </ThemeProvider>,
        );
        expect(dirOf(screen.getByText('report.py'))).toBe('ltr');
    });
});
