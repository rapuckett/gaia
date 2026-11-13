# GAIA mobile

The native (Expo, React Native) phone app for the GAIA Agent UI. It talks to a
GAIA PC over the same `/api/*` routes and SSE chat stream the web Agent UI uses.
This folder is the scaffold: toolchain, API client, i18n and tests. Screens come
next.

JS-only for now: native builds (`expo prebuild`, `expo run:*`) are not set up yet.

```bash
npm install
npm run typecheck
npm run lint
npm test                      # jest: ios, android and web projects
npm run export:web            # expo export --platform web
```

Layout: `src/app` (thin routes), `src/features` (one folder per screen),
`src/api` (`GaiaClient`), `src/data` (TanStack Query), `src/state` (zustand),
`src/platform` (file trios: `x.types.ts`, `x.ts`, `x.web.ts`), `src/i18n`,
`src/ui` (owned by Design).

Strings, types and locale metadata are not copied: the app imports them from the
web Agent UI through the `@webui/*` alias (`../webui/src/*`), type-only for
`@webui/types` and the pure translator for `@webui/i18n/registry`. New app copy
goes into the webui catalogs under a `mobileApp.` key, in English and Arabic.
