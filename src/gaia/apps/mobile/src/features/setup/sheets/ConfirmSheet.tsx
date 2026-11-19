// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { Button, Sheet, Stack, Text } from '@/ui';

import type { ConfirmRequest } from './setupConfirm';

export interface ConfirmSheetProps {
    open: boolean;
    title: string;
    body?: string[];
    note?: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    danger?: boolean;
    busy?: boolean;
}

/** Asks before something costly: one full-width button per line, so a long bracketed label wraps instead of widening the sheet. The action sits on top and Cancel nearest the thumb; the scrim, back and swipe all cancel. */
export function ConfirmSheet({ open, title, body = [], note, confirmLabel, cancelLabel, onConfirm, onCancel, danger, busy }: ConfirmSheetProps) {
    return (
        <Sheet
            open={open}
            onClose={busy ? () => undefined : onCancel}
            title={title}
            dismissible={!busy}
            footer={
                <Stack gap="sm">
                    <Button label={confirmLabel} variant={danger ? 'danger' : 'primary'} full wrap busy={busy} onPress={onConfirm} testID="confirm-ok" />
                    <Button label={cancelLabel} variant="secondary" full wrap disabled={busy} onPress={onCancel} testID="confirm-cancel" />
                </Stack>
            }
        >
            <Stack gap="sm">
                {body.map((line, i) => (
                    <Text key={i} role="body" tone="secondary">
                        {line}
                    </Text>
                ))}
                {note ? (
                    <Text role="caption" tone="muted">
                        {note}
                    </Text>
                ) : null}
            </Stack>
        </Sheet>
    );
}

interface Pending {
    request: ConfirmRequest;
    resolve: (confirmed: boolean) => void;
}

/** Holds one question at a time; a new one answers the old one "no". Exported for the tests. */
export function createConfirmBroker(onChange: (pending: Pending | null) => void) {
    let current: Pending | null = null;
    return {
        ask(request: ConfirmRequest): Promise<boolean> {
            current?.resolve(false);
            return new Promise<boolean>((resolve) => {
                current = { request, resolve };
                onChange(current);
            });
        },
        settle(confirmed: boolean) {
            const done = current;
            current = null;
            onChange(null);
            done?.resolve(confirmed);
        },
    };
}

/**
 * A step's way to ask: `const { ask, sheet } = useConfirmSheet()`, render `{sheet}` once, then
 * `if (await ask(lowDiskRequest(short, t))) retryWithAcknowledgement()`. Resolves true on the
 * confirm button, false on Cancel, the scrim, back or swipe, and when the step unmounts.
 */
export function useConfirmSheet(): { ask: (request: ConfirmRequest) => Promise<boolean>; sheet: ReactNode } {
    // The last request stays in `shown` while the sheet slides out.
    const [shown, setShown] = useState<ConfirmRequest | null>(null);
    const [open, setOpen] = useState(false);
    const [b] = useState(() =>
        createConfirmBroker((pending) => {
            setOpen(pending != null);
            if (pending) setShown(pending.request);
        }),
    );
    useEffect(() => () => b.settle(false), [b]);

    const ask = useCallback((request: ConfirmRequest) => b.ask(request), [b]);
    const sheet = shown ? (
        <ConfirmSheet
            open={open}
            title={shown.title}
            body={shown.body}
            note={shown.note}
            confirmLabel={shown.confirmLabel}
            cancelLabel={shown.cancelLabel}
            danger={shown.danger}
            onConfirm={() => b.settle(true)}
            onCancel={() => b.settle(false)}
        />
    ) : null;
    return { ask, sheet };
}
