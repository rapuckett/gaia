---
name: shared-memory-dir
description: "Every gaia lane session shares this one memory directory - add to MEMORY.md with Edit, never rewrite it with Write"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 64ce907e-adb5-4898-816f-81d54e1da246
  modified: 2026-11-12T22:57:25.903Z
---

All gaia lanes (lead, design, mobile, sre, parity, release) run from `/Users/rapuckett/Projects/gaia`, so they share this memory directory and its single `MEMORY.md` index.

**Why:** on 2026-11-12 Parity rewrote `MEMORY.md` with Write, which dropped the index lines of six other lanes' memories (the files survived; the index lines were rebuilt from their frontmatter).

**How to apply:** read `MEMORY.md` right before changing it and add or edit single lines with Edit; prefix new memory files with the lane (`release-…`, `parity-…`) so ownership is clear. Related: [[parity-lane-setup]].
