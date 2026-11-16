// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.transport

import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.security.cert.Certificate
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.Locale
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLPeerUnverifiedException
import javax.net.ssl.SSLSession
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import okhttp3.Call
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.Headers
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** A failure JavaScript sees as a rejection with this `code`; GaiaTransportModule turns it into a CodedException. */
internal class TransportException(val code: String, message: String) : Exception(message)

internal fun transportError(code: String, message: String) = TransportException(code, message)

internal sealed class Outcome<out T> {
  class Ok<T>(val value: T) : Outcome<T>()
  class Failed(val error: TransportException) : Outcome<Nothing>()
}

/** The pin as 32 bytes; null unless it is 64 hex characters. */
internal fun pinBytes(hex: String): ByteArray? {
  val chars = hex.lowercase(Locale.ROOT)
  if (chars.length != 64) return null
  val bytes = ByteArray(32)
  for (i in 0 until 32) {
    val high = hexValue(chars[2 * i]) ?: return null
    val low = hexValue(chars[2 * i + 1]) ?: return null
    bytes[i] = ((high shl 4) or low).toByte()
  }
  return bytes
}

private fun hexValue(char: Char): Int? = when (char) {
  in '0'..'9' -> char - '0'
  in 'a'..'f' -> char - 'a' + 10
  else -> null
}

/** Whether the chain's leaf, as DER, has the SHA-256 `pin`; nothing else about the certificate is checked. */
internal fun leafMatchesPin(chain: Array<out Certificate>?, pin: ByteArray): Boolean {
  if (pin.size != 32) return false
  val leaf = chain?.firstOrNull() ?: return false
  val der = try {
    leaf.encoded
  } catch (e: CertificateException) {
    return false
  }
  return MessageDigest.isEqual(MessageDigest.getInstance("SHA-256").digest(der), pin)
}

/** Trusts exactly one leaf certificate, by its pin; no CA, system or user, is ever consulted. */
internal class PinTrustManager(private val pin: ByteArray, private val onMismatch: () -> Unit) : X509TrustManager {
  override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    throw CertificateException("This connection only checks the paired PC's certificate.")
  }

  override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
    if (!leafMatchesPin(chain, pin)) {
      onMismatch()
      throw CertificateException("The PC's certificate doesn't match its pin.")
    }
  }

  override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
}

/** The PC is named by its pinned certificate, not a host name, so this checks the handshake's leaf again. */
internal class PinHostnameVerifier(private val pin: ByteArray, private val onMismatch: () -> Unit) : HostnameVerifier {
  override fun verify(hostname: String?, session: SSLSession?): Boolean {
    val chain = try {
      session?.peerCertificates
    } catch (e: SSLPeerUnverifiedException) {
      null
    }
    val matches = leafMatchesPin(chain, pin)
    if (!matches) onMismatch()
    return matches
  }
}

/** A client for one request: TLS 1.2+ pinned to `pin`, no plain HTTP, redirects, retries, cookies, cache or reused connections. */
internal fun pinnedClient(pin: ByteArray, idleSeconds: Long, onMismatch: () -> Unit): OkHttpClient {
  val trust = PinTrustManager(pin, onMismatch)
  val tls = SSLContext.getInstance("TLS")
  tls.init(null, arrayOf<TrustManager>(trust), null)
  return OkHttpClient.Builder()
    .sslSocketFactory(tls.socketFactory, trust)
    .hostnameVerifier(PinHostnameVerifier(pin, onMismatch))
    .connectionSpecs(listOf(ConnectionSpec.MODERN_TLS))
    .connectionPool(ConnectionPool(0, 1, TimeUnit.SECONDS))
    .followRedirects(false)
    .followSslRedirects(false)
    .retryOnConnectionFailure(false)
    .connectTimeout(idleSeconds, TimeUnit.SECONDS)
    .readTimeout(idleSeconds, TimeUnit.SECONDS)
    .writeTimeout(idleSeconds, TimeUnit.SECONDS)
    .build()
}

internal class ResponseHead(val status: Int, val headers: Map<String, String>)

/** A request as GaiaTransportModule lays it out; `body` is sent as is, and a body-carrying method without one sends none. */
internal class Outgoing(
  val url: HttpUrl,
  val method: String = "GET",
  val headers: Headers = Headers.Builder().build(),
  val body: ByteArray? = null,
)

private const val READ_CHUNK_BYTES = 64 * 1024
private val BODY_METHODS = setOf("POST", "PUT", "PATCH")

internal val transportExecutor: Executor = Executors.newCachedThreadPool { runnable ->
  Thread(runnable, "GaiaTransport").apply { isDaemon = true }
}

/**
 * One request over TLS pinned to a PC's certificate. `start` hears the response head; the body then
 * arrives in the background and `read` hands it out as it comes.
 */
internal class PinnedRequest(private val pin: ByteArray, private val executor: Executor = transportExecutor) {
  private val lock = Any()
  private var call: Call? = null
  private var cancelled = false
  private var pinMismatch = false
  private val buffer = ArrayList<ByteArray>()
  private var ended = false
  private var failure: TransportException? = null
  private var waiting: ((Outcome<ByteArray?>) -> Unit)? = null
  private var temporary: File? = null

