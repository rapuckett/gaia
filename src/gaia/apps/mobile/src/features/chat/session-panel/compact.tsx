// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, Pressable, Row, Stack, Text, useTheme } from '@/ui';
import type { LucideIcon } from '@/ui/icons';

/** The panel's one-line rows are this tall. */
export const COMPACT_ROW = 32;

interface CompactRowProps {
    icon: LucideIcon;
    /** What the row says, as the screen reader reads it when the row holds no control, e.g. "Runs on: Your PC". */
    accessibilityLabel?: string;
    /** The row holds controls, so each is its own stop and the row is not read as one. */
    interactive?: boolean;
    children: ReactNode;
    /** Sits at the end of the line: a quiet value or a control. */
    end?: ReactNode;
    /** Anything that needs the full width: a warning, a confirmation, an error. */
    below?: ReactNode;
    testID?: string;
}

/** One line in the desktop panel's style: icon, text, and a value or control at the end. */
export function CompactRow({ icon, accessibilityLabel, interactive, children, end, below, testID }: CompactRowProps) {
    const line = (
        <Row gap="md">
            <Icon icon={icon} size="sm" tone="muted" />
            <Stack flex={1}>{children}</Stack>
            {end}
        </Row>
    );
    return (
        <Stack testID={testID}>
            <Stack minHeight={COMPACT_ROW} justify="center" accessibilityLabel={interactive ? undefined : accessibilityLabel}>
                {line}
            </Stack>
            {below}
        </Stack>
    );
}

/** A row's label, in the panel's small muted text. */
export function RowText({ children, tone = 'secondary', accessibilityLabel }: { children: ReactNode; tone?: 'secondary' | 'muted'; accessibilityLabel?: string }) {
    return (
        <Text role="label" tone={tone} numberOfLines={1} accessibilityLabel={accessibilityLabel}>
            {children}
        </Text>
    );
}

interface MiniSwitchProps {
    value: boolean;
    onValueChange: (value: boolean) => void;
    label: string;
    disabled?: boolean;
    testID?: string;
}

const TRACK_W = 34;
const TRACK_H = 20;
const KNOB = 14;
const INSET = (TRACK_H - KNOB) / 2;

/** The desktop panel's small switch; the touch target stays 44 pt through hit slop. */
export function MiniSwitch({ value, onValueChange, label, disabled, testID }: MiniSwitchProps) {
    const { colors, radius } = useTheme();
    return (
        <Pressable
            onPress={() => onValueChange(!value)}
            disabled={disabled}
            accessibilityRole="switch"
            accessibilityLabel={label}
            aria-checked={value}
            inline
            hugHeight
            minSize={44}
            testID={testID}
        >
            <View
                style={{
                    width: TRACK_W,
                    height: TRACK_H,
                    borderRadius: radius.full,
                    backgroundColor: value ? colors.accentSolid : colors.border,
                    justifyContent: 'center',
                    alignItems: value ? 'flex-end' : 'flex-start',
                    paddingHorizontal: INSET,
                }}
            >
                <View style={{ width: KNOB, height: KNOB, borderRadius: radius.full, backgroundColor: colors.switchKnob }} />
            </View>
        </Pressable>
    );
}

interface InlineSegmentProps {
    options: { value: string; label: string; accessibilityLabel: string }[];
    value: string;
    onChange: (value: string) => void;
    accessibilityLabel: string;
    testID?: string;
}

/** The desktop's small two-way pill (Ask | Full access), sized to its words. */
export function InlineSegment({ options, value, onChange, accessibilityLabel, testID }: InlineSegmentProps) {
    const { colors, radius } = useTheme();
    return (
        <View
            accessibilityRole="radiogroup"
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            style={{ flexDirection: 'row', direction: 'ltr', padding: 2, borderRadius: radius.full, backgroundColor: colors.bgActive }}
        >
            {options.map((o) => {
                const on = o.value === value;
                return (
                    <Pressable
                        key={o.value}
                        onPress={() => onChange(o.value)}
                        accessibilityRole="radio"
                        accessibilityLabel={o.accessibilityLabel}
                        aria-checked={on}
                        inline
                        hugHeight
                        minSize={44}
                    >
                        <View
                            style={{
                                paddingHorizontal: 10,
                                height: 24,
                                justifyContent: 'center',
                                borderRadius: radius.full,
                                backgroundColor: on ? colors.bgCard : 'transparent',
                                borderWidth: on ? 1 : 0,
                                borderColor: colors.border,
                            }}
                        >
                            <Text role="caption" weight={on ? 'semibold' : 'medium'} tone={on ? 'primary' : 'secondary'} numberOfLines={1} compact>
                                {o.label}
                            </Text>
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}
