// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.push

import java.io.File
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.SecureRandom
import org.json.JSONException
import org.json.JSONObject

/** An approval a notification may offer Review and Deny for, as its payload named it. */
internal data class PushApproval(val pcId: String, val sessionId: String, val approvalId: String, val tool: String?, val ttlS: Long)

/** One button on an approval's notification: the intent action it sends, the answer JavaScript gets, and its label's catalog key. */
internal data class PushActionSpec(val intentAction: String, val answer: String, val labelKey: String, val authenticationRequired: Boolean)

/** How a notification is posted: one with buttons is kept off watches; every one shows only the generic line on a secure lock screen. */
internal data class PushPostFlags(val localOnly: Boolean, val genericPublicVersion: Boolean)

/**
 * Review and Deny on a tool approval's notification; the answers match src/features/push/approvalActions.ts. Both open
 * GAIA. Review only opens the chat's approval card; Deny is sent from the app. No action approves or allows always.
 */
internal object PushActions {
  const val REVIEW = "ai.amd.gaia.push.REVIEW"
  const val DENY = "ai.amd.gaia.push.DENY"
  /** The intent's and the notification's only approval extra: the token of the record stored for it. */
  const val EXTRA_TOKEN = "ai.amd.gaia.push.TOKEN"

  /** The string-array of tools that get only Open (plugins/push/withPushAndroid.js, from modules/gaia-push/openOnlyTools.json). */
  const val OPEN_ONLY_RESOURCE = "gaia_push_open_only_tools"

  /** Android 12 (API 31) is the first that makes an action wait for the phone to be unlocked. */
  const val UNLOCK_ENFORCED_FROM_SDK = 31

  val SPECS = listOf(
    PushActionSpec(REVIEW, "gaia.review", "notifications.devices.review", authenticationRequired = true),
    PushActionSpec(DENY, "gaia.deny", "notifications.deny", authenticationRequired = true),
  )

  private val ID = Regex("^[A-Za-z0-9_-]{1,128}$")
  private val TOKEN = Regex("^[A-Za-z0-9_-]{22}$")
  private val random = SecureRandom()

  fun isId(text: String?) = text != null && ID.matches(text)

  fun isToken(text: String?) = text != null && TOKEN.matches(text)

  /** 128 random bits, base64url without padding (22 characters). */
  fun newToken(): String {
    val bytes = ByteArray(16).also(random::nextBytes)
    return PushCrypto.base64urlEncode(bytes)
  }

  /** A PendingIntent request code from the token, so each notification's buttons are their own and never another chat's. */
  fun requestCode(token: String, spec: PushActionSpec): Int {
    val bytes = PushCrypto.base64url(token)
    val fromToken = ((bytes[0].toInt() and 0xff) shl 24) or ((bytes[1].toInt() and 0xff) shl 16) or ((bytes[2].toInt() and 0xff) shl 8) or (bytes[3].toInt() and 0xff)
    return fromToken xor SPECS.indexOf(spec)
  }

  fun postFlags(hasActions: Boolean) = PushPostFlags(localOnly = hasActions, genericPublicVersion = true)

  /**
   * The approval a payload's notification may offer Review and Deny for: a tool approval (never a question) naming its
   * chat, its approval and how long the PC waits, for a tool that isn't open-only, on a phone that enforces unlock. With
   * a non-empty list, an approval that doesn't name its tool gets none. Null when it offers only Open.
   */
  fun offered(p: PushPayload, pcId: String, openOnly: Set<String>, sdk: Int): PushApproval? {
    if (sdk < UNLOCK_ENFORCED_FROM_SDK || p.kind != "approval" || p.ask != "approval") return null
    val ttl = p.ttlS ?: return null
    if (!isId(p.sessionId) || !isId(p.approvalId)) return null
    if (if (p.tool == null) openOnly.isNotEmpty() else p.tool in openOnly) return null
    return PushApproval(pcId, p.sessionId!!, p.approvalId!!, p.tool, ttl)
  }
}

/** What a notification's buttons answer, stored under a random token and never shown or logged. Times are this phone's clock, unix ms. */
internal data class PushActionRecord(
  val pcId: String,
  val sessionId: String,
  val approvalId: String,
  val tool: String?,
  val receivedAt: Long,
  val expiresAt: Long,
  /** The notification it was posted as (tag, with id PushInbox.NOTIFICATION_ID), to remove it once answered. */
  val tag: String,
) {
  constructor(approval: PushApproval, receivedAt: Long, tag: String) :
    this(approval.pcId, approval.sessionId, approval.approvalId, approval.tool, receivedAt, receivedAt + approval.ttlS * 1000, tag)

  fun toJson(): String = JSONObject()
    .put("pc_id", pcId).put("session_id", sessionId).put("approval_id", approvalId).put("tool", tool ?: JSONObject.NULL)
    .put("received_at", receivedAt).put("expires_at", expiresAt).put("tag", tag).toString()

  fun toMap(): Map<String, Any?> = mapOf(
    "pcId" to pcId,
    "sessionId" to sessionId,
    "approvalId" to approvalId,
    "tool" to tool,
    "receivedAt" to receivedAt.toDouble(),
    "expiresAt" to expiresAt.toDouble(),
  )

  companion object {
    fun fromJson(text: String): PushActionRecord? = try {
      val o = JSONObject(text)
      PushActionRecord(
        o.getString("pc_id"), o.getString("session_id"), o.getString("approval_id"),
        if (o.isNull("tool")) null else o.getString("tool"),
        o.getLong("received_at"), o.getLong("expires_at"), o.getString("tag"),
      )
    } catch (e: JSONException) {
      null
    }
  }
}

