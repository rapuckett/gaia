// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import {
    Children,
    Fragment,
    cloneElement,
    createContext,
    isValidElement,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactElement,
    type ReactNode,
} from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { Button, Row, Stack, type ButtonProps } from '@/ui';
import { useLargeText } from '@/ui/theme/a11y';

type Register = (content: ReactNode) => void;

// Two contexts, so a step that registers its actions never re-renders from its own registration.
const Setter = createContext<Register | undefined>(undefined);
const Content = createContext<ReactNode>(null);

/** Owns the bar at the bottom of setup; the screen docks `<SetupFooterBar />` in its footer. */
export function SetupFooterProvider({ children }: { children: ReactNode }) {
    const [content, setContent] = useState<ReactNode>(null);
    return (
        <Setter.Provider value={setContent}>
            <Content.Provider value={content}>{children}</Content.Provider>
        </Setter.Provider>
    );
}

function actionsOf(children: ReactNode): ReactNode[] {
    return Children.toArray(children).flatMap((child) =>
        isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? actionsOf(child.props.children) : [child],
    );
}

function filled(action: ReactNode): ReactNode {
    return isValidElement(action) && action.type === Button
        ? cloneElement(action as ReactElement<ButtonProps>, { full: true, wrap: true })
        : action;
}

/** A step's empty `<Row />` holds the main action at the end of a shared row; stacked it would be a blank slot. */
function isSpacer(action: ReactNode): boolean {
    return isValidElement<{ children?: ReactNode }>(action) && action.type === Row && Children.count(action.props.children) === 0;
}

const UNEVEN_RATIO = 1.5;

function labelKey(actions: ReactNode[]): string {
    return actions.map((a) => (isValidElement<{ label?: string }>(a) ? (a.props.label ?? '') : '')).join('|');
}

/** Up to two actions share the row equally, so long labels wrap rather than spill; more, any at large text sizes, or two of very uneven height, stack full width. */
function FooterActions({ children }: { children: ReactNode }) {
    const largeText = useLargeText();
    const actions = actionsOf(children);
    const key = labelKey(actions);
    // Latched per key so a stacked footer never flips back to a row.
    const [unevenKey, setUnevenKey] = useState<string | null>(null);
    const heights = useRef<number[]>([]);
    const measure = (i: number) => (e: LayoutChangeEvent) => {
        heights.current[i] = e.nativeEvent.layout.height;
        const [a, b] = heights.current;
        if (a === undefined || b === undefined || Math.min(a, b) <= 0) return;
        if (Math.max(a, b) / Math.min(a, b) > UNEVEN_RATIO) setUnevenKey(key);
    };
    if (largeText || (actions.length === 2 && unevenKey === key && !actions.some(isSpacer))) {
        return <Stack gap="sm">{actions.filter((a) => !isSpacer(a)).map(filled)}</Stack>;
    }
    if (actions.length > 2) return <Stack gap="sm">{actions.map(filled)}</Stack>;
    const measurable = actions.length === 2 && !actions.some(isSpacer);
    return (
        <Row gap="sm">
            {actions.map((action, i) => (
                <View key={i} testID="setup-footer-slot" style={{ flex: 1, minWidth: 0 }} onLayout={measurable ? measure(i) : undefined}>
                    {filled(action)}
                </View>
            ))}
        </Row>
    );
}

/** The bar itself: Back at the start and the step's main action at the end; empty until a step fills it. */
export function SetupFooterBar() {
    const content = useContext(Content);
    if (content == null) return null;
    return <FooterActions>{content}</FooterActions>;
}

/**
 * A step's actions, in the same place on every step. Outside setup nothing receives them,
 * so they render in place, as the web UI's `SetupFooter` does for Settings.
 */
export function SetupFooter({ children }: { children: ReactNode }) {
    const register = useContext(Setter);
    useEffect(() => {
        if (!register) return undefined;
        register(children);
        return () => register(null);
    }, [register, children]);
    if (!register) return <FooterActions>{children}</FooterActions>;
    return null;
}

const discard: Register = () => undefined;

/** While `muted`, the actions of the step inside go nowhere: for a step kept mounted under another screen. */
export function SetupFooterMuted({ muted, children }: { muted: boolean; children: ReactNode }) {
    const register = useContext(Setter);
    return <Setter.Provider value={muted ? discard : register}>{children}</Setter.Provider>;
}
