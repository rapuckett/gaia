---
name: gaia-sprint-recording
description: "In gaia's mobile-parity sprint, record each sub-agent run against the sprint item's estimator id, never a fresh forecast"
metadata:
  node_type: memory
  type: project
  originSessionId: 87755532-a893-4faf-bbd5-d4c7467bb0a4
  modified: 2026-11-13T00:14:21.684Z
---

Since 2026-11-12, gaia's phone-app work runs as the estimator sprint `mobile-parity` (`/Users/rapuckett/Projects/gaia/.local/notes/2026-11-12-mobile-parity-sprint.md`, 222 tasks, each with an `est. id`, dependencies and size; Mobile has 109). The Lead set the rule.

**Why:** the sprint burns down only when runs are recorded against its own plan items. A fresh `forecast --record` makes a second, orphaned record that the burndown never closes. I dropped two such pre-sprint forecasts (`078af49d`, `4d774ebc`) for that reason.

**How to apply:** at dispatch, don't forecast. When the run finishes, use `node /Users/rapuckett/Projects/gaia/.local/dev/estimate.mjs actual <sprint est id> --agent <agentId>`. When one sub-agent run covers several sprint items (the T1 builder did), record it once against the main item and tell the Lead which other items it closed, rather than inventing per-item token splits. Brief builders with `/Users/rapuckett/Projects/gaia/.local/notes/subagent-brief-common.md`. Work the queue in dependency order, up to 3 builders, sending each branch to the Lead when it's ready to land, without waiting between tasks.
