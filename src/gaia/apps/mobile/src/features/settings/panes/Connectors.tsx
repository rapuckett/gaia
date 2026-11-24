// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { useIsFocused } from 'expo-router';

import { ConnectorsBody } from '@/features/connectors';

import { SettingsAnchor } from '../targets';

export default function Connectors() {
    const focused = useIsFocused();
    return (
        <SettingsAnchor name="pane">
            <ConnectorsBody focused={focused} />
        </SettingsAnchor>
    );
}
