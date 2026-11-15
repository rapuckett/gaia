// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { FileBrowserScreen } from '@/features/files';

export default function Files() {
    const router = useRouter();
    const { chat } = useLocalSearchParams<{ chat?: string }>();
    if (!chat) return <Redirect href="/documents" />;
    return <FileBrowserScreen chatId={chat} onClose={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/documents', params: { chat } }))} />;
}
