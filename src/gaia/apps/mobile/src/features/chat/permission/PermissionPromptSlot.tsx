// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useEffect } from 'react';

import { useT } from '@/i18n/useT';
import { Button, Notice, Row, Stack } from '@/ui';

import type { PermissionPromptState } from './usePermissionPrompt';

// Stand-in: swap for Design's PermissionPrompt (./PermissionPrompt) when it lands; it takes these same props.
export function PermissionPromptSlot({ prompt, busy, error, onAnswer, onExpired }: PermissionPromptState) {
    const t = useT();
    const { expiresAt } = prompt;
    useEffect(() => {
        if (expiresAt === undefined) return undefined;
        const timer = setTimeout(onExpired, Math.max(0, expiresAt - Date.now()));
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- onExpired is recreated each render; the deadline is what matters.
    }, [expiresAt]);
    return (
        <Stack paddingX="lg" gap="sm" testID="permission-prompt">
            <Notice tone="warning" title={prompt.title} message={prompt.message} />
            {error ? <Notice tone="danger" message={error} testID="permission-error" /> : null}
            <Row gap="sm">
                <Button label={t('prompt.allowOnce')} variant="primary" busy={busy} disabled={busy} onPress={() => onAnswer('once')} testID="permission-allow" />
                <Button label={t('prompt.deny')} disabled={busy} onPress={() => onAnswer('deny')} testID="permission-deny" />
            </Row>
        </Stack>
    );
}
