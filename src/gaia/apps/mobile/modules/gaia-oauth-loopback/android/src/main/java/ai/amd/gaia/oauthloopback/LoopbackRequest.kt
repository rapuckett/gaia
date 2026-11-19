// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.oauthloopback

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest

/** What one sign-in redirect brought back. */
sealed class LoopbackOutcome {
  data class Code(val code: String, val state: String) : LoopbackOutcome()
  /** The provider's `error`, such as access_denied. */
  data class ProviderError(val error: String) : LoopbackOutcome()
  object Timeout : LoopbackOutcome()
  object Cancelled : LoopbackOutcome()
  /** The phone took the port away (the app was suspended, or the socket failed) before the redirect came. */
  object Lost : LoopbackOutcome()

  fun toMap(): Map<String, String> = when (this) {
    is Code -> mapOf("outcome" to "code", "code" to code, "state" to state)
    is ProviderError -> mapOf("outcome" to "error", "error" to error)
    Timeout -> mapOf("outcome" to "timeout")
    Cancelled -> mapOf("outcome" to "cancelled")
    Lost -> mapOf("outcome" to "lost")
  }
}

/** How the listener answers one request. Only [Accept] uses up the listener. */
sealed class LoopbackDecision {
  data class Accept(val outcome: LoopbackOutcome) : LoopbackDecision()
  object NotFound : LoopbackDecision()
  object MethodNotAllowed : LoopbackDecision()
  object BadRequest : LoopbackDecision()
  object TooLarge : LoopbackDecision()
}

const val CALLBACK_PATH = "/callback"
const val MAX_HEAD_BYTES = 8 * 1024
const val MAX_CODE_LENGTH = 4096

// A reverse-DNS app scheme and one host, e.g. ai.amd.gaia.mobile://oauth-done; never http(s).
private val RETURN_URL = Regex("^[a-z][a-z0-9-]*(\\.[a-z0-9-]+)+://[a-z0-9-]+$")
private val PROVIDER_ERROR = Regex("^[A-Za-z0-9_.-]{1,64}$")
private val SINGLE_PARAMS = setOf("code", "state", "error")

fun isReturnUrl(url: String): Boolean = RETURN_URL.matches(url) && !url.startsWith("http")

/** The byte count of the request head, terminator included, once it has all arrived. */
fun headLength(buffer: ByteArray, size: Int = buffer.size): Int? {
  for (i in 3 until size) {
    if (buffer[i - 3] == '\r'.code.toByte() && buffer[i - 2] == '\n'.code.toByte() &&
      buffer[i - 1] == '\r'.code.toByte() && buffer[i] == '\n'.code.toByte()
    ) {
      return i + 1
    }
  }
  return null
}

/** Decides the answer to a request head. [expectedState] is null until the sign-in link exists; until then nothing is accepted. */
fun decide(head: ByteArray, expectedState: String?): LoopbackDecision {
  val text = utf8(head) ?: return LoopbackDecision.BadRequest
  val line = text.substringBefore("\r\n")
  val parts = line.split(" ")
  if (parts.size != 3 || !parts[2].startsWith("HTTP/1.")) return LoopbackDecision.BadRequest
  val (method, target) = parts
  val pathEnd = target.indexOfFirst { it == '?' || it == '#' }.let { if (it < 0) target.length else it }
  if (target.substring(0, pathEnd) != CALLBACK_PATH || expectedState == null) return LoopbackDecision.NotFound
  if (method != "GET") return LoopbackDecision.MethodNotAllowed
  if (pathEnd < target.length && target[pathEnd] == '#') return LoopbackDecision.BadRequest
  val query = if (pathEnd < target.length) target.substring(pathEnd + 1) else ""
  val params = parseQuery(query) ?: return LoopbackDecision.BadRequest
  val state = params["state"]
  if (state == null || !constantTimeEqual(state, expectedState)) return LoopbackDecision.BadRequest
  params["error"]?.let { error ->
    return LoopbackDecision.Accept(LoopbackOutcome.ProviderError(if (PROVIDER_ERROR.matches(error)) error else "invalid_error"))
  }
  val code = params["code"]
  if (code.isNullOrEmpty() || code.length > MAX_CODE_LENGTH) return LoopbackDecision.BadRequest
  return LoopbackDecision.Accept(LoopbackOutcome.Code(code, state))
}

