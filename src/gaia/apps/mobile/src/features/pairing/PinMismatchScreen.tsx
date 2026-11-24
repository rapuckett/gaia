// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useT } from '@/i18n/useT';
import { useAnnounce } from '@/platform/useAnnounce';
import { Button, Icon, Notice, Screen, Stack, Text } from '@/ui';
import { ShieldAlert } from '@/ui/icons';

/**
 * The paired PC's certificate changed: the only way on is to pair again, never to trust it. "Pair again" first asks the
 * PC over the old pin (`checking`); `unreachablePc` names a PC that didn't answer, with nothing changed on the phone.
 */
export function PinMismatchScreen({ onPairAgain, checking = false, unreachablePc = null }: { onPairAgain: () => void; checking?: boolean; unreachablePc?: string | null }) {
    const t = useT();
    useAnnounce(checking ? t('mobileApp.pairing.again.busy') : null);
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
