# Pairing phones and tablets: catalog entries (Design, 2026-11-12)

Final strings for the web UI's Settings section, for Mobile's Settings UI step. Rich picked the names
(2026-11-12, through the Lead): "Phones and tablets", "Allow paired devices to connect", "Reset pairing",
with the Arabic below, and the notice with Review and Deny only. Layout and states:
`2026-11-12-device-pairing-settings.md` next to this file.

Add both blocks after the `settings.messaging.*` keys, in the same order in each catalog (the files
mirror each other line for line). `t.plural` picks only `.one` (n = 1) or `.other`, so the Arabic
`.other` texts avoid number agreement with the catalog's "({n})" style.

## en.ts

```ts
    'settings.section.devices': 'Phones and tablets',
    'settings.devices.lede': 'Use the GAIA app on your phone or tablet with this PC. Only devices you pair and allow here can connect.',
    'settings.devices.connect': 'Allow paired devices to connect',
    'settings.devices.connectHint': "Over the local network this PC is on. While it's off, nothing can connect, paired or not.",
    'settings.devices.portInUse': "Port {port} is in use by another app, so devices can't connect. Close that app, then turn this on again.",
    'settings.devices.listenFailed': "Devices can't connect: {detail}",
    'settings.devices.pair': 'Pair a phone or tablet',
    'settings.devices.pairOffHint': 'Turn on “{label}” to pair a device.',
    'settings.devices.scan': 'Open the GAIA app and scan this code. Only the first device to scan it can pair.',
    'settings.devices.expiresIn': 'The code stops working in {time}.',
    'settings.devices.qrAlt': 'Pairing code for the GAIA app',
    'settings.devices.cancel': 'Cancel',
    'settings.devices.expired': 'The code expired before a device used it.',
    'settings.devices.newCode': 'Show a new code',
    'settings.devices.waitingTitle': 'Waiting for your OK',
    'settings.devices.waitingHint': "It can't reach your chats or this PC until you allow it.",
    'settings.devices.pairedAt': '{platform} · Paired {when}',
    'settings.devices.allow': 'Allow',
    'settings.devices.allowAria': 'Allow {name}',
    'settings.devices.deny': 'Deny',
    'settings.devices.denyAria': 'Deny {name}',
    'settings.devices.pairedTitle': 'Paired devices',
    'settings.devices.lastConnected': '{platform} · Last connected {when}',
    'settings.devices.neverConnected': '{platform} · Not connected yet',
    'settings.devices.remove': 'Remove',
    'settings.devices.removeAria': 'Remove {name}',
    'settings.devices.removeTitle': 'Remove {name}?',
    'settings.devices.removeBody': "It can't reach GAIA on this PC anymore. To use it again, pair it again.",
    'settings.devices.none': 'No devices yet.',
    'settings.devices.offHint': "These devices can't connect while “{label}” is off.",
    'settings.devices.autoRemove.one': "A device that isn't used for {n} day is removed automatically.",
    'settings.devices.autoRemove.other': "A device that isn't used for {n} days is removed automatically.",
    'settings.devices.failedTitle': 'Failed attempts',
    'settings.devices.failedRow': '{when} · {reason} · from {address}',
    'settings.devices.reason.expired': 'Expired code',
    'settings.devices.reason.used': 'Code already used',
    'settings.devices.reason.wrong': 'Wrong code',
    'settings.devices.reason.closed': 'No pairing was open',
    'settings.devices.reason.rateLimited': 'Too many attempts',
    'settings.devices.reset': 'Reset pairing',
    'settings.devices.resetHint': "If a device is lost, or you're not sure who paired, start over: every device is removed and has to pair again.",
    'settings.devices.resetTitle': 'Reset pairing for every device?',
    'settings.devices.resetBody': 'Every phone and tablet is removed, and this PC gets a new security certificate. Each one has to pair again.',
    'settings.devices.resetYes': 'Reset',
    'settings.devices.browserNote': "To open GAIA in a phone's browser instead, use {label}.",
    'settings.devices.platform.ios': 'iPhone',
    'settings.devices.platform.ipados': 'iPad',
    'settings.devices.platform.android': 'Android',
    'sidebar.devicesOn': 'Paired devices can connect',
    'notifications.devices.pairedTitle': 'A device paired with this PC',
    'notifications.devices.pairedBody': '{name} ({platform}) is waiting for you to allow or deny it.',
    'notifications.devices.review': 'Review',
    'notifications.devices.failedTitle': 'Failed attempts to pair',
    'notifications.devices.failedBody.one': 'An attempt to pair with this PC failed.',
    'notifications.devices.failedBody.other': '{n} attempts to pair with this PC failed.',
```

