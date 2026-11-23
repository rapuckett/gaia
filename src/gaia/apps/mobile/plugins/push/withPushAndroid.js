// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/* global __dirname */

const fs = require('fs');
const path = require('path');

const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const { NOTIFICATION_ACCENT, STRING_LANGUAGES } = require('./constants');
const { androidOpenOnlyXml, androidStringsXml, openOnlyTools, pushStrings } = require('./strings');

const SERVICE = 'ai.amd.gaia.push.GaiaMessagingService';
const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const MESSAGING_EVENT = 'com.google.firebase.MESSAGING_EVENT';
const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';
// The link a tapped notification opens, read by GaiaMessagingService; pairing links use the same scheme.
const SCHEME_KEY = 'ai.amd.gaia.push.SCHEME';
const STRINGS_FILE = 'gaia_push_strings.xml';
// The status-bar icon, 24 dp in each density: the desktop tray's GAIA template, scaled smooth and made white on transparent.
const ICON_FILE = 'ic_stat_gaia.png';
const ICON_DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const iconSource = (density) => path.join(__dirname, 'assets', `ic_stat_gaia-${density}.png`);

function ensureTools(manifest) {
    manifest.manifest.$ = { ...manifest.manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
}

function withoutNamed(list, name) {
    return (list ?? []).filter((item) => item.$?.['android:name'] !== name);
}

/** GAIA's messaging service takes FCM's messages (a higher priority than expo-notifications' own), and the strings it words them with. */
function withPushAndroid(config, { scheme }) {
    config = withAndroidManifest(config, (mod) => {
        const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
        application.service = [
            ...withoutNamed(application.service, SERVICE),
            {
                $: { 'android:name': SERVICE, 'android:exported': 'false' },
                'intent-filter': [{ $: { 'android:priority': '1' }, action: [{ $: { 'android:name': MESSAGING_EVENT } }] }],
            },
        ];
        AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, SCHEME_KEY, scheme);
        return mod;
    });
    return withDangerousMod(config, [
        'android',
        (mod) => {
            const res = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
            for (const density of ICON_DENSITIES) {
                fs.mkdirSync(path.join(res, `drawable-${density}`), { recursive: true });
                fs.copyFileSync(iconSource(density), path.join(res, `drawable-${density}`, ICON_FILE));
            }
            fs.mkdirSync(path.join(res, 'values'), { recursive: true });
            fs.writeFileSync(
                path.join(res, 'values', 'gaia_push_colors.xml'),
                `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="gaia_push_accent">${NOTIFICATION_ACCENT}</color>\n</resources>\n`,
            );
            fs.writeFileSync(path.join(res, 'values', 'gaia_push_open_only.xml'), androidOpenOnlyXml(openOnlyTools()));
            for (const lang of STRING_LANGUAGES) {
                const dir = path.join(res, lang === 'en' ? 'values' : `values-${lang}`);
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, STRINGS_FILE), androidStringsXml(pushStrings(lang)));
            }
            return mod;
        },
    ]);
}

/** No push: removes the FCM service and notification permission that expo-notifications' library manifest merges in. */
function withoutPushAndroid(config) {
    return withAndroidManifest(config, (mod) => {
        ensureTools(mod.modResults);
        const manifest = mod.modResults.manifest;
        manifest['uses-permission'] = [
            ...withoutNamed(manifest['uses-permission'], POST_NOTIFICATIONS),
            { $: { 'android:name': POST_NOTIFICATIONS, 'tools:node': 'remove' } },
        ];
        const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
        application.service = [
            ...withoutNamed(withoutNamed(application.service, SERVICE), EXPO_SERVICE),
            { $: { 'android:name': EXPO_SERVICE, 'tools:node': 'remove' } },
        ];
        AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(application, SCHEME_KEY);
        return mod;
    });
}

module.exports = { withPushAndroid, withoutPushAndroid, SCHEME_KEY };
