// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, type ReactNode } from 'react';
import { createRoot } from 'test-renderer';

import { translator } from '@webui/i18n/translator';

import type { GaiaClient } from '@/api/client.types';
import { createFakeClient } from '@/api/fake';
import { GaiaClientProvider } from '@/data/GaiaClientProvider';

import { FolderChip } from './FolderChip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/ui/icons', () => ({ ChevronDown: 'ChevronDown', Folder: 'Folder', FolderPlus: 'FolderPlus' }));
jest.mock('@/ui', () => {
    const { createElement: mockElement } = jest.requireActual('react');
    const host = (type: string) => (props: Record<string, unknown>) => mockElement(type, props, props.children as ReactNode);
    const pressable = (props: Record<string, unknown>) => mockElement('Pressable', props, props.children as ReactNode);
    return { Button: host('Button'), Icon: host('Icon'), Pressable: pressable, Row: host('Row'), Sheet: host('Sheet'), Stack: host('Stack'), Text: host('Text') };
});

const en = translator('en');
const own = { path: '/Users/avery/GAIA', name: 'GAIA', gaia_folder: true, choosable: true };

describe('FolderChip on a new chat', () => {
    it('offers Add a folder when the folder is choosable; pressing it says to do it on the PC and calls nothing', async () => {
        const called: string[] = [];
        const base = createFakeClient({});
        const client = new Proxy(base, {
            get(target, key) {
                const value = (target as unknown as Record<string | symbol, unknown>)[key];
                return typeof value === 'function' ? (...args: unknown[]) => (called.push(String(key)), value.apply(target, args)) : value;
            },
        }) as GaiaClient;
        const r = createRoot({ textComponentTypes: ['Text', 'RCTText'] });
        await act(async () => {
            r.render(
                <GaiaClientProvider client={client}>
                    <FolderChip folder={own} />
                </GaiaClientProvider>,
            );
        });
        const find = (id: string) => r.container.queryAll((i) => i.props.testID === id)[0];
        expect(find('folder-add').props.accessibilityLabel).toBe(en('folderChip.add'));
        expect(r.container.queryAll((i) => i.type === 'Sheet')[0].props.open).toBe(false);
        await act(async () => find('folder-add').props.onPress());
        const sheet = r.container.queryAll((i) => i.type === 'Sheet')[0];
        expect(sheet.props.open).toBe(true);
        expect(sheet.props.title).toBe(en('mobileApp.pcOnly.refusal'));
        expect(called).toEqual([]);
        await act(async () => r.unmount());
    });
});
