// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { permissionChipView } from '@webui/utils/permissionChip.core';

import type { PermissionMode } from '@/api/client.types';
import { describeHttpFailure, plainOr, useT } from '@/i18n/useT';
import { Button, ListRow, Notice, Sheet, Stack } from '@/ui';
import { ShieldAlert, ShieldCheck } from '@/ui/icons';

import { ControlChip } from './ControlChip';

export interface PermissionChipProps {
    /** Null while the chat's saved mode is unread. */
    mode: PermissionMode | null;
    /** The read of the saved mode failed. */
    readFailed?: boolean;
    /** Saves the mode; a rejection shows in the menu as an alert. */
    onChange: (mode: PermissionMode) => void | Promise<unknown>;
    /** Reads the saved mode again after a failed save, which may still have been stored. */
    onReread?: () => Promise<unknown>;
    /** A tool question is waiting in this chat: full access starts from the next step. */
    promptWaiting?: boolean;
    disabled?: boolean;
    /** Starts with the menu open (developer gallery). */
    initialOpen?: boolean;
}

/** The chat's permission mode, the TUI's ask or full access. Full access asks once more before it turns on. */
export function PermissionChip({ mode, readFailed = false, onChange, onReread, promptWaiting, disabled, initialOpen = false }: PermissionChipProps) {
    const t = useT();
    const [open, setOpen] = useState(initialOpen);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<{ text: string; detail?: string } | null>(null);
    const view = permissionChipView(mode, readFailed);
    const full = view.state === 'full_access';
    const modes = [
        { mode: 'ask' as const, label: t('perm.ask'), note: t('perm.askNote') },
        { mode: 'full_access' as const, label: t('perm.full'), note: t('perm.fullNote') },
    ];
    const apply = async (next: PermissionMode) => {
        if (next === 'full_access' && !full && !confirming) {
            setConfirming(true);
            return;
        }
        setConfirming(false);
        setError(null);
        try {
            await onChange(next);
            // Keep the menu up so the note about the question already waiting is seen.
            if (!(next === 'full_access' && promptWaiting)) setOpen(false);
        } catch (err) {
            const failed = describeHttpFailure(err, t);
            let message = failed.text;
            if (onReread) {
                try {
                    await onReread();
                } catch (e) {
                    message = `${message} ${plainOr(t, 'perm.rereadFailed', {}, e)}`;
                }
            }
            setError({ text: message, detail: failed.detail });
        }
    };
    return (
        <>
            <ControlChip
                label={t.bare(view.labelKey)}
                icon={view.warning ? ShieldAlert : ShieldCheck}
                chip="permission"
                menu
                warning={view.warning}
                disabled={disabled}
                onPress={() => {
                    setConfirming(false);
                    setError(null);
                    setOpen(true);
                }}
                accessibilityLabel={view.unread ? t('perm.chipAriaUnread', { state: t.bare(view.labelKey) }) : t('perm.chipAria', { mode: t.bare(view.modeKey) })}
                testID="permission-chip"
            />
            <Sheet open={open} onClose={() => setOpen(false)} title={t('env.permission')}>
                <Stack gap="sm">
                    {modes.map((m) => (
                        <ListRow
                            key={m.mode}
                            title={m.label}
                            subtitle={m.note}
                            subtitleLines={3}
                            checked={m.mode === mode}
                            selected={m.mode === mode}
                            onPress={() => void apply(m.mode)}
                            testID={`permission-${m.mode}`}
                        />
                    ))}
                    {confirming ? (
                        <Notice
                            tone="warning"
                            message={t('env.fullAccessWarn')}
                            action={{ label: t('env.turnOn'), onPress: () => void apply('full_access') }}
                            testID="permission-confirm"
                        />
                    ) : null}
                    {full && promptWaiting && !confirming ? <Notice tone="info" role="note" message={t('perm.fullPendingNote')} testID="permission-pending" /> : null}
                    {error ? <Notice tone="danger" message={error.text} detail={error.detail} testID="permission-error" /> : null}
                    <Button variant="secondary" label={t('modelMenu.cancel')} onPress={() => setOpen(false)} testID="permission-cancel" />
                </Stack>
            </Sheet>
        </>
    );
}
