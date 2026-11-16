// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useRouter } from 'expo-router';

import { reopenSetup } from '@/features/setup/SetupGate';
import { useT } from '@/i18n/useT';
import { Button } from '@/ui';

/** "Set up local models": leaves Settings and reopens setup, which has its own way back. */
export function SetUpLocalButton({ onOpen }: { onOpen?: () => void }) {
    const t = useT();
    const router = useRouter();
    const open = () => {
        router.replace('/');
        reopenSetup();
    };
    return <Button variant="primary" full label={t('settings.errors.setUpLocal')} onPress={onOpen ?? open} testID="advanced-set-up-local" />;
}
