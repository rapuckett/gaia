// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { isolate, isolateUnit } from '@webui/i18n/registry';

import { Icon, Pressable, Row, Text, useTheme } from '@/ui';
import { ChevronDown } from '@/ui/icons';
import { a11yVisibility } from '@/ui/theme/a11y';

import { ChipMeasure, useChipCollapsed } from './ChipFitContext';
import { ICON_ONLY_WIDTH, MODEL_FLOOR_WIDTH, type ChipId } from './chipRoom';

export interface ControlChipProps {
    label: string;
    icon: LucideIcon;
    onPress?: () => void;
    /** A chevron after the label marks a chip that opens a menu. */
    menu?: boolean;
    warning?: boolean;
    /** A setting that is on: the accent-dim fill and accent glyph of the desktop's `is-on` chip. */
    active?: boolean;
    /** `active` is a switch's on state, not a menu's: read as a switch that is on or off. */
    toggle?: boolean;
    /** Which chip this is, so the row can drop its label when space runs out; the model's never goes. */
    chip: ChipId;
    /** The label is a value, not UI copy: a model id stays `ltr`, a folder name follows its own script (`auto`). */
    value?: 'ltr' | 'auto';
    disabled?: boolean;
    /** Where the model runs ("Local" or the provider), after its name when the row has room: "Gemma 4 E4B · Local". */
    place?: string | null;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    testID?: string;
}

const MODEL_CHIP_MIN = 44;

/** A flat control in the message box's bottom row, as the desktop's composer chips: an icon, a short label and a chevron. */
export function ControlChip({ label, icon, onPress, menu, warning, active, toggle, chip, disabled, place, accessibilityLabel, accessibilityHint, testID, value }: ControlChipProps) {
    const { colors, radius } = useTheme();
    const tone = warning ? 'warning' : active ? 'accent' : 'secondary';
    const collapsed = useChipCollapsed(chip);
    const placeHidden = useChipCollapsed('place');
    const [modelWidth, setModelWidth] = useState<number | null>(null);
    // Below the floor the model shows icon and chevron, never a sliver of its name.
    const belowFloor = chip === 'model' && modelWidth !== null && modelWidth < MODEL_FLOOR_WIDTH;
    const iconOnly = collapsed || belowFloor;
    // One line, so an ellipsis cuts the place before the name; each stays one island in Arabic.
    const text = (placed: boolean) => (placed && place ? [value === 'ltr' ? isolate(label, 'ltr') : label, isolateUnit(place)].join(' · ') : label);
    const faceOf = (face: ReactNode) =>
        active ? (
            <View style={{ backgroundColor: colors.accentDim, borderRadius: radius.md, paddingHorizontal: 6, marginHorizontal: -6, paddingVertical: 4 }}>{face}</View>
        ) : (
            face
        );
    const content = (compact: boolean, placed = false) => (
        <Row gap="xs">
            <View style={{ flexShrink: 0 }}>
                <Icon icon={icon} size="sm" tone={tone} />
            </View>
            {compact ? null : (
                <View style={{ flexShrink: chip === 'model' ? 1 : 0 }}>
                    <Text role="label" tone={tone} numberOfLines={1} compact dir={placed && place ? undefined : value}>
                        {text(placed)}
                    </Text>
                </View>
            )}
            {menu && !(compact && !belowFloor) ? (
                <View style={{ flexShrink: 0 }}>
                    <Icon icon={ChevronDown} size="sm" tone="muted" />
                </View>
            ) : null}
        </Row>
    );
    return (
        <View
            style={{ flexShrink: chip === 'model' ? 1 : 0, minWidth: chip === 'model' ? MODEL_CHIP_MIN : 0, maxWidth: '100%' }}
            onLayout={chip === 'model' ? (e) => setModelWidth(e.nativeEvent.layout.width) : undefined}
        >
            <ChipMeasure id={chip}>{content(false)}</ChipMeasure>
            {place ? <ChipMeasure id="place">{content(false, true)}</ChipMeasure> : null}
            {belowFloor ? (
                // Keeps the box sized by the full chip, so it widens again when the row has room.
                <View
                    {...a11yVisibility({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' })}
                    pointerEvents="none"
                    style={{ height: 0, overflow: 'hidden' }}
                >
                    {content(false)}
                </View>
            ) : null}
            <Pressable
                accessibilityRole={toggle ? 'switch' : undefined}
                aria-checked={toggle ? !!active : undefined}
                onPress={onPress}
                disabled={disabled}
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityHint={accessibilityHint}
                aria-expanded={menu ? false : undefined}
                aria-haspopup={menu ? 'menu' : undefined}
                minSize={44}
                inline={collapsed}
                testID={testID}
            >
                {faceOf(
                    collapsed ? (
                        // Narrower than its touch target, which hit slop keeps at 44: the room goes to the model's name.
                        <View style={{ width: ICON_ONLY_WIDTH, alignItems: 'center' }}>{content(true)}</View>
                    ) : (
                        content(iconOnly, !placeHidden)
                    ),
                )}
            </Pressable>
        </View>
    );
}
