// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

import { ConfirmSheet } from './ConfirmSheet';

jest.mock('@/ui', () => ({ Button: () => null, Stack: () => null, Text: () => null, Sheet: () => null }));

describe('ConfirmSheet footer', () => {
    it('puts each button on its own full-width line that wraps a long label', () => {
        const sheet = ConfirmSheet({ open: true, title: 'T', confirmLabel: 'a'.repeat(80), cancelLabel: 'b'.repeat(80), onConfirm: jest.fn(), onCancel: jest.fn() });
        const stack = (sheet as ReactElement<{ footer: ReactNode }>).props.footer as ReactElement<{ children: ReactNode; flexDirection?: string }>;
        expect(isValidElement(stack) && (stack.type as { name?: string }).name).not.toBe('Row');
        const buttons = Children.toArray(stack.props.children) as ReactElement<{ full?: boolean; wrap?: boolean }>[];
        expect(buttons).toHaveLength(2);
        for (const b of buttons) expect(b.props).toMatchObject({ full: true, wrap: true });
    });
});
