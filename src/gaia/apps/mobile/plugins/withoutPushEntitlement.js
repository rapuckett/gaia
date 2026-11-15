// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Leaves push out of the app: removes `aps-environment`, which Expo's built-in expo-notifications
 * plugin adds even when app.config.ts doesn't list it. For GAIA_APS_ENVIRONMENT=none.
 */
module.exports = function withoutPushEntitlement(config) {
    return withEntitlementsPlist(config, (mod) => {
        delete mod.modResults['aps-environment'];
        return mod;
    });
};
