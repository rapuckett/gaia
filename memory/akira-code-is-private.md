---
name: akira-code-is-private
description: "Akira (~/Projects/agent-host, GitHub extropolis/akira) is a private repo, so copying its code into the public gaia fork would publish it"
metadata:
  node_type: memory
  type: project
  originSessionId: 87755532-a893-4faf-bbd5-d4c7467bb0a4
  modified: 2026-11-12T22:58:56.838Z
---

Akira, the reference app the GAIA mobile work "reuses patterns" from, lives at `~/Projects/agent-host` and its remote is `extropolis/akira`. That repo is **private** (checked 2026-11-12 with `gh repo view`) and has no LICENSE file. The gaia fork (`rapuckett/gaia`) is public and MIT.

**Why:** copying Akira's files (the native transport module, pairing, the relay, the UI library) into the gaia fork would publish proprietary code. That's a publishing decision for Rich. The transport options note (`.local/notes/2026-11-12-mobile-transport-options.md`, decision 4) recommends writing GAIA's own code from Akira's design instead.

**How to apply:** in gaia, reuse Akira's *design and test cases* (pinned TLS, device tokens, the conformance-case list, the idioms), never its source files, unless Rich has said otherwise. Put that rule in every sub-agent brief that points at agent-host. Akira's native transport also has no streamed-response call, and GAIA's chat needs one for SSE. Related: [[gaia-mobile-transport-decision]].
