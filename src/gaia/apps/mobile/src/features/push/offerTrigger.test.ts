// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { CATCH_UP_MS, INITIAL_OFFER_STATE, offerStep, type OfferEvent, type OfferState } from './offerTrigger';

function run(events: OfferEvent[]): boolean[] {
    let state: OfferState = INITIAL_OFFER_STATE;
    return events.map((event) => {
        const next = offerStep(state, event);
        state = next.state;
        return next.offer;
    });
}

describe('when to offer push', () => {
    it('never at launch, nor for an alert while the app is open', () => {
        expect(run([{ type: 'app', state: 'active', at: 0 }, { type: 'alert', at: 1 }])).toEqual([false, false]);
    });

    it('on the first return after a run finished while away', () => {
        expect(run([{ type: 'app', state: 'background', at: 0 }, { type: 'alert', at: 5 }, { type: 'app', state: 'active', at: 9 }])).toEqual([false, false, true]);
    });

    it('when the streams catch up just after coming back, and not after the window', () => {
        const back = [{ type: 'app', state: 'background', at: 0 }, { type: 'app', state: 'active', at: 100 }] as OfferEvent[];
        expect(run([...back, { type: 'alert', at: 100 + CATCH_UP_MS }])).toEqual([false, false, true]);
        expect(run([...back, { type: 'alert', at: 101 + CATCH_UP_MS }])).toEqual([false, false, false]);
    });

    it('not on a return with nothing new, and an iOS inactive blip changes nothing', () => {
        expect(
            run([
                { type: 'app', state: 'background', at: 0 },
                { type: 'app', state: 'inactive', at: 1 },
                { type: 'app', state: 'active', at: 2 },
                { type: 'alert', at: 2 + CATCH_UP_MS + 1 },
            ]),
        ).toEqual([false, false, false, false]);
    });
});
