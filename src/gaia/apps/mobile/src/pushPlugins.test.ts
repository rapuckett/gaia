// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/* eslint-disable @typescript-eslint/no-require-imports */
import { getLocale } from '@webui/i18n/registry';

import { colors } from '@/ui/tokens/generated';

const { NOTIFICATION_ACCENT, OPEN_ONLY_PLIST_KEY, OPEN_ONLY_RESOURCE, PUSH_LOC_KEY, STRING_KEYS, STRING_LANGUAGES, TOOL_LABEL_KEY, androidResourceName } = require('../plugins/push/constants');
const { androidOpenOnlyXml, androidStringsXml, iosStringsFile, openOnlyTools, pushStrings } = require('../plugins/push/strings');
const { nseInfoPlist } = require('../plugins/push/withPushIos');
const openOnlyJson = require('../modules/gaia-push/openOnlyTools.json');

describe('the notification strings generated at prebuild', () => {
    it('come from the webui catalogs, in every shipped language', () => {
        for (const lang of STRING_LANGUAGES as string[]) {
            const messages = getLocale(lang).messages as Record<string, string>;
            const strings = pushStrings(lang) as Record<string, string>;
            const keys = Object.keys(strings);
            expect(keys.slice(0, STRING_KEYS.length)).toEqual(STRING_KEYS);
            // Android labels an approval's buttons Review and Deny.
            expect(STRING_KEYS).toEqual(expect.arrayContaining(['notifications.devices.review', 'notifications.deny']));
            // An approval names its tool only with the phone's own label.
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

    it("color notifications with the default palette's solid accent", () => {
        expect(NOTIFICATION_ACCENT).toBe(colors.light.accentSolid);
    });

    it('carry the open-only tools to both phones, from the one list', () => {
        expect(openOnlyTools()).toEqual(openOnlyJson.tools);
        expect(OPEN_ONLY_PLIST_KEY).toBe('GAIAPushOpenOnlyTools');
        expect(nseInfoPlist('com.example.gaia') as string).toContain(`<key>${OPEN_ONLY_PLIST_KEY}</key>\n\t<array>\n`);
        const xml = androidOpenOnlyXml(['send_email', 'run_shell']) as string;
        expect(xml).toContain(`<string-array name="${OPEN_ONLY_RESOURCE}">\n        <item>send_email</item>\n        <item>run_shell</item>\n    </string-array>`);
        expect(androidOpenOnlyXml([]) as string).toContain(`<string-array name="${OPEN_ONLY_RESOURCE}">\n    </string-array>`);
    });

    it('escape Android resource text', () => {
        const xml = androidStringsXml({ 'a.b': "There's <1> & @x", 'c.d': '@start' }) as string;
        expect(androidResourceName('a.b')).toBe('gaia_push_a_b');
        expect(xml).toContain('<string name="gaia_push_a_b">There\\\'s &lt;1&gt; &amp; @x</string>');
        expect(xml).toContain('<string name="gaia_push_c_d">\\@start</string>');
    });
});
