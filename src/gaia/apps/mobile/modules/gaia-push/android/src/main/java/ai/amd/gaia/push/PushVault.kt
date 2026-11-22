// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONException
import org.json.JSONObject

/** One paired PC's push handle, relay secret (kept here), send token (given to the PC) and payload key. */
internal data class PushRecord(val pcId: String, val handle: String, val secret: String, val sendToken: String, val key: String)

/**
 * One sealed file per paired PC in noBackupFilesDir, under an Android Keystore key that never leaves this phone.
 * The file is a format byte, the 12-byte IV, then AES-256-GCM ciphertext and tag; the PC id is the AAD.
 */
internal class PushVault(context: Context) {
  private val dir = File(context.noBackupFilesDir, "gaia-push")

  @Synchronized
  fun save(record: PushRecord) = guard("save") {
    if (!dir.isDirectory && !dir.mkdirs()) throw IOException("couldn't create ${dir.name}")
    val json = JSONObject().put("handle", record.handle).put("secret", record.secret).put("send_token", record.sendToken).put("key", record.key)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, keystoreKey())
    cipher.updateAAD(aad(record.pcId))
    val sealed = byteArrayOf(FORMAT) + cipher.iv + cipher.doFinal(json.toString().toByteArray(Charsets.UTF_8))
    val target = fileFor(record.pcId)
    val partial = File(dir, "${target.name}.partial")
    partial.writeBytes(sealed)
    if (!partial.renameTo(target)) {
      partial.delete()
      throw IOException("couldn't replace ${target.name}")
    }
  }

  @Synchronized
  fun load(pcId: String): PushRecord? = guard("read") {
    val file = fileFor(pcId)
    if (file.exists()) open(file, pcId) else null
  }

  /** Every record this app holds; a file this install can't open fails the read rather than being skipped. */
  @Synchronized
  fun all(): List<PushRecord> = guard("read") {
    (dir.listFiles { f -> f.name.endsWith(SUFFIX) } ?: emptyArray()).map { open(it, idOf(it)) }
  }

  @Synchronized
  fun remove(pcId: String) = guard("delete") { delete(fileFor(pcId)) }

  @Synchronized
  fun removeAll() = guard("delete") { dir.listFiles()?.forEach(::delete) }

  private fun open(file: File, pcId: String): PushRecord {
    val bytes = file.readBytes()
    if (bytes.size < 1 + IV_BYTES + TAG_BITS / 8 || bytes[0] != FORMAT) throw GeneralSecurityException("${file.name} isn't in a format this app wrote.")
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, keystoreKey(), GCMParameterSpec(TAG_BITS, bytes, 1, IV_BYTES))
    cipher.updateAAD(aad(pcId))
    val json = JSONObject(String(cipher.doFinal(bytes, 1 + IV_BYTES, bytes.size - 1 - IV_BYTES), Charsets.UTF_8))
    return PushRecord(pcId, json.getString("handle"), json.getString("secret"), json.getString("send_token"), json.getString("key"))
  }

  // The PC id, hex-encoded, names the file, so all() knows each file's AAD; ids aren't secret.
  private fun fileFor(pcId: String) = File(dir, "${hex(pcId.toByteArray(Charsets.UTF_8))}$SUFFIX")

  private fun idOf(file: File): String {
    val hex = file.name.removeSuffix(SUFFIX)
    if (hex.isEmpty() || hex.length % 2 != 0 || !hex.all { it in '0'..'9' || it in 'a'..'f' }) throw GeneralSecurityException("${file.name} isn't a name this app wrote.")
    return String(ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }, Charsets.UTF_8)
  }

  private fun aad(pcId: String) = "$ALIAS\u0000$pcId".toByteArray(Charsets.UTF_8)

  private fun delete(file: File) {
    if (file.exists() && !file.delete()) throw IOException("couldn't delete ${file.name}")
  }

  private inline fun <T> guard(action: String, block: () -> T): T {
    try {
      return block()
    } catch (e: GeneralSecurityException) {
      throw vaultError(action, e)
    } catch (e: IOException) {
      throw vaultError(action, e)
    } catch (e: JSONException) {
      throw vaultError(action, e)
    }
  }

  private fun vaultError(action: String, e: Exception) = PushException(
    "keychain",
    "Couldn't $action this phone's push key in the Android Keystore (${e.javaClass.simpleName}). Turn notifications off and on again in Settings.",
  )

  private companion object {
    const val ALIAS = "ai.amd.gaia.push"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val FORMAT: Byte = 1
    const val IV_BYTES = 12
    const val TAG_BITS = 128
    const val SUFFIX = ".push"

    @Synchronized
    fun keystoreKey(): SecretKey {
      val store = KeyStore.getInstance("AndroidKeyStore")
      store.load(null)
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

    fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
  }
}

internal class PushException(val code: String, message: String) : Exception(message)
