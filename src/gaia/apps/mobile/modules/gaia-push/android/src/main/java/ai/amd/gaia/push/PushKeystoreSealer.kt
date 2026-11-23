// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-256-GCM under an Android Keystore key that never leaves this phone: a format byte, the 12-byte IV, then ciphertext and tag. */
internal object PushKeystoreSealer : PushSealer {
  private const val ALIAS = "ai.amd.gaia.push.actions"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val FORMAT: Byte = 1
  private const val IV_BYTES = 12
  private const val TAG_BITS = 128

  override fun seal(plain: ByteArray, aad: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    cipher.updateAAD(aad)
    return byteArrayOf(FORMAT) + cipher.iv + cipher.doFinal(plain)
  }

  override fun open(sealed: ByteArray, aad: ByteArray): ByteArray {
    if (sealed.size < 1 + IV_BYTES + TAG_BITS / 8 || sealed[0] != FORMAT) throw java.security.GeneralSecurityException("not a record this app sealed")
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, sealed, 1, IV_BYTES))
    cipher.updateAAD(aad)
    return cipher.doFinal(sealed, 1 + IV_BYTES, sealed.size - 1 - IV_BYTES)
  }

  @Synchronized
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .setRandomizedEncryptionRequired(true)
        .build(),
    )
    return generator.generateKey()
  }
}
