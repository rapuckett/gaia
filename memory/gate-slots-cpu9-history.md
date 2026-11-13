---
name: gate-slots-cpu9-history
description: "Read agent-host's panic record before proposing more heavy-gate slots; one slot exists because cpu 9 is marginal"
metadata:
  node_type: memory
  type: reference
  originSessionId: 02deb33f-fd8e-4685-9c7e-8dd828369be6
  modified: 2026-11-12T23:27:44.447Z
---

Before proposing any change to the heavy gate's slot count or ceilings, read agent-host's `docs/dev/testing.md`, section "Load on this Mac", and the comment above `SLOTS=` in dev-kit's `bin/dk-heavy`.

The record: seven-plus kernel panics, all on cpu 9. Four came on 2026-10-11 at load 30 to 68 under two slots, and the gate went to one slot on 2026-10-16. The near-idle panics since then (2026-10-30 and 2026-11-10) mean load isn't the only trigger, not that load is safe: the core is "a marginal core that bursts of load make worse".

**Why:** on 2026-11-12 I read dev-kit's README line "a hardware fault on cpu 9 that also happen near idle" as "not load", and told two Leads that, before I found the full record and corrected it.

**How to apply:** prefer using idle cores inside the one slot (`AGENT_HOST_HEAVY_JOBS`, 4) over adding slots. agent-host keeps its own copy of the gate (`scripts/dev/heavy.sh`), so a slot change has to go into both. Related: [[gaia-gate-node-and-landing]].
