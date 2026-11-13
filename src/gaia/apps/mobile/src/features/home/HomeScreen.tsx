// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Text, View } from 'react-native';

import { useT } from '@/i18n/useT';
import { useConnectionStore } from '@/state/connection';

export function HomeScreen() {
    const t = useT();
    const connection = useConnectionStore((s) => s.connection);
    return <View>{connection === null ? <Text>{t('mobileApp.notConnected')}</Text> : null}</View>;
}
