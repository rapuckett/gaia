// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import type { PermissionMode } from '@/api/client.types';
import { describeError, describeErrorWith, useT } from '@/i18n/useT';
import { Button, Icon, ListRow, Notice, Sheet, Stack } from '@/ui';
import { Check, ShieldAlert, ShieldCheck } from '@/ui/icons';

import { ControlChip } from './ControlChip';

export interface PermissionChipProps {
    mode: PermissionMode;
    /** Saves the mode; a rejection shows in the menu as an alert. */
    onChange: (mode: PermissionMode) => void | Promise<unknown>;
    /** Reads the saved mode again after a failed save, which may still have been stored. */
    onReread?: () => Promise<unknown>;
    /** A tool question is waiting in this chat: full access starts from the next step. */
    promptWaiting?: boolean;
    disabled?: boolean;
}

/** The chat's permission mode, the TUI's ask or full access. Full access asks once more before it turns on. */
export function PermissionChip({ mode, onChange, onReread, promptWaiting, disabled }: PermissionChipProps) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const full = mode === 'full_access';
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
            let message = describeError(err, t);
            if (onReread) {
                try {
                    await onReread();
                } catch (e) {
                    message = `${message} ${t.compose((say) => say('perm.rereadFailed', { error: describeErrorWith(e, say) }))}`;
                }
            }
            setError(message);
        }
    };
    return (
        <>
            <ControlChip
                label={t.bare(full ? 'perm.full' : 'env.ask')}
                icon={full ? ShieldAlert : ShieldCheck}
                chip="permission"
                menu
                warning={full}
                disabled={disabled}
                onPress={() => {
                    setConfirming(false);
                    setError(null);
                    setOpen(true);
                }}
                accessibilityLabel={t('perm.chipAria', { mode: t.bare(full ? 'perm.fullLower' : 'perm.askLower') })}
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
                            leading={m.mode === mode ? <Icon icon={Check} size="sm" tone="accent" /> : undefined}
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
                    {error ? <Notice tone="danger" message={error} testID="permission-error" /> : null}
                    <Button variant="secondary" label={t('modelMenu.cancel')} onPress={() => setOpen(false)} />
                </Stack>
            </Sheet>
        </>
    );
}
