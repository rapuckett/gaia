// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { isolate } from '@webui/i18n/registry';
import { Text } from './Text';

export function Ltr({ children }: { children: string }) {
    return <Text>{isolate(children, 'ltr')}</Text>;
}
