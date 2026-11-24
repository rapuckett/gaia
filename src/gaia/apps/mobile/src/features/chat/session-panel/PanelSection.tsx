// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Pressable, Row, Text, useSheetScroll, useTheme, type Tone } from '@/ui';
import { ChevronDown, ChevronRight } from '@/ui/icons';

import { useSessionPanelStore, type PanelSectionId } from './panelStore';

export interface PanelSectionProps {
    id: PanelSectionId;
    title: string;
    /** One line at the end of the header, shown open or closed, as the desktop panel does. */
    summary?: string | null;
    summaryTone?: Tone;
    /** A hairline above the section; the first section and the Details group go without. */
    divider?: boolean;
    children: ReactNode;
}

/**
 * A collapsible section of the session panel, shaped like the desktop's: a small muted title, the chevron after it,
 * the summary at the far end. The body mounts only while open, so a collapsed section fetches nothing.
 */
export function PanelSection({ id, title, summary, summaryTone = 'muted', divider = true, children }: PanelSectionProps) {
    const { colors, space } = useTheme();
    const open = useSessionPanelStore((s) => s.sections[id]);
    const setSection = useSessionPanelStore((s) => s.setSection);
    const request = useSessionPanelStore((s) => (s.scrollRequest?.id === id ? s.scrollRequest.seq : 0));
    const sheet = useSheetScroll();
    const box = useRef<ComponentRef<typeof View>>(null);
    useEffect(() => {
        if (request > 0) sheet?.scrollTo(box.current);
    }, [request, sheet]);
    return (
        <View
            ref={box}
            collapsable={false}
            testID={`panel-section-${id}`}
            style={divider ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, paddingTop: space.xs } : undefined}
        >
            <Pressable
                onPress={() => setSection(id, !open)}
                accessibilityLabel={title}
                accessibilityValue={summary ? { text: summary } : undefined}
                aria-expanded={open}
                minSize={40}
                testID={`panel-section-${id}-toggle`}
            >
                <Row gap="sm">
                    <Text role="label" weight="medium" tone="muted" dir="auto">
                        {title}
                    </Text>
                    <Icon icon={open ? ChevronDown : ChevronRight} size="sm" tone="muted" />
                    <View style={{ flex: 1 }} />
                    {summary ? (
                        <Text role="caption" tone={summaryTone} numberOfLines={1}>
                            {summary}
                        </Text>
                    ) : null}
                </Row>
            </Pressable>
            {open ? <View style={{ paddingTop: space.xs, paddingBottom: space.md }}>{children}</View> : null}
        </View>
    );
}
