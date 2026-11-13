---
name: gaia-disk-floors
description: SRE disk policy for the shared Mac (Data volume free-space floors) and the 2026-11-12 baseline
metadata:
  node_type: memory
  type: project
  originSessionId: 02deb33f-fd8e-4685-9c7e-8dd828369be6
  modified: 2026-11-12T23:21:51.039Z
---

Disk is the machine's main risk. On 2026-11-12 the Data volume was 95% full: 48 GiB free at 14:40 and 46 GiB at 14:47. The big users aren't gaia's: ~/.ollama 47G, CoreSimulator/Devices 40G, ~/.cache/huggingface 36G (Rich's GAIA models), DerivedData 26G, ~/.npm 21G, ~/.gradle 18G. A gaia worktree adds 0.3-1 GB, the .venv 0.45 GB.

Floors, as Rich confirmed on 2026-11-12 ("20 GiB free is the low-water mark"; he picked 20 / 15 / 10 over the stricter 40 / 25 / 15 I set at start-up):
- Below 20 GiB free: no model downloads or new browser/runtime installs, landed worktrees are pruned the same day, and SRE asks the other teams to prune too.
- Below 15 GiB: no new worktrees or npm ci, landings only, and SRE files Rich a task listing the caches only he can clear (Ollama, simulators, DerivedData, HF cache).
- Below 10 GiB: stop the line.

**Why:** one Qwen3.6-35B pull costs 23 GB, and on the first afternoon free space fell about 5 GiB an hour during team setup. Each tier leaves about an hour of that drain to react in.

**How to apply:** check `df -h /System/Volumes/Data` before any model download or worktree fan-out, since model downloads and installs on Rich's side need SRE's OK. The load monitor records no free space, so keep a sampler running that alerts at 22 GiB; see [[gaia-sre-start-up]].
