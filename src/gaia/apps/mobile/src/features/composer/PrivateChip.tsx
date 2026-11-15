// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';

import { useT } from '@/i18n/useT';
import { Eye, EyeOff } from '@/ui/icons';

import { ControlChip } from './ControlChip';

export interface PrivateChipProps {
    on: boolean;
    onChange: (on: boolean) => void;
    disabled?: boolean;
    /** The PC's memory setting; null while it is read or when it couldn't be. */
    memoryEnabled?: boolean | null;
    /** The memory setting couldn't be read. */
    memoryUnreadable?: boolean;
}

/** New-chat toggle: the chat is created private, so not even its first message is remembered. */
export function PrivateChip({ on, onChange, disabled, memoryEnabled = null, memoryUnreadable = false }: PrivateChipProps) {
    const t = useT();
    // A hidden Private choice would make the next chat private for good, unseen.
    useEffect(() => {
        if (memoryEnabled === false && on) onChange(false);
    }, [memoryEnabled, on, onChange]);

    if (memoryEnabled === false) {
        return (
            <ControlChip
                label={t.bare('composer.memoryOff')}
                icon={EyeOff}
                chip="private"
                warning={false}
                disabled
                accessibilityLabel={t('composer.memoryOff')}
                accessibilityHint={t('composer.memoryOffTitle')}
                testID="private-chip"
            />
        );
    }
    return (
        <ControlChip
            label={t.bare(on ? 'composer.private' : memoryUnreadable ? 'composer.memoryUnknown' : 'composer.memoryOn')}
            icon={on ? EyeOff : Eye}
            chip="private"
            warning={false}
            disabled={disabled}
            onPress={() => onChange(!on)}
            accessibilityLabel={on ? t('composer.privateOff') : t('composer.privateOn')}
            accessibilityHint={on ? t('composer.privateOffTitle') : memoryUnreadable ? t('composer.memoryUnknownTitle') : t('composer.privateOnTitle')}
            testID="private-chip"
        />
    );
}
