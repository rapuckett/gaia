// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

import { base64urlEncode, pemToDer, utf8 } from "./encoding";
import { HttpError } from "./http";

export type JwtAlg = "ES256" | "RS256";

const ALGS = {
  ES256: { importAlg: { name: "ECDSA", namedCurve: "P-256" }, signAlg: { name: "ECDSA", hash: "SHA-256" } },
  RS256: { importAlg: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, signAlg: { name: "RSASSA-PKCS1-v1_5" } },
} as const;

/** Import a PEM PKCS#8 private key; `source` names the var it came from in the error. */
export async function importPrivateKey(pem: string, alg: JwtAlg, source: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey("pkcs8", pemToDer(pem), ALGS[alg].importAlg, false, ["sign"]);
  } catch (e) {
    const want = alg === "ES256" ? "a PEM PKCS#8 P-256 key (the .p8 file)" : "a PEM PKCS#8 RSA key";
    throw new HttpError(500, "invalid_config", `${source} is not ${want}: ${e instanceof Error ? e.name : "error"}.`);
  }
}

/** A compact JWS. WebCrypto's ECDSA signature is already JOSE's raw r||s form. */
export async function signJwt(
  alg: JwtAlg,
  key: CryptoKey,
  header: Record<string, string>,
  claims: Record<string, unknown>
): Promise<string> {
  const input = `${base64urlEncode(utf8(JSON.stringify({ alg, ...header })))}.${base64urlEncode(utf8(JSON.stringify(claims)))}`;
  const sig = await crypto.subtle.sign(ALGS[alg].signAlg, key, utf8(input));
  return `${input}.${base64urlEncode(sig)}`;
}
