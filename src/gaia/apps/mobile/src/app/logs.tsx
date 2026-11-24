// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';

import { LOG_SOURCES } from '@/data';

import { LogsScreen } from '@/features/logs';

export default function Logs() {
    const router = useRouter();
    const focused = useIsFocused();
    const { source } = useLocalSearchParams<{ source?: string }>();
    const initialSource = LOG_SOURCES.find((s) => s === source);
    return <LogsScreen active={focused} initialSource={initialSource} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
