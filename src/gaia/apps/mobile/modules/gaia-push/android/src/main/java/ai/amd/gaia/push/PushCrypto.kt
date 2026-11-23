// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import java.security.GeneralSecurityException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Opens what the PC sealed for this phone; the layout is documented in src/features/push/pushCrypto.ts. */
internal object PushCrypto {
  const val VERSION: Byte = 1
  private const val NONCE_BYTES = 12
  private const val TAG_BITS = 128
  private const val KEY_BYTES = 32

  /** UTF-8 of the handle as the relay issued it (base64url text), then one byte: the payload version. */
  fun aad(handle: String): ByteArray = handle.toByteArray(Charsets.UTF_8) + byteArrayOf(VERSION)

  @Throws(GeneralSecurityException::class)
  fun open(ciphertext: String, nonce: String, key: String, handle: String): ByteArray {
    val sealed = base64url(ciphertext)
    val iv = base64url(nonce)
    val raw = base64url(key)
    if (iv.size != NONCE_BYTES || raw.size != KEY_BYTES || sealed.size < TAG_BITS / 8) {
      throw GeneralSecurityException("The push payload isn't in the layout this app reads.")
    }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(raw, "AES"), GCMParameterSpec(TAG_BITS, iv))
    cipher.updateAAD(aad(handle))
    return cipher.doFinal(sealed)
  }

  /** Tries each paired PC's key; the GCM tag tells them apart. Null when none opens it. */
  fun open(ciphertext: String, nonce: String, records: List<PushRecord>): Pair<PushRecord, ByteArray>? {
    for (record in records) {
      if (record.key.isEmpty()) continue
      try {
        return record to open(ciphertext, nonce, record.key, record.handle)
      } catch (e: GeneralSecurityException) {
        continue
      } catch (e: IllegalArgumentException) {
        continue
      }
    }
    return null
  }

  private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

  /** Unpadded base64url of `bytes`, the inverse of base64url(). */
  fun base64urlEncode(bytes: ByteArray): String {
    val out = StringBuilder()
    var acc = 0
    var bits = 0
    for (b in bytes) {
      acc = (acc shl 8) or (b.toInt() and 0xff)
      bits += 8
      while (bits >= 6) {
        bits -= 6
        out.append(ALPHABET[(acc shr bits) and 0x3f])
      }
    }
    if (bits > 0) out.append(ALPHABET[(acc shl (6 - bits)) and 0x3f])
    return out.toString()
  }

  /** Unpadded base64url, the only form the PC and relay send; plain Kotlin, so it runs in JVM unit tests and on API 24. */
  fun base64url(text: String): ByteArray {
    if (text.length % 4 == 1) throw IllegalArgumentException("not unpadded base64url")
    val out = ByteArray(text.length * 6 / 8)
    var acc = 0
    var bits = 0
    var o = 0
    for (ch in text) {
      val v = ALPHABET.indexOf(ch)
      if (v < 0) throw IllegalArgumentException("not unpadded base64url")
      acc = (acc shl 6) or v
      bits += 6
      if (bits >= 8) {
        bits -= 8
        out[o++] = (acc shr bits).toByte()
      }
    }
    return out
  }
}
