# Mobile idioms (GAIA's phone app)

_Started 2026-11-12. Owner: the Mobile lane. Never committed (the fork keeps team notes in `.local/`)._

This page covers how GAIA's Expo app (`src/gaia/apps/mobile`) must behave on a phone or tablet, iOS and Android, so it feels native rather than like a web page in a frame. Design owns how things look (tokens and the closed `@/ui` library). This page covers how they move, respond and behave. Read it before any change to navigation, input, gestures, sheets or a native feature, and run the `mobile-check` skill before landing one.

It starts from Akira's guide (`~/Projects/agent-host/docs/clients/mobile-idioms.md`), whose rules were all proven on devices. Each rule names the shared piece that will get it right. Most are still **planned**, because the app is a scaffold today. If a rule doesn't answer your question, ask the Mobile lane in one message with your branch name. The answer becomes a new line here.

## Navigation

- **Back is a pop.** The back arrow, Android's system back and the iOS edge swipe all remove the current screen, which slides out the way it came. Back never navigates forward to a parent. Shared piece (planned, `@/ui`): `goBack(fallback)`, which pops when there is history and otherwise replaces with the screen's natural parent.
- **A screen opened cold has a parent.** A notification, a deep link or a web reload can open a chat with no history. Back then goes to the chat list, never nowhere.
- **Push for depth, replace for a switch.** Opening a chat, a setting or a document pushes. Switching PCs, finishing pairing and forgetting a PC replace, so Back never returns to a screen that no longer makes sense. Shared piece (planned): `switchContext(href)`.
- **A short list of choices is a menu; a detour with content is a sheet.** Model, permission mode, retry-with and the message actions are menus. A permission prompt with detail, a change preview, a confirmation and a form are sheets. On a phone a sheet slides up from the bottom; from 600 wide it's a centered dialog. Sheets close with a drag on the handle, a scrim tap, Android back and the VoiceOver escape gesture. Closing one never pushes a screen.
- **Android system back always does something sensible:** it hides the keyboard, then closes the top menu or sheet, then pops, and at the root it leaves the app. It's never swallowed.
- **One modal at a time on iOS.** A sheet opens only after the one before it has fully gone. UIKit silently refuses to present over a leaving view.

## The keyboard

- **The composer stays above the keyboard,** with its send button and the newest message in view, at any text size. Shared piece (planned): `Screen keyboard="avoid"` plus a composer dock. Features never measure the keyboard themselves.
- **Return makes a new line; the send button sends.** Single-line settings fields show Done; the pairing field shows Go.
- **Sending keeps the keyboard up** for the next message. The composer clears its text and never blurs.
- **Dismissal is the platform's:** dragging the transcript puts the keyboard away (it follows the finger on iOS, dismisses on drag on Android), and so does Android back. A conversation that's following new tokens scrolls without dismissing it.
- **Returning to a screen never raises the keyboard.**

## Streamed replies (GAIA-specific)

