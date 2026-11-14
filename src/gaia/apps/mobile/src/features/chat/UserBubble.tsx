// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Stack, Surface, Text } from '@/ui';

export function UserBubble({ text }: { text: string }) {
    return (
        <Stack align="end" paddingX="lg">
            <Surface tone="userMsg" radius="lg" padding="md">
                <Text selectable>{text}</Text>
            </Surface>
        </Stack>
    );
}
