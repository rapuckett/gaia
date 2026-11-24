// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import { useT } from '@/i18n/useT';
import { Button, Icon, ListRow, Sheet, Stack } from '@/ui';
import { Check, Eye, EyeOff } from '@/ui/icons';

import { ControlChip } from './ControlChip';

export interface PrivateChipProps {
    on: boolean;
    onChange: (on: boolean) => void;
    disabled?: boolean;
    /** The PC's memory setting; null while it is read or when it couldn't be. */
    memoryEnabled?: boolean | null;
    /** The memory setting couldn't be read. */
    memoryUnreadable?: boolean;
    /** Starts with the menu open (developer gallery). */
    initialOpen?: boolean;
}

/** New-chat memory choice: remember the chat, or create it private so not even its first message is remembered. */
export function PrivateChip({ on, onChange, disabled, memoryEnabled = null, memoryUnreadable = false, initialOpen = false }: PrivateChipProps) {
    const t = useT();
    const [open, setOpen] = useState(initialOpen);
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
    const state = on ? 'composer.private' : memoryUnreadable ? 'composer.memoryUnknown' : 'composer.memoryOn';
    const options = [
        { priv: false, label: t('composer.remember'), note: memoryUnreadable ? t('composer.memoryUnknownTitle') : t('composer.rememberNote') },
        { priv: true, label: t('composer.privateChat'), note: t('composer.privateChatNote') },
    ];
    return (
        <>
            <ControlChip
                label={t.bare(state)}
                icon={on ? EyeOff : Eye}
                chip="private"
                menu
                warning={false}
                disabled={disabled}
                onPress={() => setOpen(true)}
                accessibilityLabel={t('composer.memoryChipAria', { state: t.bare(state) })}
                testID="private-chip"
            />
            <Sheet open={open} onClose={() => setOpen(false)} title={t('composer.memoryMenu')}>
                <Stack gap="sm">
                    {options.map((o) => (
                        <ListRow
                            key={String(o.priv)}
                            title={o.label}
                            subtitle={o.note}
                            subtitleLines={3}
                            leading={o.priv === on ? <Icon icon={Check} size="sm" tone="accent" /> : undefined}
                            selected={o.priv === on}
                            onPress={() => {
                                onChange(o.priv);
                                setOpen(false);
                            }}
                            testID={o.priv ? 'private-choice-private' : 'private-choice-remember'}
                        />
                    ))}
                    <Button variant="secondary" label={t('modelMenu.cancel')} onPress={() => setOpen(false)} />
                </Stack>
            </Sheet>
        </>
    );
}
