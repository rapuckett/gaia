// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { KeyboardEvents } from 'react-native-keyboard-controller';

import { APPROVAL_ARM_MS } from '@webui/utils/permissionPrompts.core';

const KEYBOARD_MOVES = ['keyboardWillShow', 'keyboardDidShow', 'keyboardWillHide', 'keyboardDidHide'] as const;

export interface ApprovalArm {
    /** True once the answer buttons have sat still for APPROVAL_ARM_MS. */
    armed(): boolean;
    /** The buttons just moved: start the wait again. */
    rearm(): void;
}

/**
 * Holds an approval's taps until its buttons have sat still for APPROVAL_ARM_MS since they mounted, so a tap aimed at
 * what was there before can't answer. With `keyboard`, for a card in the chat's footer, each keyboard event starts the
 * wait again, since the keyboard moves that footer. A ref, not state: a press in the same frame as a move reads it disarmed.
 */
export function useApprovalArm({ keyboard = false }: { keyboard?: boolean } = {}): ApprovalArm {
    const ready = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const rearm = useCallback(() => {
        ready.current = false;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            ready.current = true;
        }, APPROVAL_ARM_MS);
    }, []);
    useEffect(() => {
        rearm();
        const subs = keyboard ? KEYBOARD_MOVES.map((name) => KeyboardEvents.addListener(name, rearm)) : [];
        return () => {
            clearTimeout(timer.current);
            ready.current = false;
            subs.forEach((sub) => sub.remove());
        };
    }, [keyboard, rearm]);
    return useMemo(() => ({ armed: () => ready.current, rearm }), [rearm]);
}
