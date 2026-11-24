// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** Settings > Phones and tablets: paired devices (`/api/devices`), PC-only. */

import { apiFetch } from './api';
import type { AwayRouteStatus, DeviceAccessStatus, DeviceChange, DeviceChangeList, DevicePairingOffer, PairedDevice, PairedDeviceList } from '../types/api.gen';

export type { DeviceAccessStatus, DeviceChange, DeviceChangeList, DevicePairingOffer, PairedDevice };

export const getDeviceStatus = (): Promise<DeviceAccessStatus> => apiFetch('GET', '/devices/status');

export const listDevices = async (): Promise<PairedDevice[]> =>
    (await apiFetch<PairedDeviceList>('GET', '/devices')).devices;

export const startDeviceListener = (): Promise<DeviceAccessStatus> => apiFetch('POST', '/devices/listener');

export const stopDeviceListener = (): Promise<DeviceAccessStatus> => apiFetch('DELETE', '/devices/listener');

export const startAwayRoute = (kind: AwayRouteStatus['kind']): Promise<DeviceAccessStatus> =>
    apiFetch('POST', `/devices/routes/${encodeURIComponent(kind)}`);

export const stopAwayRoute = (kind: AwayRouteStatus['kind']): Promise<DeviceAccessStatus> =>
    apiFetch('DELETE', `/devices/routes/${encodeURIComponent(kind)}`);

export const openDevicePairing = (): Promise<DevicePairingOffer> => apiFetch('POST', '/devices/pairing');

export const closeDevicePairing = (): Promise<DeviceAccessStatus> => apiFetch('DELETE', '/devices/pairing');

export const resetDevicePairing = (): Promise<DeviceAccessStatus> => apiFetch('POST', '/devices/pairing/reset');

export const allowDevice = (id: string): Promise<PairedDevice> =>
    apiFetch('POST', `/devices/${encodeURIComponent(id)}/allow`);

export const removeDevice = (id: string): Promise<void> => apiFetch('DELETE', `/devices/${encodeURIComponent(id)}`);

export const getDeviceChanges = (id: string, limit: number): Promise<DeviceChangeList> =>
    apiFetch('GET', `/devices/${encodeURIComponent(id)}/changes?limit=${limit}`);
