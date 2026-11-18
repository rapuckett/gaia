// Copyright(C) 2024-2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Shape-based secret redaction for text that leaves the machine (the
 * diagnostics bundle). A port of the patterns in src/gaia/log_reader.py;
 * keep the two in step.
 */

"use strict";

const REDACTED = "[redacted]";

const REDACTIONS = [
  [/(authorization\s*[:=]\s*)(?:(?:bearer|basic)\s+)?[^\s,;"']+/gi, `$1${REDACTED}`],
  [/\b(bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi, `$1${REDACTED}`],
  [/(--(?:api-key|api_key|token|hf-token|password)(?:=|\s+))\S+/gi, `$1${REDACTED}`],
  [
    /((?<![a-z0-9])(?:api[_-]?key|(?:access|auth|refresh|id|api|hf)[_-]?token|client[_-]?secret|secret[_-]?key|password|passwd)["']?\s*[:=]\s*["']?)(?![{[\s])[^\s"',}&]+/gi,
    `$1${REDACTED}`,
  ],
  [/\b(token=)[^\s"',}&]+/gi, `$1${REDACTED}`],
  [/([?&](?:code|state|code_verifier|session_state)=)[^\s&"'#]+/gi, `$1${REDACTED}`],
  [/\bhf_[A-Za-z0-9]{16,}\b/g, REDACTED],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, REDACTED],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED],
  [/\bxapp-[A-Za-z0-9-]{10,}\b/g, REDACTED],
  [/\bfw_[A-Za-z0-9]{16,}\b/g, REDACTED],
  [/\bgaiad_[A-Za-z0-9_-]{20,}/g, REDACTED],
  // Telegram bot token, bare or after /bot in a Bot API URL.
  [/(?:(?<=\/bot)|(?<![\w-]))\d{6,12}:[A-Za-z0-9_-]{35}(?![\w-])/g, REDACTED],
  // Discord bot token.
  [
    /(?<![\w.-])[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,40}(?![\w.-])/g,
    REDACTED,
  ],
];

const SECRET_ENV_RE = /key|token|secret|pass(word|wd)?|credential/i;
const PLACEHOLDER_KEYS = new Set(["lemonade", "ollama", "placeholder", "changeme"]);

function isSecretValue(value) {
  return value.length >= 6 && !PLACEHOLDER_KEYS.has(value.toLowerCase());
}

/** Values of the secret-named variables in `env`. */
function envSecrets(env = process.env) {
  const out = [];
  for (const [name, raw] of Object.entries(env)) {
    const value = (raw || "").trim();
    if (SECRET_ENV_RE.test(name) && value && isSecretValue(value)) out.push(value);
  }
  return out;
}

/** `text` with every known secret value and anything shaped like one replaced. */
function redact(text, secrets = []) {
  for (const secret of secrets) {
    if (secret && isSecretValue(secret)) text = text.split(secret).join(REDACTED);
  }
  for (const [pattern, repl] of REDACTIONS) {
    text = text.replace(pattern, repl);
  }
  return text;
}

module.exports = { redact, envSecrets, REDACTED };
