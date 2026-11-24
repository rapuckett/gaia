// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';
import { useT } from '@/i18n/useT';
import { ArrowLeft, ChevronLeft } from '../icons';
import { IconButton } from './IconButton';

export interface UpButtonProps {
    onPress?: () => void;
    /** A specific label, such as "Back to Settings". Defaults to the platform's own. */
    label?: string;
    testID?: string;
}

/** The top bar's up control: a chevron on iOS, an arrow elsewhere. Icon mirrors in RTL. */
export function UpButton({ onPress, label, testID }: UpButtonProps) {
    const t = useT();
    const ios = Platform.OS === 'ios';
    return (
        <IconButton
            icon={ios ? ChevronLeft : ArrowLeft}
            label={label ?? t(ios ? 'mobileApp.nav.back' : 'mobileApp.nav.up')}
            onPress={onPress}
            testID={testID}
        />
    );
}
