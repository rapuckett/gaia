// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '@/i18n/useT';
import { Notice } from '@/ui';

import { useDevicePrompt, type DevicePromptKind } from './devicePrompts';

export interface ApproveOnPcNoticeProps {
    kind: DevicePromptKind;
    action: string;
    /** Sends the original action again; the notice goes back to waiting. */
    onRetry: () => void;
}

/**
 * What stands in for an action's button while its prompt is up on the PC, and the way out when
 * it isn't answered. Shows nothing when there is no prompt or it was approved: the card then
 * shows the action's own success state. Callers hide their button on `useDevicePrompt(...).hideAction`; Try again is then the only retry.
 */
export function ApproveOnPcNotice({ kind, action, onRetry }: ApproveOnPcNoticeProps) {
    const t = useT();
    const prompt = useDevicePrompt({ kind, action });
    const retry = {
        label: t('mobileApp.approveOnPc.retry'),
        onPress: () => {
            prompt.restart();
            onRetry();
        },
    };
    switch (prompt.state) {
        case 'waiting':
            return (
                <Notice
                    tone="info"
                    role="status"
                    busy
                    title={t('mobileApp.approveOnPc.title')}
                    message={t(kind === 'keyStore' ? 'mobileApp.approveOnPc.keyStore' : 'mobileApp.approveOnPc.admin')}
                    action={{ label: t('mobileApp.approveOnPc.cancel'), onPress: prompt.stopWaiting }}
                    testID="approve-on-pc"
                />
            );
        case 'cancelled':
            return <Notice tone="info" role="status" message={t('mobileApp.approveOnPc.cancelled')} action={retry} onDismiss={prompt.dismiss} testID="approve-on-pc" />;
        case 'denied':
            return <Notice tone="warning" message={t('mobileApp.approveOnPc.denied')} action={retry} onDismiss={prompt.dismiss} testID="approve-on-pc" />;
        case 'timeout':
            return <Notice tone="warning" message={t('mobileApp.approveOnPc.timedOut')} action={retry} onDismiss={prompt.dismiss} testID="approve-on-pc" />;
        default:
            return null;
    }
}
