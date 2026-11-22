// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import android.util.Base64
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
  fun open(ciphertext: String, nonce: String, records: List<PushRecord>): ByteArray? {
    for (record in records) {
      try {
        return open(ciphertext, nonce, record.key, record.handle)
      } catch (e: GeneralSecurityException) {
        continue
      } catch (e: IllegalArgumentException) {
        continue
      }
    }
    return null
  }

  private fun base64url(text: String): ByteArray {
    if (text.contains('=')) throw IllegalArgumentException("padded base64url")
    return Base64.decode(text, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  }
}
