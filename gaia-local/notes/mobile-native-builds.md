# Native builds for the GAIA app (how, on this Mac)

_2026-11-12, Mobile lane, from SRE's rules (gaia-d3) and Rich's "be frugal with the CPU" (the pause on native builds lifted 2026-11-12). Never committed._

## When

- One dev build per platform (expo-dev-client). Rebuild only when the native fingerprint changes: at the end of a big native change, never per commit. JS work in between runs on the last dev build through Metro.
- One native build at a time on the whole Mac: iOS and Android never together.

## Before a build

1. **Disk:** `df -h /`. Don't start below **25 GiB free**; a build writes 3-5 GB, and Rich's low-water mark is 20.
2. **The app's IDs (Rich, 2026-11-12, final):** `ai.amd.gaia.mobile`, and `ai.amd.gaia.mobile.dev` for dev builds. That's upstream's family, beside the desktop app's `ai.amd.gaia`, committed in `app.config.ts` as ordinary config. The URL scheme is the bundle ID. **Stores are deferred:** dev builds go on agent devices only, with no TestFlight or Play upload and no store account until Rich decides.
3. **Generated native folders:** `npx expo prebuild` writes `ios/` and `android/` inside the app. They're git-ignored (continuous native generation) and never committed.

## Running it

- **Always through the gate, in the background:** `/Users/rapuckett/Projects/gaia/.local/dev/heavy.sh --background <build command>`. Device boots go through `~/.claude/dev-kit/bin/dk-device`. Device tools run under `env -i HOME="$HOME" PATH="$PATH" …`.
- **Cap the cores at `$AGENT_HOST_HEAVY_JOBS` (4).** An uncapped xcodebuild compiles on every core; one held the slot 30+ minutes at load 18.
  - **iOS:** call `xcodebuild` directly, never `expo run:ios` (it opens Simulator.app). Pass `-jobs "$AGENT_HOST_HEAVY_JOBS"` and `-derivedDataPath <scratchpad>/dd`, with `-sdk iphonesimulator`. Install with `xcrun simctl install`, launch with `simctl launch`.
  - **Android:** `./gradlew assembleDebug --max-workers="$AGENT_HOST_HEAVY_JOBS" --no-daemon -Pkotlin.compiler.execution.strategy=in-process`, with `JAVA_HOME` set to Android Studio's bundled JDK 21 (`/Applications/Android Studio.app/Contents/jbr/Contents/Home`). Also cap ninja for React Native's C++ modules (CMake), through a config plugin of our own that reads `AGENT_HOST_HEAVY_JOBS`; agent-host has one, but take the idea, not its file.
  - **No idle Gradle daemon:** `--no-daemon` plus in-process Kotlin means nothing lingers holding memory. Never `./gradlew --stop`: it stops every lane's daemons (the global `mobile-check` skill).
- **Output** goes to the scratchpad and is deleted after: DerivedData, Gradle build output, the export, Maestro output.

## Devices

`mobile-iphone-pro` (the design target), `mobile-ipad` and `mobile-iphone-se`; `mobile-pixel` and `mobile-tablet` (API 36, `hw.keyboard = no`). One at a time, headless; message Release (gaia-92) before a boot, since we share them. Release every device after use (`dk-device --release`).

**The PC side of a device test:** repeatable tests use a dev backend with its own `GAIA_HOME` on ports 4210-4229. Rich's installed GAIA (`/Applications/gaia-desktop.app`, `~/.gaia`) is a development install since 2026-11-12: it may be tested against, restarted or reset, and its data lost. Release owns it, so coordinate with Release first. It runs 0.25.4, which has no device pairing, so a pairing test against it needs a fork build with T1, which Release installs.

## SRE watches

SRE (gaia-d3) watches memory pressure, load, thermal warnings and builds outside the gate. If the cpu-9 kernel panic comes back, SRE stops native builds and tells the Lead and Rich.
