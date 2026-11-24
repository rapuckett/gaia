// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

const { withPushAndroid, withoutPushAndroid } = require('./push/withPushAndroid');
const { withPushIos, withoutPushIos } = require('./push/withPushIos');

/**
 * Push notifications, per platform: `ios` and `android` are null for a build without push, which then
 * carries no push entitlement, extension, permission or messaging service. See readPushConfig in app.config.ts.
 */
module.exports = function withPush(config, { ios = null, android = null } = {}) {
    if (ios && typeof ios.bundleId !== 'string') throw new Error('withPush: "ios.bundleId" is required when iOS push is on.');
    if (android && typeof android.scheme !== 'string') throw new Error('withPush: "android.scheme" is required when Android push is on.');
    config = ios ? withPushIos(config, ios) : withoutPushIos(config);
    return android ? withPushAndroid(config, android) : withoutPushAndroid(config);
};
