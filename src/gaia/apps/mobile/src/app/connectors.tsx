// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useIsFocused } from 'expo-router';

import { ConnectorsScreen } from '@/features/connectors';

export default function Connectors() {
    const focused = useIsFocused();
    return <ConnectorsScreen focused={focused} />;
}
