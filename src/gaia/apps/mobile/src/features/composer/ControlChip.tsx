// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon, Pressable, Row, Text } from '@/ui';
import { ChevronDown } from '@/ui/icons';

import { ChipMeasure, useChipCollapsed } from './ChipFitContext';
import type { ChipId } from './chipRoom';

export interface ControlChipProps {
    label: string;
    icon: LucideIcon;
    onPress?: () => void;
    /** A chevron after the label marks a chip that opens a menu. */
    menu?: boolean;
    warning?: boolean;
    /** Which chip this is, so the row can drop its label when space runs out; the model's never goes. */
    chip: ChipId;
    disabled?: boolean;
    accessibilityLabel?: string;
    testID?: string;
}

/** A flat control in the message box's bottom row, as the desktop's composer chips: an icon, a short label and a chevron. */
export function ControlChip({ label, icon, onPress, menu, warning, chip, disabled, accessibilityLabel, testID }: ControlChipProps) {
    const iconOnly = useChipCollapsed(chip);
    const content = (compact: boolean) => (
        <Row gap="xs">
            <Icon icon={icon} size="sm" tone={warning ? 'warning' : 'secondary'} />
            {compact ? null : (
                <View style={{ flexShrink: chip === 'model' ? 1 : 0 }}>
                    <Text role="label" tone={warning ? 'warning' : 'secondary'} numberOfLines={1}>
                        {label}
                    </Text>
                </View>
            )}
            {menu && !compact ? <Icon icon={ChevronDown} size="sm" tone="muted" /> : null}
        </Row>
    );
    return (
        <View style={{ flexShrink: chip === 'model' ? 1 : 0, minWidth: 0 }}>
            <ChipMeasure id={chip}>{content(false)}</ChipMeasure>
            <Pressable
                onPress={onPress}
                disabled={disabled}
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityState={menu ? { expanded: false } : undefined}
                minSize={44}
                testID={testID}
            >
                {content(iconOnly)}
            </Pressable>
        </View>
    );
}
