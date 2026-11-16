// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { filePathOfCodeSpan } from '../codeSpanPath';

describe('filePathOfCodeSpan', () => {
    it.each([
        ['C:\\out\\answer.md', 'C:\\out\\answer.md'],
        ['/etc/hosts', '/etc/hosts'],
        ['/Users/a b/c.txt', '/Users/a b/c.txt'],
        ['/home/me/notes/', '/home/me/notes/'],
        ['/Volumes/Backup', '/Volumes/Backup'],
        [' /tmp/run.log ', '/tmp/run.log'],
        ['file:///home/me/notes.txt', '/home/me/notes.txt'],
        ['file:///Users/me/My%20Report%20%231.pdf', '/Users/me/My Report #1.pdf'],
        ['FILE:///srv/data.csv', '/srv/data.csv'],
        ['file:///C:/Users/me/a.txt', 'C:/Users/me/a.txt'],
        ['file:///opt/app/readme.md?x=1#top', '/opt/app/readme.md'],
    ])('reads %s as %s', (span, path) => {
        expect(filePathOfCodeSpan(span)).toBe(path);
    });

    it.each([
        ['a bare slash', '/'],
        ['a double slash', '//'],
        ['a network path', '//server/share/a.txt'],
        ['a home-relative path', '~/notes.txt'],
        ['a relative path', 'notes/a.txt'],
        ['an API route', '/api/chat/send'],
        ['a slash command', '/help'],
        ['a web URL', 'https://example.com/a.txt'],
        ['a file URL with a host', 'file://server/share/a.txt'],
        ['a file URL with no path', 'file:///'],
        ['a malformed file URL', 'file:///Users/me/%E0%A4%A'],
        ['a file URL hiding a newline', 'file:///Users/me/a%0Ab.txt'],
        ['a path and a newline', '/Users/me/a.txt\n/Users/me/b.txt'],
        ['a path with a leading space segment', '/ Users/me'],
        ['empty text', '   '],
    ])('rejects %s', (_label, span) => {
        expect(filePathOfCodeSpan(span)).toBeNull();
    });
});
