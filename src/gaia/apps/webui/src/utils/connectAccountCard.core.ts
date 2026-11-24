// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The `connect_account` card's payload and which connectors it waits on. Pure, so the phone app can import it. */

import type { Message } from '../types';
import { CONNECT_ACCOUNT_RENDER, isConnectAccountPayload, type ConnectAccountPayload } from './connectCards';

export { CONNECT_ACCOUNT_RENDER, isConnectAccountPayload };
export type { ConnectAccountPayload };

/**
 * What a Connect press asks for: what the call needs, plus what the connection
 * already carries, so signing in again never takes access away. Empty when the
 * card names nothing, so the backend asks for what the agent declares.
 */
export function requestScopes(needed: string[] | undefined, held: string[] | undefined): string[] {
    if (!needed?.length) return [];
    return [...new Set([...(held ?? []), ...needed])];
}

/** The providers whose becoming connected is the fix: those not connected when the tool ran. */
export function awaited(card: ConnectAccountPayload): string[] {
    return card.providers.filter((p) => !card.reconnect?.includes(p));
}

/**
 * The connectors a message's Connect card is waiting on; empty when it has no
 * card, or when every account on it was connected already and needs signing
 * in again, which the connector list cannot show.
 */
export function connectCardProviders(message: Pick<Message, 'cards'> | undefined): string[] {
    const found = new Set<string>();
    for (const card of message?.cards ?? []) {
        if (card.render === CONNECT_ACCOUNT_RENDER && isConnectAccountPayload(card.data)) {
            awaited(card.data).forEach((p) => found.add(p));
        }
    }
    return [...found];
}

/** Per provider, the account a message's Connect card offered to sign in to again. */
export function connectCardAccounts(message: Pick<Message, 'cards'> | undefined): Record<string, string> {
    const named: Record<string, string> = {};
    for (const card of message?.cards ?? []) {
        if (card.render === CONNECT_ACCOUNT_RENDER && isConnectAccountPayload(card.data)) {
            Object.assign(named, card.data.account);
        }
    }
    return named;
}

/** Whether a message carries a Connect card at all. */
export function hasConnectCard(message: Pick<Message, 'cards'> | undefined): boolean {
    return (message?.cards ?? []).some(
        (card) => card.render === CONNECT_ACCOUNT_RENDER && isConnectAccountPayload(card.data),
    );
}
