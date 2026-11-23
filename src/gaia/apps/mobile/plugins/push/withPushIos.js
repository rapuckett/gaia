// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/* global __dirname */

const fs = require('fs');
const path = require('path');

const { withDangerousMod, withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const {
    KEYCHAIN_GROUP_PLIST_KEY,
    KEYCHAIN_GROUP_SUFFIX,
    NSE_BUNDLE_SUFFIX,
    NSE_TARGET,
    OPEN_ONLY_PLIST_KEY,
    PUSH_LOC_KEY,
    STRING_LANGUAGES,
} = require('./constants');
const { iosStringsFile, openOnlyTools, pushStrings } = require('./strings');

const APP_ROOT = path.resolve(__dirname, '../..');
// The Swift the extension compiles: its entry point, and the files it shares with the gaia-push module.
const MODULE_IOS = path.join(APP_ROOT, 'modules/gaia-push/ios');
const NSE_SOURCES = [path.join(MODULE_IOS, 'NotificationService/NotificationService.swift')];
const SHARED_DIR = path.join(MODULE_IOS, 'Shared');

const ENTITLEMENTS = `${NSE_TARGET}.entitlements`;

/** The team-prefixed groups: the app's own first, so items saved without a group (the paired-PC vault) stay app-only. */
function keychainGroups(bundleId) {
    return { own: `$(AppIdentifierPrefix)${bundleId}`, shared: `$(AppIdentifierPrefix)${bundleId}${KEYCHAIN_GROUP_SUFFIX}` };
}

function sharedSources() {
    return fs
        .readdirSync(SHARED_DIR)
        .filter((f) => f.endsWith('.swift'))
        .sort()
        .map((f) => path.join(SHARED_DIR, f));
}

function nseInfoPlist(bundleId) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>GAIA</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleLocalizations</key>
	<array>
${STRING_LANGUAGES.map((l) => `		<string>${l}</string>`).join('\n')}
	</array>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>${KEYCHAIN_GROUP_PLIST_KEY}</key>
	<string>${keychainGroups(bundleId).shared}</string>
	<key>${OPEN_ONLY_PLIST_KEY}</key>
	<array>
${openOnlyTools().map((t) => `		<string>${t}</string>`).join('\n')}
	</array>
	<key>NSExtension</key>
	<dict>
		<key>NSExtensionPointIdentifier</key>
		<string>com.apple.usernotifications.service</string>
		<key>NSExtensionPrincipalClass</key>
		<string>$(PRODUCT_MODULE_NAME).NotificationService</string>
	</dict>
</dict>
</plist>
`;
}

function nseEntitlements(bundleId) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>keychain-access-groups</key>
	<array>
		<string>${keychainGroups(bundleId).shared}</string>
	</array>
</dict>
</plist>
`;
}

/** Adds the relay's loc-key (the generic alert) to the app's own Localizable.strings, which iOS reads when the extension can't run. */
function withGenericAlertStrings(config) {
    const locales = { ...(config.locales ?? {}) };
    for (const lang of STRING_LANGUAGES) {
        const current = locales[lang];
        const base = typeof current === 'string' ? JSON.parse(fs.readFileSync(path.join(APP_ROOT, current), 'utf8')) : { ...(current ?? {}) };
        const ios = { ...(base.ios ?? {}) };
        const body = pushStrings(lang)['mobileApp.push.generic.body'];
        ios['Localizable.strings'] = { ...(ios['Localizable.strings'] ?? {}), [PUSH_LOC_KEY]: body };
        locales[lang] = { ...base, ios };
    }
    return { ...config, locales };
}

function ref(objects, section, uuid, entry, comment) {
    objects[section] = objects[section] ?? {};
    objects[section][uuid] = entry;
    objects[section][`${uuid}_comment`] = comment;
}

function buildSettingsOf(project, targetName) {
    const target = project.pbxTargetByName(targetName);
    if (!target) return {};
    const lists = project.pbxXCConfigurationList();
    const list = lists[target.buildConfigurationList];
    const configs = project.pbxXCBuildConfigurationSection();
    const first = list?.buildConfigurations?.[0]?.value;
    return (first && configs[first]?.buildSettings) || {};
}

