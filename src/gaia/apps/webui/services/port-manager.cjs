// Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * port-manager.cjs — Owns port allocation, backend termination, and
 * diagnostics bundle writing for the GAIA Agent UI.
 *
 * Extracted from main.cjs (issue #782 / T5) so main.cjs stays lean and
 * the probe-and-reuse mistake cannot reappear. The correct pattern is
 * "always spawn on a free random port" — if reuse is ever added later
 * it must require a nonce + UID ownership match, not a bare service-string
 * compare.
 *
 * Pure CommonJS, Node built-ins only (no Electron imports) so it can be
 * unit-tested without an Electron runtime.
 */

"use strict";

const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { killProcessTree } = require("./process-tree.cjs");
const { redact, envSecrets } = require("./redact.cjs");

const BACKEND_KILL_GRACE_MS = 3000;
const BACKEND_FORCE_WAIT_MS = 1000;

/**
 * Resolve the GAIA home directory lazily so tests can point it elsewhere
 * via the `GAIA_HOME_OVERRIDE` env var without re-requiring the module.
 */
function gaiaHome() {
  return process.env.GAIA_HOME_OVERRIDE || path.join(os.homedir(), ".gaia");
}

/**
 * Ask the kernel for a free TCP port by binding to port 0, reading the
 * assigned port, and closing. There is an unavoidable TOCTOU window —
 * the backend process has to (re-)bind immediately or another process
 * on the box can race in. In practice the window is <10 ms and the
 * backend binds on startup, so this is the standard pattern.
 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((err) => {
        if (err) return reject(err);
        resolve(port);
      });
    });
  });
}

/**
 * Terminate a spawned backend and everything it started: SIGTERM the tree,
 * wait up to 3 s, then SIGKILL what is left. Without the tree walk, killing
 * the uv `gaia.exe` launcher on Windows left its Python running.
 * Accepts either a ChildProcess reference (preferred — lets us
 * short-circuit via `exitCode` so PID reuse can never hit us) or a raw
 * pid (the orphan cleanup and tests). Safe to call with nullish.
 */
async function killBackend(procOrPid, logger) {
  const log = (logger && logger.log) || console.log;
  const logError = (logger && logger.error) || console.error;
  if (!procOrPid) return;
  const proc = typeof procOrPid === "object" ? procOrPid : null;
  if (proc && (proc.exitCode !== null || proc.signalCode !== null)) {
    log(`[port-manager] child pid ${proc.pid} already exited (exitCode=${proc.exitCode} signal=${proc.signalCode})`);
    return;
  }
  await killProcessTree(procOrPid, {
    graceMs: BACKEND_KILL_GRACE_MS,
    forceWaitMs: BACKEND_FORCE_WAIT_MS,
    log,
    logError,
    label: "backend",
  });
}

const DIAG_MAX_LOG_BYTES = 50 * 1024 * 1024;
const DIAG_GAIA_TIMEOUT_MS = 120000;

/** The last DIAG_MAX_LOG_BYTES of a file, as text. */
function readTail(abs) {
  const size = fs.statSync(abs).size;
  if (size <= DIAG_MAX_LOG_BYTES) return fs.readFileSync(abs, "utf8");
  const fd = fs.openSync(abs, "r");
  try {
    const buf = Buffer.alloc(DIAG_MAX_LOG_BYTES);
    fs.readSync(fd, buf, 0, DIAG_MAX_LOG_BYTES, size - DIAG_MAX_LOG_BYTES);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Write a diagnostics bundle (.tgz) of the known log/state files under
 * ~/.gaia. The bundle is made to be shared, so every line in it is redacted.
 *
 * Preferred: GAIA's own `gaia diagnostics --output <dest>`, which also removes
 * the credentials saved in the keyring by value. When that can't run (often
 * why the app crashed), the files are redacted here by shape only, with a
 * NOTE.txt in the bundle and a logged line saying so. If `tar` is missing the
 * same redacted text is written as a single .txt blob.
 *
 * `opts.findGaiaBin()` returns the gaia executable or null; `opts.execFile` is
 * a test seam for execFileSync.
 *
 * Returns the absolute path of the written bundle.
 */
async function writeDiagnosticsBundle(destPath, logger, opts = {}) {
  const logError = (logger && logger.error) || console.error;
  const run = opts.execFile || execFileSync;
  if (!destPath) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    destPath = path.join(gaiaHome(), `diagnostics-${ts}.tgz`);
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  let reason;
  const gaiaBin = opts.findGaiaBin ? opts.findGaiaBin() : null;
  if (!gaiaBin) {
    reason = "GAIA's Python backend was not found";
  } else {
    try {
      run(gaiaBin, ["diagnostics", "--output", destPath], {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: DIAG_GAIA_TIMEOUT_MS,
        windowsHide: true,
      });
      if (!fs.existsSync(destPath)) {
        throw new Error("it wrote no bundle");
      }
      return destPath;
    } catch (err) {
      const stderr = err && err.stderr ? String(err.stderr).trim().slice(-500) : "";
      reason = `\`gaia diagnostics\` failed (${err.message}${stderr ? `: ${redact(stderr)}` : ""})`;
    }
  }

  const note =
    `${reason}, so saved credentials (cloud keys, bot tokens, OAuth secrets) could not be read.\n` +
    "Every line was redacted by shape only: anything that looks like a key or token, " +
    "and the values of secret-named environment variables. " +
    "Read the files before you share them.\n";
  logError(`[port-manager] diagnostics: ${note.trim()}`);

  const candidates = [
    "electron-install.log",
    "electron-install.log.prev",
    "gaia.log",
    "electron-main.log",
    "electron-install-state.json",
    // Fatal-crash stacks from the backend (src/gaia/ui/fault_log.py), and its rotated copy.
    "logs/backend-faults.log",
    "logs/backend-faults.log.1",
  ].filter((rel) => fs.existsSync(path.join(gaiaHome(), rel)));

  const secrets = envSecrets();
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "gaia-diag-stage-"));
  const texts = [];
  try {
    fs.writeFileSync(path.join(stage, "NOTE.txt"), note);
    const staged = ["NOTE.txt"];
    for (const rel of candidates) {
      let text;
      try {
        text = redact(readTail(path.join(gaiaHome(), rel)), secrets);
      } catch (readErr) {
        text = `(could not read ${rel}: ${readErr.message})\n`;
      }
      texts.push([rel, text]);
      fs.mkdirSync(path.dirname(path.join(stage, rel)), { recursive: true });
      fs.writeFileSync(path.join(stage, rel), text);
      staged.push(rel);
    }

    try {
      // -C so paths inside the archive are relative (no /home/... leakage).
      run("tar", ["-czf", destPath, "-C", stage, ...staged], {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 10000,
      });
      return destPath;
    } catch (err) {
      // Not a tar archive; rename so we don't lie about the format.
      const fallback = destPath.replace(/\.tgz$/, ".txt");
      const chunks = [`==== NOTE.txt ====\n${note}\n`];
      for (const [rel, text] of texts) chunks.push(`==== ${rel} ====\n${text}\n`);
      fs.writeFileSync(fallback, chunks.join(""));
      logError(
        `[port-manager] tar unavailable (${err.message}); wrote plain-text bundle to ${fallback}`
      );
      return fallback;
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

class PortManager {
  // Instance wrappers so callers can pattern-match the other services
  // (TrayManager, AgentProcessManager) and inject a logger once.
  constructor({ logger, findGaiaBin } = {}) {
    this.logger = logger || null;
    this.findGaiaBin = findGaiaBin || null;
  }

  findFreePort() {
    return findFreePort();
  }

  killBackend(procOrPid) {
    return killBackend(procOrPid, this.logger);
  }

  writeDiagnosticsBundle(destPath) {
    return writeDiagnosticsBundle(destPath, this.logger, {
      findGaiaBin: this.findGaiaBin,
    });
  }
}

module.exports = PortManager;
module.exports.PortManager = PortManager;
module.exports.findFreePort = findFreePort;
module.exports.killBackend = killBackend;
module.exports.BACKEND_KILL_GRACE_MS = BACKEND_KILL_GRACE_MS;
module.exports.BACKEND_FORCE_WAIT_MS = BACKEND_FORCE_WAIT_MS;
module.exports.writeDiagnosticsBundle = writeDiagnosticsBundle;
