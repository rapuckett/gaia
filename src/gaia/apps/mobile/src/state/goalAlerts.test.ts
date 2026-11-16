// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { createGoalHealthAnnouncer } from './goalAlerts';

describe('goal store alerts', () => {
    it('raises once per distinct failure across polls, and reads them on recovery', () => {
        const raised: string[] = [];
        const recovered = jest.fn();
        const announce = createGoalHealthAnnouncer((error, count) => raised.push(`${count}:${error}`), recovered);

        announce('broken');
        announce('broken');
        announce('broken');
        expect(raised).toEqual(['1:broken']);
        expect(recovered).not.toHaveBeenCalled();

        announce('locked');
        expect(raised).toEqual(['1:broken', '2:locked']);

        announce(null);
        expect(recovered).toHaveBeenCalledTimes(1);

        announce('broken');
        expect(raised).toEqual(['1:broken', '2:locked', '3:broken']);
    });
});
