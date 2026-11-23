// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** After coming back, how long a chat alert still counts as one that happened while away: the streams catch up first. */
export const CATCH_UP_MS = 10_000;

export interface OfferState {
    away: boolean;
    /** A run finished or an approval waited while the app was in the background. */
    sawWhileAway: boolean;
    /** Until when, after coming back, a caught-up alert still counts. */
    catchUpUntil: number | null;
}

export type OfferEvent = { type: 'app'; state: string; at: number } | { type: 'alert'; at: number };

export const INITIAL_OFFER_STATE: OfferState = { away: false, sawWhileAway: false, catchUpUntil: null };

/**
 * The moment to offer push (Design's trigger): the first return to the foreground after a run finished or an approval
 * waited in the background. Whether to offer at all (asked before, permission, a build with push) is the caller's.
 */
export function offerStep(state: OfferState, event: OfferEvent): { state: OfferState; offer: boolean } {
    if (event.type === 'app') {
        if (event.state === 'background') return { state: { away: true, sawWhileAway: false, catchUpUntil: null }, offer: false };
        if (event.state !== 'active' || !state.away) return { state, offer: false };
        if (state.sawWhileAway) return { state: INITIAL_OFFER_STATE, offer: true };
        return { state: { away: false, sawWhileAway: false, catchUpUntil: event.at + CATCH_UP_MS }, offer: false };
    }
    if (state.away) return { state: { ...state, sawWhileAway: true }, offer: false };
    if (state.catchUpUntil !== null && event.at <= state.catchUpUntil) return { state: INITIAL_OFFER_STATE, offer: true };
    return { state: { ...state, catchUpUntil: null }, offer: false };
}
