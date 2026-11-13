# Pairing phones and tablets: the web UI's Settings section (Design proposal, 2026-11-12)

**Decided 2026-11-12:** Rich picked the three recommended names and the Review-and-Deny notice. The final
strings, with Mobile's reason codes and API fields, are in `2026-11-12-device-pairing-strings.md`; where
it differs from the table below (no "denied" reason, no fixed countdown), it wins.

For Mobile (gaia-d4) and the Lead (gaia-07). Rich picks the three names below; every other string
follows from them. Backend: branch `mobile/phone-pairing`. Copy goes into
`src/gaia/apps/webui/src/i18n/locales/{en,ar}.ts` under `settings.devices.*`, `sidebar.devicesOn`
and `notifications.devices.*`. Numbers (minutes, days, port) come from the backend, never literals.

## For Rich: three names

| | Recommended | Alternatives |
| --- | --- | --- |
| 1. The section | **Phones and tablets** · الهواتف والأجهزة اللوحية | Paired devices · الأجهزة المقترنة; GAIA app · تطبيق GAIA |
| 2. The network switch | **Allow paired devices to connect** · السماح للأجهزة المقترنة بالاتصال | Local network access · الاتصال عبر الشبكة المحلية; Connections from this network · الاتصالات من هذه الشبكة |
| 3. The reset | **Reset pairing** · إعادة تعيين الاقتران | Remove all devices · إزالة كل الأجهزة |

Why these: "Mobile access" (the ngrok link) and "Phone access" (the session panel) are already taken,
and in Arabic both are the same phrase, الوصول من الهاتف, so the recommended names avoid "access" and
الوصول altogether. "Phones and tablets" says what it is and fits tablets; the switch says what turning it
on allows; "Reset pairing" names a start-over, which is what a new certificate means to a person.

## Where it lives

- **The section** (`devices`) sits after Messaging in Settings: both are ways to reach GAIA from a phone.
  It's in the list only while `device_pairing` is on. When it's off, nothing anywhere mentions it,
  links to it or hints at it: no empty state, no "coming soon" (must-have).
- **Always visible while devices can connect** (must-have): an icon button in the sidebar footer beside
  Mobile access, and on the collapsed rail (lucide `TabletSmartphone`), present only while the switch is
  on and the port is listening. Its label and tooltip: "Paired devices can connect". Its presence is the
  signal, so it never relies on color; clicking it opens the section. This copies how Mobile access
  shows it's on.
- **Notice when a device pairs** (must-have): a Security notification in the notification center, and
  an OS notification from the desktop app: "A device paired with this PC", with **Review** (opens the
  section on that device) and **Deny**. No Allow in the notice: allowing is a deliberate step in the
  section, with the device's name, platform and time in view. A burst of failed attempts raises a
  Security notice too.

## The pane, top to bottom (main's building blocks)

```
Phones and tablets                                   settings-pane-title
Use the GAIA app on your phone or tablet with this   settings-pane-lede
PC. Only devices you pair and allow here can connect.
┌──────────────────────────────────────────────────┐
│ Allow paired devices to connect          [ ●  ]  │ settings-row-between + switch
│ Over the local network this PC is on. While it's │ settings-hint
│ off, nothing can connect, paired or not.         │
│ ⚠ Port {port} is in use by another app ...       │ settings-error (only then)
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ [ Pair a phone or tablet ]                       │ btn-primary (the pane's one)
│   ┌──────────┐  Open the GAIA app and scan this  │ pairing window, opens in place:
│   │ ▓▓ QR ▓▓ │  code. Only the first device to   │ QR on a white plate in both themes
│   │ ▓▓▓▓▓▓▓▓ │  scan it can pair.                │
│   └──────────┘  The code stops working in 4:59.  │ countdown, m:ss in <bdi dir="ltr">
│                 [ Cancel ]                       │ btn-secondary
└──────────────────────────────────────────────────┘
┌ Waiting for your OK ─────────────────────────────┐ only while one waits
│ ⏳ Rich's iPhone            [ Allow ] [ Deny ]    │ name in <bdi>; Allow btn-primary
│    iOS · Paired 1 minute ago                     │
│ It can't reach your chats or this PC until you   │
│ allow it.                                        │
└──────────────────────────────────────────────────┘
┌ Paired devices ──────────────────────────────────┐
│ Rich's iPad                           [ Remove ] │ btn-secondary; confirm dialog
│ iPadOS · Last connected yesterday                │
│ A device that isn't used for 90 days is removed  │ settings-hint (the quiet line)
│ automatically.                                   │
└──────────────────────────────────────────────────┘
┌ Failed attempts ─────────────────────────────────┐ only when there are some
│ ⚠ Today 14:02 · Expired code · from 192.168.1.23 │ icon + words, neutral text
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ [ Reset pairing ]                                │ danger button, confirm dialog
│ If a device is lost, or you're not sure who      │ settings-hint
│ paired, start over: every device is removed and  │
│ has to pair again.                               │
└──────────────────────────────────────────────────┘
To open GAIA in a phone's browser instead, use Mobile access.   settings-note
```

