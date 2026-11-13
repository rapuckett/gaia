---
name: frugal-unit-tests
description: Add unit tests only when they test material functionality; Rich says the team historically writes too many
metadata:
  node_type: memory
  type: feedback
  originSessionId: b94a7fde-791c-462d-8673-316b6b771814
  modified: 2026-11-12T23:56:49.849Z
---

Be frugal with unit tests: add one only when it tests material functionality (Rich, 2026-11-12: "Historically we create too many unit tests").

**Why:** surplus tests cost tokens, gate time on a CPU-constrained Mac, and maintenance, without catching real regressions.

**How to apply:** test contracts, security invariants, shipped bugs and logic with real branches; skip tests that restate code, check constants, assert mocks were called, or snapshot trivial UI. Prefer one behavior-level test over several per-function ones. Put this in every sub-agent brief and cut non-material tests in review. Overlay: `~/.claude/skills/create-team/projects/gaia.md` (Shared facts). Related: [[reuse-gaia-constants]].
