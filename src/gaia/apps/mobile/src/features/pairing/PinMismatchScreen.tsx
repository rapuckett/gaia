// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import { describeHttpFailure, useT } from '@/i18n/useT';
import { useAnnounce } from '@/platform/useAnnounce';
import { Button, Icon, Notice, Row, Screen, Sheet, Stack, Text } from '@/ui';
import { ShieldAlert } from '@/ui/icons';

export interface PinMismatchScreenProps {
    onPairAgain: () => void;
    checking?: boolean;
    /** A PC that didn't answer, with nothing changed on the phone. */
    unreachablePc?: string | null;
    /** A PC whose every address answered with another certificate; Try again asks again, and forgetting it is confirmed first. */
    otherDevicePc?: string | null;
    onForget?: () => void;
    forgetting?: boolean;
    forgetError?: unknown;
}

/**
 * The paired PC's certificate changed: the only way on is to pair again, never to trust it. "Pair again" first asks the
 * PC over the old pin (`checking`); `unreachablePc` names a PC that didn't answer, `otherDevicePc` one where a
 * different device answered.
 */
export function PinMismatchScreen({ onPairAgain, checking = false, unreachablePc = null, otherDevicePc = null, onForget, forgetting = false, forgetError = null }: PinMismatchScreenProps) {
    const t = useT();
    useAnnounce(checking ? t('mobileApp.pairing.again.busy') : null);
    if (otherDevicePc !== null) {
        return (
            <OtherDevice pc={otherDevicePc} onTryAgain={onPairAgain} checking={checking} onForget={onForget} forgetting={forgetting} forgetError={forgetError} />
        );
    }
    const unreachable = unreachablePc !== null && !checking;
    return (
        <Screen edges={['top', 'bottom', 'start', 'end']}>
            <Stack flex={1} justify="center" gap="lg" padding="xl">
                <Icon icon={ShieldAlert} size="lg" tone="danger" />
                <Stack gap="sm">
                    <Text role="display" weight="semibold">{t('mobileApp.pairing.pinMismatch.title')}</Text>
                    <Text tone="secondary">{t('mobileApp.pairing.pinMismatch')}</Text>
                </Stack>
                {unreachable ? <Notice tone="warning" message={t('mobileApp.pairing.again.unreachable', { pc: unreachablePc })} testID="pair-again-unreachable" /> : null}
                <Button
                    variant="primary"
                    label={t(checking ? 'mobileApp.pairing.again.busy' : unreachable ? 'mobileApp.pairing.off.retry' : 'mobileApp.pairing.pinMismatch.action')}
                    onPress={onPairAgain}
                    busy={checking}
                    full
                    testID="pair-again"
                />
            </Stack>
        </Screen>
    );
}

/** Design's state d: no PC is forgotten on one tap; "Forget this PC" asks first. */
function OtherDevice({
    pc,
    onTryAgain,
    checking,
    onForget,
    forgetting,
    forgetError,
}: {
    pc: string;
    onTryAgain: () => void;
    checking: boolean;
    onForget?: () => void;
    forgetting: boolean;
    forgetError: unknown;
}) {
    const t = useT();
    const [confirming, setConfirming] = useState(false);
    const failure = forgetError ? describeHttpFailure(forgetError, t) : null;
    return (
        <Screen edges={['top', 'bottom', 'start', 'end']}>
            <Stack flex={1} justify="center" gap="lg" padding="xl" testID="pair-again-other-device">
                <Icon icon={ShieldAlert} size="lg" tone="warning" />
                <Stack gap="sm">
                    <Text role="display" weight="semibold">{t('mobileApp.pairing.again.otherDevice.title', { pc })}</Text>
                    <Text tone="secondary">{t('mobileApp.pairing.again.otherDevice.body', { pc })}</Text>
                    <Text tone="secondary">{t('mobileApp.pairing.again.otherDevice.check', { pc })}</Text>
                </Stack>
                <Button
                    variant="primary"
                    label={t(checking ? 'mobileApp.pairing.again.busy' : 'mobileApp.pairing.off.retry')}
                    onPress={onTryAgain}
                    busy={checking}
                    disabled={forgetting}
                    full
                    testID="pair-again"
                />
                <Stack gap="sm">
                    <Text tone="muted">{t('mobileApp.pairing.again.otherDevice.resetHint')}</Text>
                    <Button
                        variant="danger"
                        label={t('mobileApp.pairing.again.forget')}
                        onPress={() => setConfirming(true)}
                        busy={forgetting}
                        disabled={checking}
                        full
                        testID="pair-again-forget"
                    />
                </Stack>
                {failure ? <Notice tone="danger" message={failure.text} detail={failure.detail} /> : null}
            </Stack>
            <Sheet open={confirming} onClose={() => setConfirming(false)} title={t('mobileApp.pairing.again.forgetConfirmTitle', { pc })}>
                <Stack gap="md">
                    <Text tone="secondary">{t('mobileApp.pairing.again.forgetConfirmBody')}</Text>
                    <Row gap="sm" stack>
                        <Button label={t('mobileApp.pairing.waiting.cancel')} variant="secondary" onPress={() => setConfirming(false)} testID="pair-again-forget-cancel" />
                        <Button
                            label={t('mobileApp.pairing.again.forget')}
                            variant="danger"
                            testID="pair-again-forget-confirm"
                            onPress={() => {
                                setConfirming(false);
                                onForget?.();
                            }}
                        />
                    </Row>
                </Stack>
            </Sheet>
        </Screen>
    );
}