/** A form-encoded query as one value per name; null when it is malformed or names code, state or error twice. */
fun parseQuery(query: String): Map<String, String>? {
  val params = mutableMapOf<String, String>()
  for (pair in query.split('&')) {
    if (pair.isEmpty()) continue
    val name = formDecode(pair.substringBefore('=')) ?: return null
    val value = formDecode(if ('=' in pair) pair.substringAfter('=') else "") ?: return null
    if (name in params && name in SINGLE_PARAMS) return null
    params[name] = value
  }
  return params
}

/** `+` as a space and %XX as UTF-8 bytes; null for a broken escape or bytes that aren't UTF-8. */
fun formDecode(text: String): String? {
  val raw = text.toByteArray(Charsets.UTF_8)
  val out = ByteArrayOutputStream(raw.size)
  var i = 0
  while (i < raw.size) {
    val byte = raw[i]
    when (byte) {
      '+'.code.toByte() -> out.write(' '.code)
      '%'.code.toByte() -> {
        if (i + 2 >= raw.size) return null
        val high = hexValue(raw[i + 1]) ?: return null
        val low = hexValue(raw[i + 2]) ?: return null
        out.write(high shl 4 or low)
        i += 2
      }
      else -> out.write(byte.toInt())
    }
    i++
  }
  return utf8(out.toByteArray())
}

/** The whole HTTP response for a decision; the accepted one sends the browser back to the app. */
fun response(decision: LoopbackDecision, returnUrl: String): ByteArray {
  val headers = mutableListOf(
    "Content-Type: text/html; charset=utf-8",
    "Cache-Control: no-store",
    "Referrer-Policy: no-referrer",
    "Content-Security-Policy: default-src 'none'",
    "Connection: close",
  )
  val (status, body) = when (decision) {
    is LoopbackDecision.Accept -> {
      headers.add("Location: $returnUrl")
      "302 Found" to (
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>GAIA</title></head>" +
          "<body><p>Sign-in is finishing in GAIA.</p><p><a href=\"$returnUrl\">Return to GAIA</a></p></body></html>"
        )
    }
    LoopbackDecision.NotFound -> "404 Not Found" to "Not found"
    LoopbackDecision.MethodNotAllowed -> "405 Method Not Allowed" to "Method not allowed"
    LoopbackDecision.BadRequest -> "400 Bad Request" to "Bad request"
    LoopbackDecision.TooLarge -> "431 Request Header Fields Too Large" to "Request too large"
  }
  val bodyBytes = body.toByteArray(Charsets.UTF_8)
  headers.add("Content-Length: ${bodyBytes.size}")
  val head = "HTTP/1.1 $status\r\n${headers.joinToString("\r\n")}\r\n\r\n".toByteArray(Charsets.UTF_8)
  return head + bodyBytes
}

private fun hexValue(byte: Byte): Int? = when (byte.toInt().toChar()) {
  in '0'..'9' -> byte - '0'.code.toByte()
  in 'a'..'f' -> byte - 'a'.code.toByte() + 10
  in 'A'..'F' -> byte - 'A'.code.toByte() + 10
  else -> null
}

private fun utf8(bytes: ByteArray): String? = try {
  Charsets.UTF_8.newDecoder()
    .onMalformedInput(CodingErrorAction.REPORT)
    .onUnmappableCharacter(CodingErrorAction.REPORT)
    .decode(ByteBuffer.wrap(bytes))
    .toString()
} catch (e: CharacterCodingException) {
  null
}

private fun constantTimeEqual(a: String, b: String): Boolean =
  MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))
