// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveAnnouncer, announce } from '../LiveAnnouncer';

describe('LiveAnnouncer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is in the page, empty, before anything is announced', () => {
        render(<LiveAnnouncer />);
        const region = screen.getByRole('status');
        expect(region).toHaveAttribute('aria-live', 'polite');
        expect(region).toHaveAttribute('aria-atomic', 'true');
        expect(region).toHaveClass('visually-hidden');
        expect(region).toBeEmptyDOMElement();
    });

    it('puts the announced text in the region', () => {
        render(<LiveAnnouncer />);
        act(() => { announce('Copied'); vi.runAllTimers(); });
        expect(screen.getByRole('status')).toHaveTextContent('Copied');
    });

    it('announces the same message twice by clearing in between', () => {
        render(<LiveAnnouncer />);
        const region = screen.getByRole('status');
        act(() => { announce('Saved'); vi.runAllTimers(); });
        expect(region).toHaveTextContent('Saved');
        act(() => { announce('Saved'); });
        expect(region).toBeEmptyDOMElement();
        act(() => { vi.runAllTimers(); });
        expect(region).toHaveTextContent('Saved');
    });
});
