#!/usr/bin/env bash
# Builds the shared push Swift with Tests/main.swift on macOS and checks it against the JS test vectors.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
fixtures="$here/../../../../src/features/push/__fixtures__"
out="$(mktemp -d "${TMPDIR:-/tmp}/gaia-push-swift.XXXXXX")"
trap 'rm -rf "$out"' EXIT
xcrun swiftc -O -o "$out/check" "$here"/../Shared/*.swift "$here/main.swift"
"$out/check" "$fixtures/push-vector.json" "$fixtures/push-vector-parity.json"