- **States.** Switch off: Pair is disabled with its reason ("Turn on … to pair a device"), and the
  paired list says its devices can't connect. The pairing window clears its QR the moment the first
  device pairs (must-have), closes, and the device appears under "Waiting for your OK". On expiry the
  QR clears and offers "Show a new code".
- **Phone widths** (the Settings sheet at ≤768 px): cards stack; the QR is 200 px, centered above its
  text; at ≤480 px a row's buttons drop below its text, full width, 44 px tall.
- **Motion:** the pairing window opens with the height transition (`--duration-slow`, `--ease`); a
  waiting or removed device fades and slides in or out (`--duration`, `--ease`), and its neighbors
  move. With reduced motion, only the fades are left.
- **Accessibility:** the QR's alt text names it; the countdown is announced politely at the start,
  each minute and at expiry, never every second; a new waiting device is announced as a status;
  Allow, Deny and Remove carry the device's name in their labels; the confirm dialogs are the app's
  existing ones (focus trapped, Escape cancels).
- **Arabic:** device names in `<bdi>`; the countdown, port, address and times in `<bdi dir="ltr">`;
  platform names stay Latin. In this section, "this PC" is هذا الحاسوب, not the catalog's usual
  هذا الجهاز, because here الجهاز means the phone or tablet ("a device paired with this device" would
  be unreadable).
- **Color:** no status hue carries meaning alone. Waiting rows have an icon and words; failed attempts
  are neutral text with the alert icon (an expired code is usually you); red is only on the Remove and
  Reset confirmations, which are destructive.

## Every string

