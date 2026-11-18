// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ComponentRef, ReactNode, Ref } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDirection } from '@/i18n/useT';
import { useTheme } from '../theme/ThemeProvider';
import { contentWidth, space } from '../tokens/space';
import { ScreenBannerSlot, useScreenBanner } from './ScreenBanner';

export type ScreenWidth = 'reading' | 'flow' | 'full';

export type ScreenEdge = 'top' | 'bottom' | 'start' | 'end';

export interface ScreenProps {
    children?: ReactNode;
    edges?: ScreenEdge[];
    keyboard?: 'avoid' | 'none';
    scroll?: boolean;
    /** The scrolling body, for a screen that scrolls a child into view. */
    scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
    /** With `scroll`: pulling the body down calls it; `refreshing` shows the spinner. */
    onRefresh?: () => void;
    refreshing?: boolean;
    header?: ReactNode;
    /** Shown above `header`. Unset uses the app's banner (`ScreenBannerProvider`); `null` shows none. */
    banner?: ReactNode | null;
    footer?: ReactNode;
    /** The footer spans the full width, with no gutter; its content pads itself. */
    footerBleed?: boolean;
    /** A hairline above the footer, as the desktop setup bar has. */
    footerDivider?: boolean;
    /** The content column's cap on wide screens: reading (680), flow (560) or full (none). */
    width?: ScreenWidth;
    background?: 'primary' | 'secondary' | 'recessed';
    /** Drawn behind everything else, edge to edge. */
    backdrop?: ReactNode;
    testID?: string;
}

const ALL: ScreenEdge[] = ['top', 'bottom', 'start', 'end'];

export function Screen({
    children,
    edges = ALL,
    keyboard = 'none',
    scroll,
    scrollRef,
    onRefresh,
    refreshing = false,
    header,
    banner,
    footer,
    footerBleed = false,
    footerDivider = false,
    width = 'reading',
    background = 'primary',
    backdrop,
    testID,
}: ScreenProps) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const rtl = useDirection() === 'rtl';
    const keyboardUp = useKeyboardState((s) => s.isVisible);
    const ambientBanner = useScreenBanner();
    const shownBanner = banner === undefined ? ambientBanner : banner;
    const avoid = keyboard === 'avoid';
    const refreshControl = onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined;

    const has = (e: ScreenEdge) => edges.includes(e);
    const startInset = rtl ? insets.right : insets.left;
    const endInset = rtl ? insets.left : insets.right;
    const bg = { primary: colors.bgPrimary, secondary: colors.bgSecondary, recessed: colors.bgRecessed }[background];
    // The keyboard covers the bottom inset, so it applies only while the keyboard is down.
    const bottom = has('bottom') && !(avoid && keyboardUp) ? insets.bottom : 0;

    const cap = width === 'full' ? undefined : contentWidth[width];
    const column = (node: ReactNode) => (
        <View
            testID="screen-content"
            // Without scrolling, the column shrinks to the screen so a list inside it scrolls instead of spilling under the footer.
            style={[{ flexGrow: 1, flexShrink: scroll ? 0 : 1, width: '100%', alignSelf: 'center' }, cap ? { maxWidth: cap } : undefined]}
            // @ts-expect-error dataSet is a react-native-web prop, absent from the native View types
            dataSet={{ contentWidth: cap ? String(cap) : 'full' }}
        >
            {node}
        </View>
    );

    const body = scroll ? (
        avoid ? (
            <KeyboardAwareScrollView
                ref={scrollRef as never}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                bottomOffset={16}
                refreshControl={refreshControl}
            >
                {column(children)}
            </KeyboardAwareScrollView>
        ) : (
            <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={refreshControl}
            >
                {column(children)}
            </ScrollView>
        )
    ) : (
        <View style={{ flex: 1 }}>{column(children)}</View>
    );

    const content = (
        <>
            {shownBanner ? <ScreenBannerSlot banner={shownBanner} cap={cap} /> : null}
            {header}
            {body}
            {footer ? (
                <View testID="screen-footer" style={[
                        footerBleed ? undefined : { paddingHorizontal: space.gutter, paddingVertical: footerDivider ? space.md : space.sm },
                        footerDivider ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined,
                    ]}>
                    <View style={[{ width: '100%', alignSelf: 'center' }, cap ? { maxWidth: cap } : undefined]}>{footer}</View>
                </View>
            ) : null}
        </>
    );

    return (
        <View
            testID={testID}
            style={{
                flex: 1,
                backgroundColor: bg,
                paddingTop: has('top') ? insets.top : 0,
                paddingBottom: bottom,
                paddingStart: has('start') ? startInset : 0,
                paddingEnd: has('end') ? endInset : 0,
            }}
        >
            {backdrop}
            {avoid ? (
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                    {content}
                </KeyboardAvoidingView>
            ) : (
                content
            )}
        </View>
    );
}