/** The extension target: its sources and strings, embedded in the app. Idempotent: a project that already has it is left alone. */
function addExtensionTarget(project, { bundleId, appTarget, version, buildNumber }) {
    if (project.pbxTargetByName(NSE_TARGET)) return project;
    const objects = project.hash.project.objects;
    // addTarget adds the app's dependency on the new target, and needs these sections to exist.
    objects.PBXTargetDependency = objects.PBXTargetDependency ?? {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy ?? {};
    objects.PBXVariantGroup = objects.PBXVariantGroup ?? {};

    const appSettings = buildSettingsOf(project, appTarget);
    if (!appSettings.IPHONEOS_DEPLOYMENT_TARGET) {
        throw new Error(`withPush: the app target "${appTarget}" has no IPHONEOS_DEPLOYMENT_TARGET for the notification extension to match.`);
    }
    const target = project.addTarget(NSE_TARGET, 'app_extension', NSE_TARGET, `${bundleId}${NSE_BUNDLE_SUFFIX}`);
    const sources = project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid).buildPhase;
    const resources = project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid).buildPhase;
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    const group = project.addPbxGroup([], NSE_TARGET, NSE_TARGET);
    const root = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, root);

    const addFile = (name, fileType, phase) => {
        const fileRef = project.generateUuid();
        ref(objects, 'PBXFileReference', fileRef, { isa: 'PBXFileReference', lastKnownFileType: fileType, path: `"${name}"`, sourceTree: '"<group>"' }, name);
        group.pbxGroup.children.push({ value: fileRef, comment: name });
        if (!phase) return;
        const buildFile = project.generateUuid();
        ref(objects, 'PBXBuildFile', buildFile, { isa: 'PBXBuildFile', fileRef, fileRef_comment: name }, `${name} in ${phase === sources ? 'Sources' : 'Resources'}`);
        phase.files.push({ value: buildFile, comment: `${name} in ${phase === sources ? 'Sources' : 'Resources'}` });
    };
    for (const file of [...NSE_SOURCES, ...sharedSources()]) addFile(path.basename(file), 'sourcecode.swift', sources);
    addFile('Info.plist', 'text.plist.xml', null);
    addFile(ENTITLEMENTS, 'text.plist.entitlements', null);

    // Localizable.strings as one variant group with a child per language, as Xcode writes it.
    const variant = project.generateUuid();
    const children = STRING_LANGUAGES.map((lang) => {
        const fileRef = project.generateUuid();
        ref(objects, 'PBXFileReference', fileRef, { isa: 'PBXFileReference', lastKnownFileType: 'text.plist.strings', name: lang, path: `${lang}.lproj/Localizable.strings`, sourceTree: '"<group>"' }, lang);
        return { value: fileRef, comment: lang };
    });
    ref(objects, 'PBXVariantGroup', variant, { isa: 'PBXVariantGroup', children, name: 'Localizable.strings', sourceTree: '"<group>"' }, 'Localizable.strings');
    group.pbxGroup.children.push({ value: variant, comment: 'Localizable.strings' });
    const stringsBuild = project.generateUuid();
    ref(objects, 'PBXBuildFile', stringsBuild, { isa: 'PBXBuildFile', fileRef: variant, fileRef_comment: 'Localizable.strings' }, 'Localizable.strings in Resources');
    resources.files.push({ value: stringsBuild, comment: 'Localizable.strings in Resources' });

    const pbxProject = project.getFirstProject().firstProject;
    pbxProject.knownRegions = Array.from(new Set([...(pbxProject.knownRegions ?? []), ...STRING_LANGUAGES]));

    const configs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
        const settings = configs[key].buildSettings;
        if (!settings || settings.PRODUCT_NAME !== `"${NSE_TARGET}"`) continue;
        Object.assign(settings, {
            INFOPLIST_FILE: `${NSE_TARGET}/Info.plist`,
            CODE_SIGN_ENTITLEMENTS: `${NSE_TARGET}/${ENTITLEMENTS}`,
            GENERATE_INFOPLIST_FILE: 'NO',
            SWIFT_VERSION: '5.0',
            CLANG_ENABLE_MODULES: 'YES',
            TARGETED_DEVICE_FAMILY: '"1,2"',
            IPHONEOS_DEPLOYMENT_TARGET: appSettings.IPHONEOS_DEPLOYMENT_TARGET,
            MARKETING_VERSION: version,
            CURRENT_PROJECT_VERSION: buildNumber,
            CODE_SIGN_STYLE: appSettings.CODE_SIGN_STYLE ?? 'Automatic',
            ...(appSettings.DEVELOPMENT_TEAM ? { DEVELOPMENT_TEAM: appSettings.DEVELOPMENT_TEAM } : {}),
        });
    }
    return project;
}

/** iOS push: the shared Keychain group, the generic alert's strings, and the Notification Service Extension that decrypts. */
function withPushIos(config, { bundleId }) {
    const groups = keychainGroups(bundleId);
    config = withGenericAlertStrings(config);
    config = withEntitlementsPlist(config, (mod) => {
        const existing = mod.modResults['keychain-access-groups'] ?? [];
        mod.modResults['keychain-access-groups'] = Array.from(new Set([groups.own, ...existing, groups.shared]));
        return mod;
    });
    config = withInfoPlist(config, (mod) => {
        mod.modResults[KEYCHAIN_GROUP_PLIST_KEY] = groups.shared;
        return mod;
    });
    config = withDangerousMod(config, [
        'ios',
        (mod) => {
            const dir = path.join(mod.modRequest.platformProjectRoot, NSE_TARGET);
            fs.mkdirSync(dir, { recursive: true });
            for (const file of [...NSE_SOURCES, ...sharedSources()]) fs.copyFileSync(file, path.join(dir, path.basename(file)));
            fs.writeFileSync(path.join(dir, 'Info.plist'), nseInfoPlist(bundleId));
            fs.writeFileSync(path.join(dir, ENTITLEMENTS), nseEntitlements(bundleId));
            for (const lang of STRING_LANGUAGES) {
                fs.mkdirSync(path.join(dir, `${lang}.lproj`), { recursive: true });
                fs.writeFileSync(path.join(dir, `${lang}.lproj/Localizable.strings`), iosStringsFile(pushStrings(lang)));
            }
            return mod;
        },
    ]);
    config = withXcodeProject(config, (mod) => {
        mod.modResults = addExtensionTarget(mod.modResults, {
            bundleId,
            appTarget: mod.modRequest.projectName,
            version: config.version ?? '1.0.0',
            buildNumber: config.ios?.buildNumber ?? '1',
        });
        return mod;
    });
    return config;
}

/** No push: no aps-environment, whichever plugin added it, and no background push mode. */
function withoutPushIos(config) {
    config = withEntitlementsPlist(config, (mod) => {
        delete mod.modResults['aps-environment'];
        return mod;
    });
    return withInfoPlist(config, (mod) => {
        const modes = mod.modResults.UIBackgroundModes;
        if (Array.isArray(modes)) mod.modResults.UIBackgroundModes = modes.filter((m) => m !== 'remote-notification');
        return mod;
    });
}

module.exports = { withPushIos, withoutPushIos, keychainGroups, nseInfoPlist };
