// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/* eslint-disable @typescript-eslint/no-require-imports */
import { getLocale } from '@webui/i18n/registry';

const { PUSH_LOC_KEY, STRING_KEYS, STRING_LANGUAGES, TOOL_LABEL_KEY, androidResourceName } = require('../plugins/push/constants');
const { androidStringsXml, iosStringsFile, pushStrings } = require('../plugins/push/strings');

describe('the notification strings generated at prebuild', () => {
    it('come from the webui catalogs, in every shipped language', () => {
        for (const lang of STRING_LANGUAGES as string[]) {
            const messages = getLocale(lang).messages as Record<string, string>;
            const strings = pushStrings(lang) as Record<string, string>;
            const keys = Object.keys(strings);
            expect(keys.slice(0, STRING_KEYS.length)).toEqual(STRING_KEYS);
            const tools = keys.slice(STRING_KEYS.length);
            expect(tools.every((k) => TOOL_LABEL_KEY.test(k))).toBe(true);
            expect(tools).toContain('tool.write_file.active');
            for (const key of keys) expect(strings[key]).toBe(messages[key]);
        }
    });

    it("give the relay's one loc-key the generic body", () => {
        expect(PUSH_LOC_KEY).toBe('PUSH_GENERIC');
        const file = iosStringsFile(pushStrings('ar')) as string;
        expect(file).toContain(`"${PUSH_LOC_KEY}" = "${getLocale('ar').messages['mobileApp.push.generic.body']}";`);
        expect(file).toContain('"mobileApp.push.body.approve" = "في «{chat}». اضغط للمراجعة.";');
    });

    it('escape Android resource text', () => {
        const xml = androidStringsXml({ 'a.b': "There's <1> & @x", 'c.d': '@start' }) as string;
        expect(androidResourceName('a.b')).toBe('gaia_push_a_b');
        expect(xml).toContain('<string name="gaia_push_a_b">There\\\'s &lt;1&gt; &amp; @x</string>');
        expect(xml).toContain('<string name="gaia_push_c_d">\\@start</string>');
    });
});
