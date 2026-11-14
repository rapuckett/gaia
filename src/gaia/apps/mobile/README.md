# GAIA mobile

The native (Expo, React Native) phone app for the GAIA Agent UI. It talks to a
GAIA PC over the same `/api/*` routes and SSE chat stream the web Agent UI uses.
This folder is the scaffold: toolchain, API client, i18n and tests. Screens come
next.

```bash
npm install
npm run typecheck
npm run lint
npm test                                  # jest: ios, android and web projects
APP_ENV=development npm run export:web    # expo export --platform web
```

Layout: `src/app` (thin routes), `src/features` (one folder per screen),
`src/api` (`GaiaClient`), `src/data` (TanStack Query), `src/state` (zustand),
`src/platform` (file trios: `x.types.ts`, `x.ts`, `x.web.ts`), `src/i18n`,
`src/ui` (owned by Design).

Strings, types and locale metadata are not copied: the app imports them from the
web Agent UI through the `@webui/*` alias (`../webui/src/*`), type-only for
`@webui/types` and the pure translator for `@webui/i18n/registry`. New app copy
goes into the webui catalogs under a `mobileApp.` key, in English and Arabic.

## Native builds

The app runs as a development build (`expo-dev-client`), not in Expo Go. Every
native module it uses is installed up front, so JS changes reach a built app over
Metro; only a change that moves the native fingerprint needs a new build.

- **`APP_ENV` is required** by every Expo command (`start`, `export`, `prebuild`,
  `install`, `expo-doctor`). `@expo/fingerprint` doesn't fail without it: it
  silently hashes without the config, so set it there too. `development` builds
  `ai.amd.gaia.mobile.dev` and `production` builds `ai.amd.gaia.mobile`; the URL
  scheme is the same id.
- **`ios/` and `android/` are generated** by `npx expo prebuild` from
  `app.config.ts` and `plugins/`, and never committed.
- **Plain HTTP is for development only, and stays local:** iOS allows the local
  network, Android only `10.0.2.2` (the emulator's alias for this computer),
  `127.0.0.1` and `localhost`. On the Android emulator, reach Metro at `10.0.2.2`,
  or at `localhost` through `adb reverse`; a LAN address is refused. Production
  refuses plain HTTP.
- **Android C++ compiles** run at most `AGENT_HOST_HEAVY_JOBS` (default 4) at a
  time in each module.
- **The fingerprint a build must match:**
  `APP_ENV=development npx @expo/fingerprint fingerprint:generate . --platform ios`
  (or `android`). npm scripts and `.gitignore` don't count (`fingerprint.config.js`).
