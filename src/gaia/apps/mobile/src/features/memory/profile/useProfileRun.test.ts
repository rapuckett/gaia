import { translator } from '@webui/i18n/translator';

import { findingLine } from './useProfileRun';

describe('findingLine', () => {
    it('starts an Arabic line with the label and isolates the English item', () => {
        const line = findingLine(translator('ar'), 'finding', 'Likes tea.');
        expect(line.startsWith('وُجد:')).toBe(true);
        expect(line).toContain('\u2068Likes tea.\u2069');
    });

    it('lets an Arabic finding keep its own direction', () => {
        const line = findingLine(translator('ar'), 'finding', 'يحب الشاي.');
        expect(line).toContain('\u2068يحب الشاي.\u2069');
    });
});