/** Seals a record's bytes on this phone: the Android Keystore in the app, plain AES-GCM in the JVM tests. */
internal interface PushSealer {
  fun seal(plain: ByteArray, aad: ByteArray): ByteArray

  @Throws(GeneralSecurityException::class)
  fun open(sealed: ByteArray, aad: ByteArray): ByteArray
}

/**
 * The records, one sealed file per token in noBackupFilesDir. A token is claimed at most once, across restarts: the
 * file is renamed away before it is read, so of two claims only one wins. Every instance shares one lock.
 */
internal class PushActionStore(private val dir: File, private val sealer: PushSealer) {
  fun save(record: PushActionRecord): String = synchronized(LOCK) {
    val token = PushActions.newToken()
    if (!dir.isDirectory && !dir.mkdirs()) throw IOException("couldn't create ${dir.name}")
    val partial = File.createTempFile("action.", ".partial", dir)
    try {
      partial.writeBytes(sealer.seal(record.toJson().toByteArray(Charsets.UTF_8), aad(token)))
      if (!partial.renameTo(fileFor(token))) throw IOException("couldn't store an approval's actions")
    } finally {
      partial.delete()
    }
    token
  }

  /** The record a token stands for, deleted as it is read; null for a malformed, unknown, claimed or unreadable token. */
  fun claim(token: String): PushActionRecord? = synchronized(LOCK) {
    if (!PushActions.isToken(token)) return null
    val file = fileFor(token)
    val claimed = File(dir, "${file.name}.claimed")
    if (!file.renameTo(claimed)) return null
    try {
      read(claimed, token)
    } finally {
      claimed.delete()
    }
  }

  /** Deletes the records of approvals answered or expired elsewhere, and returns them by token so their notifications go too. */
  fun resolve(approvalIds: Collection<String>): List<Pair<String, PushActionRecord>> = synchronized(LOCK) {
    val wanted = approvalIds.toSet()
    files().mapNotNull { (token, file) ->
      val record = read(file, token)?.takeIf { it.approvalId in wanted } ?: return@mapNotNull null
      file.delete()
      token to record
    }
  }

  /** Deletes records a day past their expiry, so a late press still hears "no longer waiting", and any unreadable one. */
  fun sweep(now: Long) = synchronized(LOCK) {
    for ((token, file) in files()) {
      val record = read(file, token)
      if (record == null || now > record.expiresAt + KEEP_AFTER_EXPIRY_MS) file.delete()
    }
  }

  private fun files(): List<Pair<String, File>> =
    (dir.listFiles { f -> f.name.endsWith(SUFFIX) } ?: emptyArray()).map { it.name.removeSuffix(SUFFIX) to it }.filter { PushActions.isToken(it.first) }

  private fun read(file: File, token: String): PushActionRecord? = try {
    PushActionRecord.fromJson(String(sealer.open(file.readBytes(), aad(token)), Charsets.UTF_8))
  } catch (e: GeneralSecurityException) {
    null
  } catch (e: IOException) {
    null
  }

  private fun fileFor(token: String) = File(dir, "$token$SUFFIX")

  private fun aad(token: String) = "ai.amd.gaia.push.action\u0000$token".toByteArray(Charsets.UTF_8)

  companion object {
    const val DIR = "gaia-push-actions"
    const val KEEP_AFTER_EXPIRY_MS = 86_400_000L
    private const val SUFFIX = ".action"
    private val LOCK = Any()
  }
}

/** A Review or Deny the person pressed, waiting for JavaScript: only its answer and token. `locked` when the phone was locked. */
internal data class PushActionRequest(val answer: String, val token: String, val locked: Boolean) {
  fun toMap(): Map<String, Any?> = mapOf("action" to answer, "token" to token, "locked" to locked)
}

/** The action that opened or resumed the app and JavaScript hasn't taken yet. Each one is taken exactly once. */
internal object PushActionInbox {
  private var pending: PushActionRequest? = null
  private var listener: (() -> Unit)? = null

  /**
   * The request in an action's intent, or null for any other intent, one without a well-formed token, or one relaunched
   * from Recents (which would replay it). Any app can start the activity, so the token is checked again when claimed.
   */
  fun parse(intentAction: String?, token: String?, locked: Boolean, fromHistory: Boolean): PushActionRequest? {
    val spec = PushActions.SPECS.firstOrNull { it.intentAction == intentAction } ?: return null
    if (fromHistory || !PushActions.isToken(token)) return null
    return PushActionRequest(spec.answer, token!!, locked)
  }

  fun put(request: PushActionRequest) {
    synchronized(this) { pending = request }
    synchronized(this) { listener }?.invoke()
  }

  @Synchronized
  fun take(): PushActionRequest? {
    val request = pending
    pending = null
    return request
  }

  @Synchronized
  fun listen(body: (() -> Unit)?) {
    listener = body
  }
}
