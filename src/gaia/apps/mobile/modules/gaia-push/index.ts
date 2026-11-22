// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** One paired PC's push registration. All of it is secret; only `handle`, `sendToken` and `key` ever go to that PC. */
export interface PushSecrets {
    handle: string;
    /** The relay credential for rotating the token and deleting the handle; it never leaves this phone. */
    secret: string;
    /** The relay credential the PC sends with, and nothing else. */
    sendToken: string;
    /** The payload key, base64url of 32 bytes. */
    key: string;
}

/** Rejections carry `code`: keychain, push_unavailable. */
export interface GaiaPushNative {
    /** False in a build without push (no relay URL at build time). */
    readonly available: boolean;
    save(pcId: string, handle: string, secret: string, sendToken: string, key: string): Promise<void>;
    load(pcId: string): Promise<PushSecrets | null>;
    /** The PCs that have a push registration on this phone. */
    pcIds(): Promise<string[]>;
    remove(pcId: string): Promise<void>;
    removeAll(): Promise<void>;
    /** The app's own language for the iOS notification extension, or null to follow the phone; Android ignores it. */
    setLanguage(code: string | null): Promise<void>;
}

const native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule<GaiaPushNative>('GaiaPush') : null;

/** The native push store, or null on the web, in a build without push, or in one made before the module. */
export function gaiaPush(): GaiaPushNative | null {
    return native?.available ? native : null;
}
