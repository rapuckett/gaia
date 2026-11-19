// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.oauthloopback

import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

const val HARD_CAP_MS = 15 * 60 * 1000L
/** The most a connection gets to send its request, in total, however slowly it trickles. */
const val CONNECTION_DEADLINE_MS = 10_000L
/** Connections served at once; a newcomer past it closes the oldest that hasn't sent its request, so stuck clients never hold up the redirect. */
const val MAX_CONNECTIONS = 4

/** The address the provider redirects to. Android's getLoopbackAddress() is ::1, which that redirect never reaches. */
val LOOPBACK_V4: InetAddress = InetAddress.getByAddress(byteArrayOf(127, 0, 0, 1))

/** The listener was ended (cancelled, or a newer one replaced it) before it was ready. */
class LoopbackCancelledException : IOException("The sign-in listener was cancelled before it was ready.")

/**
 * A one-shot HTTP listener on 127.0.0.1 for one sign-in redirect. Each connection runs on its own short-lived
 * thread under a hard deadline; state changes hold the listener's lock. It never logs a request: the query
 * carries the authorization code and state.
 */
class LoopbackListener(private val returnUrl: String) {
  private val lock = Any()
  private val timers = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "gaia-oauth-loopback-timer").apply { isDaemon = true } }
  // Open connections, oldest first, each with whether its whole request has arrived. Guarded by itself.
  private val open = LinkedHashMap<Socket, Boolean>()
  private var server: ServerSocket? = null
  private var expectedState: String? = null
  private var waiter: ((LoopbackOutcome) -> Unit)? = null
  private var waitTimer: ScheduledFuture<*>? = null
  private var startedAt = 0L
  private var consumed = false
  private var ended = false

  /** Binds a port the system picks on 127.0.0.1 and returns it; [LoopbackCancelledException] when it was ended first. */
  @Throws(IOException::class)
  fun start(): Int {
    val socket = ServerSocket()
    try {
      socket.reuseAddress = false
      socket.bind(InetSocketAddress(LOOPBACK_V4, 0), MAX_CONNECTIONS)
      if (socket.inetAddress != LOOPBACK_V4) throw IOException("The sign-in listener bound ${socket.inetAddress.hostAddress}, not 127.0.0.1.")
    } catch (e: IOException) {
      socket.close()
      throw e
    }
    // Under the lock, so end() can't run between this check and the timers it would shut down.
    synchronized(lock) {
      if (ended) {
        socket.close()
        throw LoopbackCancelledException()
      }
      server = socket
      startedAt = System.currentTimeMillis()
      timers.schedule({ end(LoopbackOutcome.Timeout) }, HARD_CAP_MS, TimeUnit.MILLISECONDS)
      Thread({ acceptLoop(socket) }, "gaia-oauth-loopback").apply { isDaemon = true }.start()
    }
    return socket.localPort
  }

  /** Waits for the redirect that carries [expectedState]; before this is called every request is refused. False once it has ended. */
  fun wait(expectedState: String, timeoutMs: Long, done: (LoopbackOutcome) -> Unit): Boolean = synchronized(lock) {
    if (ended || waiter != null) return false
    this.expectedState = expectedState
    waiter = done
    val remaining = HARD_CAP_MS - (System.currentTimeMillis() - startedAt)
    waitTimer = timers.schedule({ end(LoopbackOutcome.Timeout) }, timeoutMs.coerceIn(0, remaining.coerceAtLeast(0)), TimeUnit.MILLISECONDS)
    true
  }

  fun cancel() = end(LoopbackOutcome.Cancelled)

  private fun acceptLoop(socket: ServerSocket) {
    while (true) {
      val connection = try {
        socket.accept()
      } catch (e: IOException) {
        // Closed by end() or after the redirect; anything else means the phone took the port away.
        if (synchronized(lock) { !ended && !consumed }) end(LoopbackOutcome.Lost)
        return
      }
      if (!connection.inetAddress.isLoopbackAddress) {
        closeQuietly(connection)
        continue
      }
      // The newest may be the browser's redirect: make room by dropping the oldest still sending nothing useful.
      val evicted = synchronized(open) {
        val stalled = if (open.size >= MAX_CONNECTIONS) open.entries.firstOrNull { !it.value }?.key else null
        stalled?.let { open.remove(it) }
        val full = open.size >= MAX_CONNECTIONS
        if (!full) open[connection] = false
        stalled to full
      }
      evicted.first?.let { closeQuietly(it) }
      if (evicted.second) {
        // Every slot is answering a complete request; this one waits for none of them.
        closeQuietly(connection)
        continue
      }
      val deadline = try {
        timers.schedule({ closeQuietly(connection) }, CONNECTION_DEADLINE_MS, TimeUnit.MILLISECONDS)
      } catch (e: RejectedExecutionException) {
        // Ended while this connection was being accepted.
        synchronized(open) { open.remove(connection) }
        closeQuietly(connection)
        return
      }
      Thread({
        try {
          handle(connection)
        } finally {
          deadline.cancel(false)
          synchronized(open) { open.remove(connection) }
        }
      }, "gaia-oauth-loopback-connection").apply { isDaemon = true }.start()
    }
  }

  /** Answers one connection; the redirect ends the listener. */
  private fun handle(connection: Socket) {
    var outcome: LoopbackOutcome? = null
    try {
      connection.soTimeout = CONNECTION_DEADLINE_MS.toInt()
      val buffer = ByteArray(MAX_HEAD_BYTES + 1)
      var size = 0
      var length: Int? = null
      val input = connection.getInputStream()
      while (size < buffer.size) {
        val read = input.read(buffer, size, buffer.size - size)
        if (read < 0) break
        size += read
        length = headLength(buffer, size)
        if (length != null) {
          synchronized(open) { if (connection in open) open[connection] = true }
          break
        }
      }
      val decision = when {
        length != null && length <= MAX_HEAD_BYTES -> {
          val state = synchronized(lock) { if (consumed || ended) null else expectedState }
          decide(buffer.copyOf(length), state)
        }
        size > MAX_HEAD_BYTES -> LoopbackDecision.TooLarge
        else -> return
      }
      if (decision is LoopbackDecision.Accept) {
        synchronized(lock) {
          if (consumed || ended) return
          consumed = true
        }
        // The one request is taken: nothing else is accepted from here on.
        closeServer()
        outcome = decision.outcome
      }
      connection.getOutputStream().apply {
        write(response(decision, returnUrl))
        flush()
      }
    } catch (e: SocketTimeoutException) {
      // A client that sent no complete request in time.
    } catch (e: IOException) {
      // Closed at the deadline, or the browser went away mid-request; a redirect already taken is still delivered.
    } finally {
      closeQuietly(connection)
      outcome?.let { end(it) }
    }
  }

  private fun closeServer() {
    val socket = synchronized(lock) { server.also { server = null } }
    try {
      socket?.close()
    } catch (e: IOException) {
      // Already closed.
    }
  }

  private fun end(outcome: LoopbackOutcome) {
    val done = synchronized(lock) {
      if (ended) return
      ended = true
      waitTimer?.cancel(false)
      waitTimer = null
      expectedState = null
      waiter.also { waiter = null }
    }
    closeServer()
    for (connection in synchronized(open) { open.keys.toList() }) closeQuietly(connection)
    timers.shutdownNow()
    done?.invoke(outcome)
  }
}

private fun closeQuietly(socket: Socket) {
  try {
    socket.close()
  } catch (e: IOException) {
    // Already closed.
  }
}
