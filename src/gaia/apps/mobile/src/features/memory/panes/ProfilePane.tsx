// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Stack } from '@/ui';

import type { MemoryPaneProps } from '../tabs';

export function ProfilePane(_props: MemoryPaneProps) {
    return <Stack flex={1} testID="memory-pane-profile" />;
}