## ar.ts

```ts
    'settings.section.devices': 'الهواتف والأجهزة اللوحية',
    'settings.devices.lede': 'استخدم تطبيق GAIA على هاتفك أو جهازك اللوحي مع هذا الحاسوب. لا تتصل إلا الأجهزة التي تقرنها وتسمح لها هنا.',
    'settings.devices.connect': 'السماح للأجهزة المقترنة بالاتصال',
    'settings.devices.connectHint': 'عبر الشبكة المحلية التي يتصل بها هذا الحاسوب. ما دام متوقفًا لا يمكن لأي جهاز الاتصال، مقترنًا كان أو لا.',
    'settings.devices.portInUse': 'المنفذ {port} يستخدمه تطبيق آخر، لذا لا يمكن للأجهزة الاتصال. أغلق ذلك التطبيق، ثم شغّل هذا الخيار مرة أخرى.',
    'settings.devices.listenFailed': 'لا يمكن للأجهزة الاتصال: {detail}',
    'settings.devices.pair': 'إقران هاتف أو جهاز لوحي',
    'settings.devices.pairOffHint': 'شغّل «{label}» لإقران جهاز.',
    'settings.devices.scan': 'افتح تطبيق GAIA وامسح هذا الرمز. لا يقترن به إلا أول جهاز يمسحه.',
    'settings.devices.expiresIn': 'يتوقف الرمز عن العمل بعد {time}.',
    'settings.devices.qrAlt': 'رمز الاقتران لتطبيق GAIA',
    'settings.devices.cancel': 'إلغاء',
    'settings.devices.expired': 'انتهت صلاحية الرمز قبل أن يستخدمه أي جهاز.',
    'settings.devices.newCode': 'عرض رمز جديد',
    'settings.devices.waitingTitle': 'بانتظار موافقتك',
    'settings.devices.waitingHint': 'لا يمكنه الوصول إلى محادثاتك أو إلى هذا الحاسوب حتى تسمح له.',
    'settings.devices.pairedAt': '{platform} · اقترن {when}',
    'settings.devices.allow': 'السماح',
    'settings.devices.allowAria': 'السماح لـ {name}',
    'settings.devices.deny': 'رفض',
    'settings.devices.denyAria': 'رفض {name}',
    'settings.devices.pairedTitle': 'الأجهزة المقترنة',
    'settings.devices.lastConnected': '{platform} · آخر اتصال {when}',
    'settings.devices.neverConnected': '{platform} · لم يتصل بعد',
    'settings.devices.remove': 'إزالة',
    'settings.devices.removeAria': 'إزالة {name}',
    'settings.devices.removeTitle': 'إزالة {name}؟',
    'settings.devices.removeBody': 'لن يتمكن بعد الآن من الوصول إلى GAIA على هذا الحاسوب. لاستخدامه مجددًا، أقرنه من جديد.',
    'settings.devices.none': 'لا توجد أجهزة بعد.',
    'settings.devices.offHint': 'لا يمكن لهذه الأجهزة الاتصال ما دام «{label}» متوقفًا.',
    'settings.devices.autoRemove.one': 'يُزال تلقائيًا أي جهاز لا يُستخدم مدة يوم واحد.',
    'settings.devices.autoRemove.other': 'يُزال تلقائيًا أي جهاز لا يُستخدم مدة طويلة (عدد الأيام: {n}).',
    'settings.devices.failedTitle': 'محاولات فاشلة',
    'settings.devices.failedRow': '{when} · {reason} · من {address}',
    'settings.devices.reason.expired': 'رمز منتهي الصلاحية',
    'settings.devices.reason.used': 'رمز مستخدم من قبل',
    'settings.devices.reason.wrong': 'رمز غير صحيح',
    'settings.devices.reason.closed': 'لم يكن الاقتران مفتوحًا',
    'settings.devices.reason.rateLimited': 'محاولات كثيرة جدًا',
    'settings.devices.reset': 'إعادة تعيين الاقتران',
    'settings.devices.resetHint': 'إذا فُقد جهاز أو لم تكن متأكدًا ممن أقرن، فابدأ من جديد: تُزال كل الأجهزة ويجب إقرانها مرة أخرى.',
    'settings.devices.resetTitle': 'إعادة تعيين الاقتران لكل الأجهزة؟',
    'settings.devices.resetBody': 'تُزال كل الهواتف والأجهزة اللوحية، ويحصل هذا الحاسوب على شهادة أمان جديدة، ويجب إقران كل جهاز مرة أخرى.',
    'settings.devices.resetYes': 'إعادة التعيين',
    'settings.devices.browserNote': 'لفتح GAIA في متصفح الهاتف بدلًا من ذلك، استخدم {label}.',
    'settings.devices.platform.ios': 'iPhone',
    'settings.devices.platform.ipados': 'iPad',
    'settings.devices.platform.android': 'Android',
    'sidebar.devicesOn': 'يمكن للأجهزة المقترنة الاتصال',
    'notifications.devices.pairedTitle': 'اقترن جهاز بهذا الحاسوب',
    'notifications.devices.pairedBody': '{name} ({platform}) ينتظر أن تسمح له أو ترفضه.',
    'notifications.devices.review': 'مراجعة',
    'notifications.devices.failedTitle': 'محاولات اقتران فاشلة',
    'notifications.devices.failedBody.one': 'فشلت محاولة للاقتران بهذا الحاسوب.',
    'notifications.devices.failedBody.other': 'فشلت محاولات للاقتران بهذا الحاسوب ({n}).',
```

