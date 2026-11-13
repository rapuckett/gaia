// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { CODE_COLLAPSE_LINES } from '@webui/utils/longContent';
import { translator } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';
import { ThemeProvider } from '@/ui';

import { Markdown } from './Markdown';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

const code = Array.from({ length: CODE_COLLAPSE_LINES + 5 }, (_, i) => `line ${i}`).join('\n');
const answer = [
    '# Plan',
    '```ts\n' + code + '\n```',
    '| Name | Count |\n| --- | --- |\n| apples | 3 |',
    'Click [bad](javascript:alert(1)) or [good](https://example.com).',
    'Logs: C:\\Users\\me\\.gaia\\app.log',
].join('\n\n');

describe('Markdown', () => {
    it('renders headings, a collapsed code block, a table, safe links and Windows paths as text', async () => {
        const t = translator('en');
        const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
        await render(
            <ThemeProvider>
                <Markdown text={answer} />
            </ThemeProvider>,
        );

        expect(screen.getByText('Plan')).toBeTruthy();
        expect(screen.getByText(t('code.expand', { size: `${CODE_COLLAPSE_LINES + 5} lines` }))).toBeTruthy();
        expect(screen.queryByText(/line 24/)).toBeNull();
        expect(screen.getByText('apples')).toBeTruthy();

        // javascript: shows as plain text and has no press handler; https: opens.
        expect(screen.getAllByText(/bad/).every((el) => el.props.onPress === undefined)).toBe(true);
        screen.getByText('good').props.onPress();
        expect(open).toHaveBeenCalledWith('https://example.com');
        expect(open).toHaveBeenCalledTimes(1);

        const paths = screen.getAllByText(/C:\\Users\\me\\\.gaia\\app\.log/);
        expect(paths.length).toBeGreaterThan(0);
        expect(paths.every((el) => el.props.onPress === undefined)).toBe(true);
    });

    it('opens a cited library file in the system browser at its page, and shows library notices as notes', async () => {
        useConnectionStore.getState().setConnection({ baseUrl: 'http://pc.local:4200/', token: null });
        const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
        await render(
            <ThemeProvider>
                <Markdown
                    text="See `quarterly-report.pdf` on page 12."
                    documents={[{ id: 'doc 1', filename: 'quarterly-report.pdf' }]}
                    notes={['Added to your library as a copy.']}
                />
            </ThemeProvider>,
        );
        screen.getByText(/quarterly-report\.pdf/).props.onPress();
        expect(open).toHaveBeenLastCalledWith('http://pc.local:4200/api/documents/doc%201/file#page=12');
        expect(screen.getByRole('note')).toBeTruthy();
    });
});
