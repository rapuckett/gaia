// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useDirection, useT } from '@/i18n/useT';
import { HScroll, Pressable, Row, Stack, Surface, Text } from '@/ui';

import { MEMORY_TABS, type MemoryTabKey } from './tabs';

/** The tabs as pills in a row that scrolls sideways: four labels don't fit a phone at 320 wide, and a segmented control would fall back to a list. */
export function MemoryTabs({ value, onChange }: { value: MemoryTabKey; onChange: (key: MemoryTabKey) => void }) {
    const t = useT();
    const dir = useDirection();
    return (
        <HScroll dir={dir} testID="memory-tabs">
            <Stack paddingX="lg" accessibilityRole="tablist">
                <Row gap="sm">
                    {MEMORY_TABS.map((tab) => {
                        const selected = tab.key === value;
                        return (
                            <Pressable
                                key={tab.key}
                                onPress={() => onChange(tab.key)}
                                accessibilityRole="tab"
                                accessibilityLabel={t(tab.label)}
                                accessibilityState={{ selected }}
                                testID={`memory-tab-${tab.key}`}
                            >
                                <Surface tone={selected ? 'card' : 'primary'} radius="full" border={selected}>
                                    <Stack paddingX="lg" paddingY="sm">
                                        <Text role="label" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'accent' : 'secondary'} numberOfLines={1}>
                                            {t.bare(tab.label)}
                                        </Text>
                                    </Stack>
                                </Surface>
                            </Pressable>
                        );
                    })}
                </Row>
            </Stack>
        </HScroll>
    );
}
