// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { requireOptionalNativeModule, type EventSubscription } from 'expo';
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

/** An approval notification's Approve or Deny, as Android hands it over; none of it is ever shown or logged. */
export interface NativeApprovalAction {
    action: string;
    pcId: string;
    sessionId: string;
    approvalId: string;
    tool: string | null;
    /** When this phone received the push, by its own clock (unix ms). */
    receivedAt: number;
}

/** Rejections carry `code`: keychain, push_unavailable. */
export interface GaiaPushNative {
    /** False in a build without push (no relay URL at build time). */
    readonly available: boolean;
    save(pcId: string, handle: string, secret: string, sendToken: string, key: string): Promise<void>;
    /** `key` is empty for a PC that was unpaired whose handle still waits to be deleted at the relay. */
    load(pcId: string): Promise<PushSecrets | null>;
    /** The PCs that have a push registration on this phone. */
    pcIds(): Promise<string[]>;
    /** Stops this phone opening that PC's pushes now, keeping the relay credentials until the handle is deleted there. */
    dropKey(pcId: string): Promise<void>;
    remove(pcId: string): Promise<void>;
    removeAll(): Promise<void>;
    /** The app's own language for the iOS notification extension, or null to follow the phone; Android ignores it. */
    setLanguage(code: string | null): Promise<void>;
    /** Titles the approval notification's Approve and Deny on iOS; Android labels them from its own strings. */
    setApprovalActions(approveTitle: string, denyTitle: string): Promise<void>;
    /** Android only: the Approve or Deny that opened or resumed the app before anything listened, once; null after that. */
    takeApprovalAction?(): NativeApprovalAction | null;
    /** Android only: an Approve or Deny pressed while something listens. */
    addListener?(event: 'onApprovalAction', listener: (event: NativeApprovalAction) => void): EventSubscription;
}

const native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule<GaiaPushNative>('GaiaPush') : null;

/** The native push store, or null on the web, in a build without push, or in one made before the module. */
export function gaiaPush(): GaiaPushNative | null {
    return native?.available ? native : null;
}