  /** With `upload`, the body is sent from its file, and a temporary one is deleted when the request ends. */
  fun start(
    outgoing: Outgoing,
    idleSeconds: Long,
    upload: UploadBody? = null,
    onProgress: ((Long, Long) -> Unit)? = null,
    onResponse: (Outcome<ResponseHead>) -> Unit,
  ) {
    synchronized(lock) { temporary = upload?.temporary }
    val request = try {
      val body: RequestBody? = when {
        upload != null -> ProgressFileBody(upload.file, onProgress)
        outgoing.body != null -> outgoing.body.toRequestBody(null)
        outgoing.method.uppercase(Locale.ROOT) in BODY_METHODS -> ByteArray(0).toRequestBody(null)
        else -> null
      }
      Request.Builder().url(outgoing.url).headers(outgoing.headers).method(outgoing.method, body).build()
    } catch (e: IllegalArgumentException) {
      val error = transportError("network", "The request to the PC couldn't be made: ${e.message}")
      finish(error)
      onResponse(Outcome.Failed(error))
      return
    }
    val client = pinnedClient(pin, idleSeconds) { synchronized(lock) { pinMismatch = true } }
    val newCall = client.newCall(request)
    val cancelledEarly = synchronized(lock) {
      call = newCall
      cancelled
    }
    if (cancelledEarly) newCall.cancel()
    executor.execute { run(newCall, onResponse) }
  }

  fun cancel() {
    val started = synchronized(lock) {
      cancelled = true
      this.call
    }
    started?.cancel()
  }

  /** The body received since the last read; null once it has all arrived. */
  fun read(done: (Outcome<ByteArray?>) -> Unit) {
    val result: Outcome<ByteArray?> = synchronized(lock) {
      when {
        buffer.isNotEmpty() -> {
          val chunk = join(buffer)
          buffer.clear()
          Outcome.Ok(chunk)
        }
        ended -> failure?.let { Outcome.Failed(it) } ?: Outcome.Ok(null)
        else -> {
          waiting = done
          return
        }
      }
    }
    done(result)
  }

  fun readAll(done: (Outcome<ByteArray>) -> Unit) {
    val body = ArrayList<ByteArray>()
    fun next() {
      read { result ->
        when (result) {
          is Outcome.Ok -> {
            val chunk = result.value
            if (chunk == null) {
              done(Outcome.Ok(join(body)))
            } else {
              body.add(chunk)
              next()
            }
          }
          is Outcome.Failed -> done(result)
        }
      }
    }
    next()
  }

  private fun run(call: Call, onResponse: (Outcome<ResponseHead>) -> Unit) {
    var responded = false
    try {
      call.execute().use { response ->
        responded = true
        onResponse(Outcome.Ok(head(response)))
        val source = response.body?.source()
        if (source != null) {
          val chunk = ByteArray(READ_CHUNK_BYTES)
          while (true) {
            val count = source.read(chunk)
            if (count == -1) break
            if (count > 0) deliver(chunk.copyOf(count))
          }
        }
      }
      finish(null)
    } catch (e: IOException) {
      fail(e, responded, onResponse)
    } catch (e: RuntimeException) {
      fail(e, responded, onResponse)
    }
  }

  private fun fail(e: Exception, responded: Boolean, onResponse: (Outcome<ResponseHead>) -> Unit) {
    val error = describe(e)
    finish(error)
    if (!responded) onResponse(Outcome.Failed(error))
  }

  private fun deliver(data: ByteArray) {
    val waiting = synchronized(lock) {
      val waiting = this.waiting
      if (waiting == null) {
        buffer.add(data)
      } else {
        this.waiting = null
      }
      waiting
    }
    waiting?.invoke(Outcome.Ok(data))
  }

  private fun finish(error: TransportException?) {
    val (waiting, temporary) = synchronized(lock) {
      ended = true
      failure = error
      val pair = this.waiting to this.temporary
      this.waiting = null
      this.temporary = null
      pair
    }
    temporary?.let { removeTemporary(it) }
    waiting?.invoke(error?.let { Outcome.Failed(it) } ?: Outcome.Ok(null))
  }

  private fun describe(e: Exception): TransportException = synchronized(lock) {
    when {
      pinMismatch -> transportError(
        "pin_mismatch",
        "The PC's certificate doesn't match the one this phone paired with. Pair the phone again from the PC.",
      )
      cancelled || call?.isCanceled() == true -> transportError("aborted", "The request was canceled.")
      else -> transportError("network", "Couldn't reach the PC: ${e.message ?: e.javaClass.simpleName}")
    }
  }
}

private fun head(response: Response): ResponseHead {
  val headers = HashMap<String, String>()
  for (name in response.headers.names()) {
    headers[name.lowercase(Locale.ROOT)] = response.headers.values(name).joinToString(", ")
  }
  return ResponseHead(response.code, headers)
}

private fun join(chunks: List<ByteArray>): ByteArray {
  if (chunks.size == 1) return chunks[0]
  val out = ByteArray(chunks.sumOf { it.size })
  var at = 0
  for (chunk in chunks) {
    chunk.copyInto(out, at)
    at += chunk.size
  }
  return out
}
