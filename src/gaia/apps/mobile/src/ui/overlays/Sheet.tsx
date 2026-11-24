// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useId, type ReactNode } from 'react';
import { useParentSheet, useSheetScope } from './SheetHost';
import { sheetStore } from './sheetStore';

export interface SheetProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    children?: ReactNode;
    footer?: ReactNode;
    /** Whether the handle, the scrim, Android back and the escape gesture close it. Default true. */
    dismissible?: boolean;
    scrollTestID?: string;
    scrollToEnd?: boolean;
}

// Renders nothing in place: the content shows in the SheetHost, one sheet at a time, except that a sheet opened from inside another shows over it.
export function Sheet({ open, onClose, title, children, footer, dismissible = true, scrollTestID, scrollToEnd }: SheetProps) {
    const id = useId();
    const scope = useSheetScope();
    const parent = useParentSheet();
    useEffect(() => {
        if (open) sheetStore.present({ id, open: true, onClose, title, children, footer, dismissible, scrollTestID, scrollToEnd, scope, parent });
        else sheetStore.release(id);
    });
    useEffect(() => () => sheetStore.release(id), [id]);
    return null;
}
