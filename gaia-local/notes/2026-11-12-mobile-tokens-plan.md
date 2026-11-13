# Mobile app tokens: plan (Design, 2026-11-12)

The React Native app (`src/gaia/apps/mobile`, scaffolded by Mobile) is GAIA's fourth surface after the
website, the Agent UI and the TUI. It implements the contract in `docs/spec/gaia-design-language.mdx`
(roles, contrast floors, status hues, "add a role, not a literal") with the Agent UI's palette, and the
phone patterns in `docs/spec/mobile-design-system.md` (drawer for the chat list, panels as sheets,
44 px targets, voice beside Send). Rich's rule (2026-11-12): tokens are generated from upstream's CSS
with a `--check`, never hand-copied.

## Sources and what is generated

`scripts/gen-tokens.mjs` reads `../webui/src/styles/index.css` and `palettes.css` and writes
`src/ui/tokens/generated.ts` (header: generated, do not edit, with the source paths).

| Group | From | Output |
| --- | --- | --- |
| Color roles | `:root` (light) and `[data-theme="dark"]` in index.css | `base.light`, `base.dark`: every `--bg-*`, `--text-*`, `--border*`, `--accent*`, `--danger*`, `--tint-*`, `--code-*`, `--switch-knob` as camelCase roles |
| Palettes | the 16 `:root[data-palette=X]` blocks in palettes.css | `palettes[X].light/.dark`: overrides merged over `base` (status, code surfaces and shadows stay shared, as upstream says) |
| Shadows | `--shadow-sm/md/lg/press` per theme | CSS strings, used as RN `boxShadow` (inset and rings supported on the new architecture) |
| Radius | `--radius-*` | numbers |
| Type | `--fs-*` | upstream's role sizes as numbers (the phone scale is applied in `src/ui/text`, not here) |
| Faces | `--font-sans/mono/display/greeting` | the first family of each stack; `--font-display` resolves its `var()` |
| Layout | `--sidebar-w`, `--content-w` | numbers (drawer width, reading width on tablets) |
| Motion | `--ease*`, `--duration-*`, `--stagger`, `--toast-hold` | bezier tuples for Reanimated, milliseconds |

Ignored, each with its reason in the script: `--titlebar-h`, `--titlebar-controls-w`,
`--sidebar-toggle-clearance` (desktop window chrome and the web's hamburger offset).

## Fails loudly

- A color role declared in light but not dark, or the reverse (upstream's own rule in index.css).
- A palette overriding a role the base doesn't declare.
- A custom property the script neither maps nor ignores: a new upstream token needs a decision.
- A value it can't parse.
- `--check`: regenerates in memory and diffs with the committed file; a difference exits 1 with
  "tokens are stale: upstream's CSS changed; run `npm run gen:tokens`". Wired into `verify.sh` by the Lead.

## Read from outside the token blocks, in the same generator

- Arabic: `:root[lang="ar"] #root { line-height: 1.7 }` and prose/composer `line-height: 1.85` in RTL.
- Touch targets: 44 px (`.btn-icon` at ≤768 px) and 16 px input text (stops iOS zoom).

The generator reads these rules from index.css as well and writes them into `generated.ts`, so the one
`--check` covers them. That's the only test the tokens get (Rich, 2026-11-12: be frugal with unit tests);
no test per token or per value.

## Imported, not copied

`deriveCustomTokens`, `contrast`, `PALETTES` and `DEFAULT_CUSTOM` from `../webui/src/utils/palette.ts`
are pure; only `applyPalette` touches the DOM. Import them (needs a Metro watch folder and a tsconfig
path for the web UI's `src`: Mobile's config, ask them).

## Phone type scale (Design decision)

Each upstream role plus 2 pt on phones lands on Apple's text styles: caption 11→13 (footnote),
label 12→14, ui 13→15 (subheadline), body 14→16 (callout), prose 15→17 (body), title 18→20 (title3).
Font scaling follows the system setting. Applied in `src/ui/text` as a rule over the generated sizes,
so an upstream size change carries through.

## Arabic's English glosses (parity, not a change)

Main's Arabic shows each message's English in brackets after it (`showEnglishInBrackets` in ar.ts,
`glossParts()` in `i18n/registry.ts`), styled smaller and muted by `.i18n-gloss`, which keeps the gloss
whole: "a clipped row drops it instead of cutting it mid-word". The app's `src/ui/text` does the same:
the gloss renders as its own direction-isolated span in the muted role, at max(0.8×, the caption size),
and a single-line control (button, chip, tab, menu item, row title) drops the gloss first when the line
runs out of room. That matches the reference (matrix APP-11), so it needs no decision from Rich.

## Fonts

Inter, JetBrains Mono and Fraunces (300) through `@expo-google-fonts/*` (TTF; the web's woff2 subsets
don't load on native). Arabic falls back to the system's Arabic face, as on the web.
