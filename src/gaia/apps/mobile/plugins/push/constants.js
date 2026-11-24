// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/** The APNs `loc-key` of the relay's generic alert; the relay sends this exact name, so it is defined once here. */
const PUSH_LOC_KEY = 'PUSH_GENERIC';

/** The Notification Service Extension's target, folder and product name; its bundle id is the app's plus `.NotificationService`. */
const NSE_TARGET = 'GaiaNotificationService';
const NSE_BUNDLE_SUFFIX = '.NotificationService';

/** The Keychain access group the app and the extension share: the app's bundle id plus this, under the team prefix. */
const KEYCHAIN_GROUP_SUFFIX = '.push';
/** Info.plist key both bundles read the shared group from. */
const KEYCHAIN_GROUP_PLIST_KEY = 'GAIAPushKeychainGroup';

/** The webui catalog keys the native notification code words alerts with (src/gaia/apps/webui/src/i18n/locales). */
const STRING_KEYS = [
    'mobileApp.push.generic.title',
    'mobileApp.push.generic.body',
    'chatAlert.needsApproval',
    'chatAlert.question',
    'chatAlert.finished',
    'chatAlert.failed',
    'chatAlert.stopped',
    'chatAlert.ended',
    'mobileApp.push.title.needsYou',
    'mobileApp.push.body.inChat',
    'mobileApp.push.body.approve',
    'mobileApp.push.body.approveNoChat',
    'mobileApp.push.body.answer',
    'mobileApp.push.body.answerNoChat',
    'mobileApp.push.body.read',
    'mobileApp.push.body.readNoChat',
    'mobileApp.push.body.problem',
    'mobileApp.push.body.problemNoChat',
    'mobileApp.push.body.needsYou',
    'mobileApp.push.body.needsYouNoChat',
    'mobileApp.push.channel.needsYou',
    'mobileApp.push.channel.chats',
];

/** The notification color: the default palette's accentSolid (light) in src/ui/tokens/generated.ts, which plugins can't import; src/pushPlugins.test.ts checks the copy. */
const NOTIFICATION_ACCENT = '#B08D57';

/** The approval card's tool labels (`tool.<id>.active`), which an approval's body names its tool with. */
const TOOL_LABEL_KEY = /^tool\.[a-z0-9_]+\.active$/;

/** The languages the native strings are written in: webui's LOCALES codes. */
const STRING_LANGUAGES = ['en', 'ar'];

/** An Android string resource name for a catalog key: `gaia_push_` and the key with dots as underscores. */
function androidResourceName(key) {
    return `gaia_push_${key.replace(/\./g, '_')}`;
}

module.exports = {
    PUSH_LOC_KEY,
    NSE_TARGET,
    NSE_BUNDLE_SUFFIX,
    KEYCHAIN_GROUP_SUFFIX,
    KEYCHAIN_GROUP_PLIST_KEY,
    STRING_KEYS,
    STRING_LANGUAGES,
    TOOL_LABEL_KEY,
    NOTIFICATION_ACCENT,
    androidResourceName,
};
