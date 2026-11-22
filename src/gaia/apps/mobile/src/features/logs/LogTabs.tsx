// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';

import { LOG_SOURCES, type LogSource } from '@/data';
import { useDirection, useT } from '@/i18n/useT';
import { Divider, Pressable, Row, Stack, Text, type Tone } from '@/ui';

import { SOURCE_LABELS } from './LogView';

const EDGE = 16;

/** The Memory tab strip's pattern: one underlined row that scrolls sideways, keeping the picked tab in view. */
export function LogTabs({ value, onChange }: { value: LogSource; onChange: (source: LogSource) => void }) {
    const t = useT();
    const rtl = useDirection() === 'rtl';
    const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
    const spots = useRef<Partial<Record<LogSource, { x: number; width: number }>>>({});
    const [content, setContent] = useState(0);
    const [view, setView] = useState(0);

    useEffect(() => {
        const spot = spots.current[value];
        if (!spot || !content || !view) return;
        // Offsets count from the start edge; a tab's x counts from the left.
        const fromStart = rtl ? content - (spot.x + spot.width) : spot.x;
        const max = Math.max(0, content - view);
        const x = Math.min(max, Math.max(0, fromStart - EDGE));
        scroller.current?.scrollTo({ x, animated: false });
    }, [value, rtl, content, view]);

    return (
        <Stack gap="none">
            <ScrollView
                ref={scroller}
                horizontal
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                onLayout={(e) => setView(e.nativeEvent.layout.width)}
                onContentSizeChange={(w) => setContent(w)}
                testID="log-tabs"
            >
                <Stack paddingX="gutter" accessibilityRole="tablist">
                    <Row>
                        {LOG_SOURCES.map((id) => {
                            const selected = id === value;
                            const tone: Tone = selected ? 'primary' : 'muted';
                            return (
                                <Pressable
                                    key={id}
                                    onPress={() => onChange(id)}
                                    accessibilityRole="tab"
                                    accessibilityLabel={t(SOURCE_LABELS[id])}
                                    aria-selected={selected}
                                    testID={`log-tabs-${id}`}
                                >
                                    <View
                                        onLayout={(e) => {
                                            spots.current[id] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
                                        }}
                                    >
                                        <Stack paddingX="md" paddingY="md">
                                            <Text role="label" weight="medium" tone={tone} numberOfLines={1} compact>
                                                {t.bare(SOURCE_LABELS[id])}
                                            </Text>
                                        </Stack>
                                        <Divider line={selected ? 'accent' : 'clear'} />
                                    </View>
                                </Pressable>
                            );
                        })}
                    </Row>
                </Stack>
            </ScrollView>
            <Divider />
        </Stack>
    );
}
