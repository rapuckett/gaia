// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { CODE_COLLAPSE_LINES } from '@webui/utils/longContent';
import { translator } from '@/i18n/useT';
import { openDocument } from '@/platform/openDocument';
import { useConnectionStore } from '@/state/connection';
import { ThemeProvider } from '@/ui';

import { Markdown } from './Markdown';

jest.mock('@/platform/openDocument', () => ({ openDocument: jest.fn() }));
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

    it('opens a cited library file through the authenticated download, and says why it could not', async () => {
        useConnectionStore.getState().setConnection({ baseUrl: 'http://pc.local:4200/', token: 'secret' });
        (openDocument as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('GAIA answered 404'));
        await render(
            <ThemeProvider>
                <Markdown
                    text="See `quarterly-report.pdf` on page 12."
                    documents={[{ id: 'doc 1', filename: 'quarterly-report.pdf' }]}
                    notes={['Added to your library as a copy.']}
                />
            </ThemeProvider>,
        );
        await act(async () => screen.getByText(/quarterly-report\.pdf/).props.onPress());
        expect(openDocument).toHaveBeenLastCalledWith('http://pc.local:4200', 'secret', expect.objectContaining({ id: 'doc 1', filename: 'quarterly-report.pdf' }));
        expect(screen.queryByText(/Couldn't open/)).toBeNull();
        await act(async () => screen.getByText(/quarterly-report\.pdf/).props.onPress());
        expect(await screen.findByText(/Couldn't open quarterly-report\.pdf: GAIA answered 404/)).toBeTruthy();
        expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
    });

    it('formatting variant renders a link, an image, a heading and HTML as plain text', async () => {
        const text = '# Urgent\n\nOpen [the form](https://example.com/login) ![pic](https://example.com/p.png) <b>raw</b>';
        await render(
            <ThemeProvider>
                <Markdown text={text} variant="formatting" />
            </ThemeProvider>,
        );
        const form = screen.getByText(/the form/);
        expect(form.props.onPress).toBeUndefined();
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByText(/pic|p\.png/)).toBeNull();
        expect(screen.getByText('Urgent').props.accessibilityRole).not.toBe('header');
        expect(screen.getByText(/<b>raw<\/b>/)).toBeTruthy();
    });
});