| Key | English | Arabic |
| --- | --- | --- |
| `settings.section.devices` | Phones and tablets | الهواتف والأجهزة اللوحية |
| `settings.devices.lede` | Use the GAIA app on your phone or tablet with this PC. Only devices you pair and allow here can connect. | استخدم تطبيق GAIA على هاتفك أو جهازك اللوحي مع هذا الحاسوب. لا تتصل إلا الأجهزة التي تقرنها وتسمح لها هنا. |
| `settings.devices.connect` | Allow paired devices to connect | السماح للأجهزة المقترنة بالاتصال |
| `settings.devices.connectHint` | Over the local network this PC is on. While it's off, nothing can connect, paired or not. | عبر الشبكة المحلية التي يتصل بها هذا الحاسوب. ما دام متوقفًا لا يمكن لأي جهاز الاتصال، مقترنًا كان أو لا. |
| `settings.devices.portInUse` | Port {port} is in use by another app, so devices can't connect. Close that app, then turn this on again. | المنفذ {port} يستخدمه تطبيق آخر، لذا لا يمكن للأجهزة الاتصال. أغلق ذلك التطبيق، ثم شغّل هذا الخيار مرة أخرى. |
| `settings.devices.pair` | Pair a phone or tablet | إقران هاتف أو جهاز لوحي |
| `settings.devices.pairOffHint` | Turn on “{label}” to pair a device. | شغّل «{label}» لإقران جهاز. |
| `settings.devices.scan` | Open the GAIA app and scan this code. Only the first device to scan it can pair. | افتح تطبيق GAIA وامسح هذا الرمز. لا يقترن به إلا أول جهاز يمسحه. |
| `settings.devices.expiresIn` | The code stops working in {time}. | يتوقف الرمز عن العمل بعد {time}. |
| `settings.devices.qrAlt` | Pairing code for the GAIA app | رمز الاقتران لتطبيق GAIA |
| `settings.devices.cancel` | Cancel | إلغاء |
| `settings.devices.expired` | The code expired before a device used it. | انتهت صلاحية الرمز قبل أن يستخدمه أي جهاز. |
| `settings.devices.newCode` | Show a new code | عرض رمز جديد |
| `settings.devices.waitingTitle` | Waiting for your OK | بانتظار موافقتك |
| `settings.devices.waitingHint` | It can't reach your chats or this PC until you allow it. | لا يمكنه الوصول إلى محادثاتك أو إلى هذا الحاسوب حتى تسمح له. |
| `settings.devices.pairedAt` | {platform} · Paired {when} | {platform} · اقترن {when} |
| `settings.devices.allow` / `allowAria` | Allow / Allow {name} | السماح / السماح لـ {name} |
| `settings.devices.deny` / `denyAria` | Deny / Deny {name} | رفض / رفض {name} |
| `settings.devices.pairedTitle` | Paired devices | الأجهزة المقترنة |
| `settings.devices.lastConnected` | {platform} · Last connected {when} | {platform} · آخر اتصال {when} |
| `settings.devices.neverConnected` | {platform} · Not connected yet | {platform} · لم يتصل بعد |
| `settings.devices.remove` / `removeAria` | Remove / Remove {name} | إزالة / إزالة {name} |
| `settings.devices.removeTitle` | Remove {name}? | إزالة {name}؟ |
| `settings.devices.removeBody` | It can't reach GAIA on this PC anymore. To use it again, pair it again. | لن يتمكن بعد الآن من الوصول إلى GAIA على هذا الحاسوب. لاستخدامه مجددًا، أقرنه من جديد. |
| `settings.devices.none` | No devices yet. | لا توجد أجهزة بعد. |
| `settings.devices.offHint` | These devices can't connect while “{label}” is off. | لا يمكن لهذه الأجهزة الاتصال ما دام «{label}» متوقفًا. |
| `settings.devices.autoRemove.*` (t.plural) | one: A device that isn't used for {n} day is removed automatically. other: … for {n} days … | one: يُزال تلقائيًا أي جهاز لا يُستخدم مدة يوم واحد. two: … مدة يومين. few: … مدة {n} أيام. many: … مدة {n} يومًا. other: … مدة {n} يوم. |
| `settings.devices.failedTitle` | Failed attempts | محاولات فاشلة |
| `settings.devices.failedRow` | {when} · {reason} · from {address} | {when} · {reason} · من {address} |
| `settings.devices.reason.expired` | Expired code | رمز منتهي الصلاحية |
| `settings.devices.reason.used` | Code already used | رمز مستخدم من قبل |
| `settings.devices.reason.wrong` | Wrong code | رمز غير صحيح |
| `settings.devices.reason.denied` | Denied on this PC | مرفوض على هذا الحاسوب |
| `settings.devices.reset` | Reset pairing | إعادة تعيين الاقتران |
| `settings.devices.resetHint` | If a device is lost, or you're not sure who paired, start over: every device is removed and has to pair again. | إذا فُقد جهاز أو لم تكن متأكدًا ممن أقرن، فابدأ من جديد: تُزال كل الأجهزة ويجب إقرانها مرة أخرى. |
| `settings.devices.resetTitle` | Reset pairing for every device? | إعادة تعيين الاقتران لكل الأجهزة؟ |
| `settings.devices.resetBody` | Every phone and tablet is removed, and this PC gets a new security certificate. Each one has to pair again. | تُزال كل الهواتف والأجهزة اللوحية، ويحصل هذا الحاسوب على شهادة أمان جديدة، ويجب إقران كل جهاز مرة أخرى. |
| `settings.devices.resetYes` | Reset | إعادة التعيين |
| `settings.devices.browserNote` | To open GAIA in a phone's browser instead, use {label}. | لفتح GAIA في متصفح الهاتف بدلًا من ذلك، استخدم {label}. |
| `sidebar.devicesOn` | Paired devices can connect | يمكن للأجهزة المقترنة الاتصال |
| `notifications.devices.pairedTitle` | A device paired with this PC | اقترن جهاز بهذا الحاسوب |
| `notifications.devices.pairedBody` | {name} ({platform}) is waiting for you to allow or deny it. | {name} ({platform}) ينتظر أن تسمح له أو ترفضه. |
| `notifications.devices.review` | Review | مراجعة |
| `notifications.devices.failedTitle` | Failed attempts to pair | محاولات اقتران فاشلة |
| `notifications.devices.failedBody.*` (t.plural) | one: An attempt to pair with this PC failed. other: {n} attempts to pair with this PC failed. | one: فشلت محاولة للاقتران بهذا الحاسوب. two: فشلت محاولتان للاقتران بهذا الحاسوب. few: فشلت {n} محاولات للاقتران بهذا الحاسوب. many: فشلت {n} محاولة للاقتران بهذا الحاسوب. other: فشلت {n} محاولة للاقتران بهذا الحاسوب. |

`{label}` in `pairOffHint` and `offHint` is `settings.devices.connect`; in `browserNote` it's
`sidebar.mobileAccess`, so a rename carries through.

## Questions for Mobile

1. Does a waiting device time out if nobody answers? If so, the row gets the permission prompt's
   pattern: a countdown and "Denied automatically when the time runs out".
2. Does the backend send the failed attempt's address and a reason code (expired, used, wrong, denied)?
   The rows assume both.
3. The pairing window's length, the auto-removal days and the port come from the API as numbers;
   which fields?
