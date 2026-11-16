// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { Platform } from 'react-native';

import { GaiaError } from '@/api/errors';

import { createFakePairingService } from './fakePairingService';
import type { PairingService } from './service';

let current: PairingService | null = __DEV__ || Platform.OS === 'web' ? createFakePairingService() : null;

/** Mobile installs the real service at start-up; tests install their own. */
export function setPairingService(service: PairingService | null): void {
    current = service;
}

export function getPairingService(): PairingService {
    if (!current) {
        throw new GaiaError('mobileApp.pairing.unavailable');
    }
    return current;
}
