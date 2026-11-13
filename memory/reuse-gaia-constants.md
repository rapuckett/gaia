---
name: reuse-gaia-constants
description: "In gaia work (mobile app especially), import or generate from GAIA's existing constants, i18n catalogs and schemas; never hardcode a string GAIA already defines"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b94a7fde-791c-462d-8673-316b6b771814
  modified: 2026-11-12T22:52:30.721Z
---

Never hardcode a string or value that GAIA already defines; import it or generate from its source (Rich, 2026-11-12).

**Why:** the fork's mobile app must track upstream GAIA; copied literals (model names, copy, URLs, enums) drift silently as upstream moves fast.

**How to apply:** sources are the webui i18n catalogs (`i18n/locales/{en,ar}.ts`), `types/api.schemas.json` via `gen:api-types`, `utils/constants.ts` and `utils/apiBase.ts`, Python `gaia.config` / `gaia.llm.lemonade_client` / `gaia.ui.models`, and runtime `/api/system/status`. Generated copies get a `--check` in verify.sh; anything that can't be imported gets a drift test. The full list is in the create-team gaia overlay (`~/.claude/skills/create-team/projects/gaia.md`, Shared facts). Put it in every sub-agent brief and reject duplicated literals in review.
