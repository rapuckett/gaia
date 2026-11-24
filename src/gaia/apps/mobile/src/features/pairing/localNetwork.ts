// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { GaiaTransport } from '../../../modules/gaia-transport';
import { homeNetworkOrigin } from './homeNetwork';

// What this install has seen of the local network permission; AsyncStorage goes with an uninstall, as the permission does.
const STORAGE_KEY = 'gaia:local-network';

/** A home address that fails faster than this was most likely stopped by the phone, not by the network. */
export const DENIED_FAST_MS = 1000;

interface Seen {
    /** When Continue on the explainer was pressed. */
    explained?: string;
    /** When a home address first answered, so the permission was given. */
    allowed?: string;
}

async function read(): Promise<Seen> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Seen) : {};
}

async function mark(field: keyof Seen): Promise<void> {
    const seen = await read();
    if (seen[field]) return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seen, [field]: new Date().toISOString() }));
}

export const markExplained = () => mark('explained');
export const markAllowed = () => mark('allowed');

/**
 * Whether the OS asks before this app reaches the home network. iOS does; Android does only for an app that
 * targets API 37 (ACCESS_LOCAL_NETWORK), and this one targets 36.
 */
export function asksForLocalNetwork(os: string = Platform.OS): boolean {
    return os === 'ios';
}

/**
 * Where this pairing's first connection stands with the permission: `explain` shows the explainer first, `watch`
 * means the explainer was shown but no home address has answered yet, so a denial is still possible, and `known`
 * means the permission was given already, or isn't asked for at all.
 */
export async function localNetworkStep(origins: readonly string[], pairedBefore: boolean, os: string = Platform.OS): Promise<'explain' | 'watch' | 'known'> {
    if (!asksForLocalNetwork(os) || pairedBefore || !origins.some((o) => homeNetworkOrigin(o) !== null)) return 'known';
    const seen = await read();
    if (seen.allowed) return 'known';
    return seen.explained ? 'watch' : 'explain';
}

/** Notes whether the app left the foreground while a request was out: iOS's prompt makes it inactive. */
export function watchForeground(): { left(): boolean; stop(): void } {
    let left = AppState.currentState !== 'active';
    const sub = AppState.addEventListener('change', (state) => {
        if (state !== 'active') left = true;
    });
    return { left: () => left, stop: () => sub.remove() };
}

async function onWifi(): Promise<boolean> {
    const { type, isConnected } = await Network.getNetworkStateAsync();
    return isConnected === true && (type === Network.NetworkStateType.WIFI || type === Network.NetworkStateType.ETHERNET);
}

/**
 * Whether no answer from every home address looks like the permission being off: the phone is on Wi-Fi, and the
 * attempt failed at once, or while iOS's prompt was up. A PC that refuses the connection fails as fast, so this is a
 * best guess, used only where the native check is missing.
 */
export async function looksDenied({ elapsedMs, leftForeground }: { elapsedMs: number; leftForeground: boolean }): Promise<boolean> {
    if (elapsedMs >= DENIED_FAST_MS && !leftForeground) return false;
    return onWifi();
}

/**
 * Whether iOS's local network setting stopped this pairing's home addresses, once none of them answered. The native
 * check reads why the connection couldn't go, so a PC that refuses or never answers gets the generic message instead.
 */
export async function localNetworkDenied(
    origins: readonly string[],
    attempt: { elapsedMs: number; leftForeground: boolean; retrying: boolean },
    os: string = Platform.OS,
): Promise<boolean> {
    const check = GaiaTransport.checkLocalNetwork?.bind(GaiaTransport);
    if (asksForLocalNetwork(os) && check) {
        const home = origins.map((o) => homeNetworkOrigin(o)).filter((o): o is string => o !== null);
        const reasons = await Promise.all(home.map((origin) => check(origin)));
        return reasons.includes('local_network_denied');
    }
    // Web and builds made before the native check can only guess, and a retry from the denied card keeps it up.
    return attempt.retrying || looksDenied(attempt);
}
