// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// The Android transport's copy of the relay domain (RELAY_DOMAIN_KEY in HomeNetwork.kt), the twin of Info.plist's.
const KEY = 'GAIARelayDomain';
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Writes `domain` to the manifest for the native transport to check relay origins against; null leaves none, which refuses them all. */
module.exports = function withRelayDomain(config, { domain } = {}) {
    if (domain !== null && (typeof domain !== 'string' || !DOMAIN.test(domain))) {
        throw new Error(
            `withRelayDomain: "domain" must be a lowercase domain such as "relay.example.net", or null for none, got ${JSON.stringify(domain)}. It comes from EXPO_PUBLIC_GAIA_RELAY_DOMAIN; see app.config.ts.`,
        );
    }
    return withAndroidManifest(config, (cfg) => {
        const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
        if (domain) AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, KEY, domain);
        else AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(application, KEY);
        return cfg;
    });
};
