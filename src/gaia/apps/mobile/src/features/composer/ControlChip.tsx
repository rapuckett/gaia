// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LucideIcon } from 'lucide-react-native';
import { createContext, useContext } from 'react';
import { View } from 'react-native';

import { Icon, Pressable, Row, Text } from '@/ui';
import { ChevronDown } from '@/ui/icons';

/** True when the composer's chip row is too narrow for labels: chips then show their icon alone. */
export const CompactChipsContext = createContext(false);

export interface ControlChipProps {
    label: string;
    icon: LucideIcon;
    onPress?: () => void;
    /** A chevron after the label marks a chip that opens a menu. */
    menu?: boolean;
    warning?: boolean;
    /** Keep the label when the row is compact; the model's name is what the chip is for. */
    keepLabel?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
    testID?: string;
}

/** A flat control in the message box's bottom row, as the desktop's composer chips: an icon, a short label and a chevron. */
export function ControlChip({ label, icon, onPress, menu, warning, keepLabel, disabled, accessibilityLabel, testID }: ControlChipProps) {
    const iconOnly = useContext(CompactChipsContext) && !keepLabel;
    return (
        <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Pressable
                onPress={onPress}
                disabled={disabled}
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityState={menu ? { expanded: false } : undefined}
                minSize={44}
                testID={testID}
            >
                <Row gap="xs">
                    <Icon icon={icon} size="sm" tone={warning ? 'warning' : 'secondary'} />
                    {iconOnly ? null : (
                        <View style={{ flexShrink: 1 }}>
                            <Text role="label" tone={warning ? 'warning' : 'secondary'} numberOfLines={1}>
                                {label}
                            </Text>
                        </View>
                    )}
                    {menu && !iconOnly ? <Icon icon={ChevronDown} size="sm" tone="muted" /> : null}
                </Row>
            </Pressable>
        </View>
    );
}
