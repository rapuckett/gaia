// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { View } from 'react-native';
import Animated, { FadeInDown, FadeOut, FadeOutDown, useReducedMotion } from 'react-native-reanimated';

import { useT } from '@/i18n/useT';
import { IconButton, PRESSABLE_MIN_SIZE } from '@/ui';
import { ArrowDown } from '@/ui/icons';

/** Gap between the button's hit area and the bottom edge of the list's visible area. */
export const JUMP_EDGE_GAP = 8;
/** Room the button needs: its hit area, the gap below it and as much above it. */
export const JUMP_MIN_AREA = PRESSABLE_MIN_SIZE + 2 * JUMP_EDGE_GAP;

/** Where the button's top sits in a list area `areaHeight` tall, or null when the area is too short to hold it. */
export function jumpButtonTop(areaHeight: number): number | null {
    return areaHeight < JUMP_MIN_AREA ? null : areaHeight - JUMP_EDGE_GAP - PRESSABLE_MIN_SIZE;
}

/** Slides and fades in and out; under reduced motion it appears at once and fades out. */
export function JumpButton({ visible, onPress, areaHeight }: { visible: boolean; onPress: () => void; areaHeight: number }) {
    const t = useT();
    // No entering under reduced motion: its single frame can be dropped on Android (Reanimated 4.7.1), leaving the view at opacity 0.
    const reduced = useReducedMotion();
    const top = jumpButtonTop(areaHeight);
    return (
        <View pointerEvents="box-none" style={{ position: 'absolute', start: 0, end: 0, top: top ?? 0, alignItems: 'center' }}>
            {visible && top !== null ? (
                <Animated.View entering={reduced ? undefined : FadeInDown} exiting={reduced ? FadeOut : FadeOutDown}>
                    <IconButton icon={ArrowDown} label={t('chat.scrollBottom')} variant="filled" onPress={onPress} testID="jump-to-bottom" />
                </Animated.View>
            ) : null}
        </View>
    );
}
