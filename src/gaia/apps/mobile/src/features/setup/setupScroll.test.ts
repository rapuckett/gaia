// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { RefObject } from 'react';

import { scrollNodeToTop } from './setupScroll';

describe('scrollNodeToTop', () => {
    const scroller = (scrollTo: jest.Mock) => ({ current: { scrollTo, getInnerViewRef: () => ({}) } }) as unknown as RefObject<never>;

    it("scrolls to the node's offset in the content, less a gap", () => {
        const scrollTo = jest.fn();
        const node = { measureLayout: (_inner: unknown, done: (x: number, y: number) => void) => done(0, 640) };
        expect(scrollNodeToTop(scroller(scrollTo), node as never)).toBe(true);
        expect(scrollTo).toHaveBeenCalledWith({ y: 624, animated: true });
    });

    it('does nothing until both the scroller and the node exist', () => {
        const scrollTo = jest.fn();
        expect(scrollNodeToTop(scroller(scrollTo), null)).toBe(false);
        expect(scrollNodeToTop(null, {} as never)).toBe(false);
        expect(scrollTo).not.toHaveBeenCalled();
    });
});