## Wiring

- **Numbers come from `GET /api/devices/status`, never literals:** `{port}` from `port`;
  `autoRemove` takes `n` = `idle_expiry_days`; the pairing window's `{time}` counts down to
  `pairing_expires_at` (or the offer's `exp`); a waiting device counts down to its `expires_at`.
- **Countdowns reuse the permission prompt's:** `formatCountdown` from `PermissionPrompt.tsx`, deadline-
  based, the `perm-card-timer` treatment. A waiting device's timer takes the existing `prompt.timer`
  ("Denied automatically when the time runs out") as its title: same meaning, no new string.
- **Errors:** `error_code` "port in use" shows `portInUse`; any other code shows `listenFailed` with the
  API's `detail`.
- **Reasons:** map the API codes `expired`, `used`, `wrong`, `closed` and `rate_limited` to the
  `reason.*` keys explicitly. An unmapped code is contract drift: show the raw code and log it, never a
  guess.
- **Labels:** `{label}` in `pairOffHint` and `offHint` is `t('settings.devices.connect')`; in
  `browserNote` it's `t('sidebar.mobileAccess')`. `{platform}` is `t('settings.devices.platform.<code>')`.
- **Reused as is:** the notice's Deny button is `notifications.deny`.
- **Direction:** `{name}` in `<bdi>`; `{port}`, `{address}` and `{time}` in `<bdi dir="ltr">`. `{when}`
  is the app's localized relative time and stays in the text's direction.
- **Checks:** `npm run test:rtl` covers the pane in both languages; add the section's scenes to it (empty,
  pairing window open, a device waiting, a failed attempt, port in use, the confirm dialogs, 320 px).
