import { translator } from '@webui/i18n/translator';

import { upcomingLine } from './UpcomingList';

describe('upcomingLine', () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();

    it('says the relative time once in English', () => {
        expect(upcomingLine(translator('en'), yesterday, true)).toBe('OVERDUE: yesterday');
    });

    it('glosses the Arabic line once, with no brackets inside the brackets', () => {
        const line = upcomingLine(translator('ar'), yesterday, true);
        expect(line.match(/OVERDUE/g)).toHaveLength(1);
        expect(line.match(/\(/g)).toHaveLength(1);
    });
});