- **The newest content stays in view while a reply streams,** unless the person scrolled up. Then a "jump to latest" control appears, and streaming never yanks them back down. The web UI's behavior (`test:scroll`) is the parity reference.
- **Agent activity is part of the reply, not a modal.** Tool steps and thinking show inline, collapsed on a phone. A permission request or a question waits as a sheet over the chat, with its countdown visible (the web UI's `PermissionPrompt`).
- **A dropped stream says so.** The stream ending without a `done`, or going silent past its timeout, shows the same error the web UI shows. The app never quietly treats it as a finished answer.

## Right to left (GAIA ships Arabic)

- **Copy comes from the web UI's catalogs** (`src/gaia/apps/webui/src/i18n/locales/{en,ar}.ts`), through the app's `useT`. Direction comes from the locale's `meta.dir`, never a list of language codes of our own.
- **The whole layout mirrors in Arabic,** including back arrows, chevrons, the side a sheet's handle sits on, and the iOS back swipe (from the right edge). Use start and end, never left and right.
- **Numbers with units, file names and model names keep their own direction** inside Arabic text (the web UI wraps them in `<bdi dir="ltr">`; on native, use the registry's `isolate()` or a Text that sets its writing direction). "MB 9.7" is the canonical miss.
- **Check every screen in English and Arabic,** in its real states (empty, streaming, failed, long content, a sheet open), as the web UI's rule requires.

## What the phone can't change (GAIA-specific)

- **Some actions are PC-only by design.** The backend refuses setup, provider keys, Lemonade control, logs, GPU memory, messaging and chat permissions from anything but the PC itself (`require_local_pc`). The app shows those settings read-only with one plain line ("Change this on the PC running GAIA"), never a control that fails when tapped.
- **Offer only what works from a phone.** The CLAUDE.md rule "offer users only what GAIA has proven" applies to the app too: no option appears until it has been checked over the phone's connection.

## Layout and touch

- **Safe areas on all four sides,** landscape included. Content never sits under the notch, the home indicator or a system bar, and Android is edge to edge. Shared piece (planned): `Screen`.
- **Touch targets are at least 48,** through `IconButton` and `Pressable` (planned), never through a bigger icon.
- **Every action has a visible way in.** A swipe, a long press or a hover is only a shortcut. A message's actions (copy, retry, retry with another model, edit, read aloud) are in its menu, which a long press also opens.
- **A phone on its side keeps the phone's layout.** Below 1024 wide, the session panel and the side panels become sheets or screens. Nothing scrolls sideways at any width: long names truncate and rows wrap.

## Native features

- **Ask for a permission at the moment of use, never at launch:** the camera when the person scans the pairing code, notifications after pairing and something worth notifying, with one quiet line before the system prompt. Prefer pickers that need no permission (PHPicker, Android's Photo Picker).
- **The phone's own files go through the system** (pickers, the share sheet, QuickLook or a viewer). The PC's folders and files are shown as GAIA lists them; the app never shows a phone path.
- **Push carries no content** (when push exists). The text is fetched from the PC over the pinned connection, or the notification stays generic.
- **Credentials stay below the UI.** The device token lives in the Keychain or Keystore, and only the native transport reads it. It never enters JavaScript, logs or screenshots.

## Open findings (need a real device to confirm)

- **Web UI on Android Chrome: the keyboard may cover the composer** (2026-11-12, read from the code). `index.html`'s viewport meta has no `interactive-widget=resizes-content`. Since Chrome 108 the keyboard then resizes only the visual viewport, so a layout sized with `100dvh` doesn't shrink and the bottom-docked composer can sit behind the keyboard. The fix is one attribute, but it needs an Android device or emulator to confirm, and those wait for native work to be allowed. iOS Safari scrolls the focused field into view itself. Inputs are already 16px on phones, so iOS doesn't zoom on focus.
- **Web UI on iOS: the safe-area paddings do nothing** (2026-11-12, read from the code). With no `viewport-fit=cover`, `env(safe-area-inset-*)` is 0, so the paddings in `ChatView.css` and `guide.css` have no effect. That's harmless while the page stays inside the safe area. Confirm on an iPhone in standalone (home-screen) mode before changing anything.

## How it's checked

- **Tests:** only material ones (Rich, 2026-11-12): a shared behavior with real branches, a contract or a bug that shipped. No snapshots of trivial rendering, no tests of config.
- **Native builds are allowed again (Rich, 2026-11-12), frugally:** one dev build per platform, rebuilt only when the native fingerprint changes (at the end of a big native change, never per commit), one at a time through the gate. JS work in between runs on the last dev build through Metro. The generated `ios/` and `android/` folders and all build output stay out of git.
- **Device checks:** the `mobile-check` skill on `mobile-iphone-pro` (the design target), `mobile-ipad` and `mobile-pixel`, with the on-screen keyboard forced on (the AVDs have `hw.keyboard = no`), plus a smoke pass on `mobile-iphone-se` and `mobile-tablet`. One `mobile-*` device at a time, through `dk-device`, headless. Release shares them, so check with Release before a boot.
- **Browser checks** (headless Playwright WebKit and Chromium at 320, 390 and 768 wide) still cover the web UI, the mobile-web path. They prove layout, overflow, touch-target size, RTL mirroring and text, but not the soft keyboard, system back, safe areas, sheets' native gestures or the edge swipe. Say so in every report.
- **Review:** a change to navigation, input, gestures, sheets or a native feature names the Mobile lane once; the review comes back as one set of findings, marked broken or polish.
