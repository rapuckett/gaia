// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../controls/Icon';
import { Pressable } from '../controls/Pressable';
import { ChevronDown, ChevronRight } from '../icons';
import { Row } from '../layout/layout';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from '../text/Text';

export interface DisclosureProps {
    title: string;
    open: boolean;
    onToggle: () => void;
    children?: ReactNode;
    trailing?: ReactNode;
    testID?: string;
}

export function Disclosure({ title, open, onToggle, children, trailing, testID }: DisclosureProps) {
    const { space } = useTheme();
    return (
        <View testID={testID}>
            <Pressable onPress={onToggle} accessibilityLabel={title} accessibilityState={{ expanded: open }}>
                <Row gap="sm">
                    <Icon icon={open ? ChevronDown : ChevronRight} size="sm" tone="muted" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text role="label" weight="medium" tone="secondary" numberOfLines={1}>
                            {title}
                        </Text>
                    </View>
                    {trailing}
                </Row>
            </Pressable>
            {open ? <View style={{ paddingStart: space.xl, paddingBottom: space.sm }}>{children}</View> : null}
        </View>
    );
}
