// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

package ai.amd.gaia.transport

import android.net.Uri
import android.util.Log
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID
import okhttp3.MediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.source

private const val COPY_CHUNK_BYTES = 256 * 1024
private const val PROGRESS_NANOS = 100_000_000L

/** A piece of a request body from JavaScript: text sent as UTF-8, or a file on this device sent from disk. */
class BodySegment : Record {
  @Field var text: String? = null

  @Field var file: String? = null
}

/** A request body read from disk: a picked file as it is, or the segments joined into a temporary file. */
internal class UploadBody(val file: File, val temporary: File?) {
  companion object {
    fun make(segments: List<BodySegment>, temporaryDir: File): UploadBody {
      val only = segments.singleOrNull()?.file
      if (only != null) return UploadBody(readableFile(only), null)
      val joined = File(temporaryDir, "gaia-upload-${UUID.randomUUID()}")
      try {
        if (!joined.createNewFile()) throw IOException("${joined.name} already exists")
      } catch (e: IOException) {
        throw transportError("upload_file", "Couldn't make room to send the file. Free some space on this phone.")
      }
      try {
        FileOutputStream(joined).use { out ->
          for (segment in segments) {
            val text = segment.text
            val file = segment.file
            when {
              text != null -> out.write(text.toByteArray(Charsets.UTF_8))
              file != null -> readableFile(file).inputStream().use { input ->
                input.copyTo(out, COPY_CHUNK_BYTES)
              }
              else -> throw transportError("upload_file", "A piece of the request body was empty.")
            }
          }
        }
      } catch (e: TransportException) {
        removeTemporary(joined)
        throw e
      } catch (e: IOException) {
        removeTemporary(joined)
        throw transportError("upload_file", "Couldn't read the file to send: ${e.message}")
      }
      return UploadBody(joined, joined)
    }
  }
}

internal fun removeTemporary(file: File) {
  if (file.exists() && !file.delete()) {
    Log.w("GaiaTransport", "Couldn't delete an upload's temporary file: ${file.name}")
  }
}

private fun readableFile(uri: String): File {
  val parsed = Uri.parse(uri)
  val path = parsed.path
  if (parsed.scheme != "file" || path.isNullOrEmpty()) {
    throw transportError("upload_file", "The file to send isn't on this phone.")
  }
  val file = File(path)
  if (!file.canRead()) throw transportError("upload_file", "Couldn't read the file to send. Pick it again.")
  return file
}

/** Streams `file` as the body, reporting bytes sent of its total at most every 100 ms, and once when all is sent. */
internal class ProgressFileBody(
  private val file: File,
  private var onProgress: ((Long, Long) -> Unit)?,
) : RequestBody() {
  private var lastProgressAt: Long? = null

  override fun contentType(): MediaType? = null

  override fun contentLength(): Long = file.length()

  override fun isOneShot(): Boolean = true

  override fun writeTo(sink: BufferedSink) {
    val total = contentLength()
    var sent = 0L
    file.source().use { source ->
      val buffer = Buffer()
      while (true) {
        val count = source.read(buffer, COPY_CHUNK_BYTES.toLong())
        if (count == -1L) break
        sink.write(buffer, count)
        sent += count
        report(sent, total)
      }
    }
  }

  private fun report(sent: Long, total: Long) {
    val onProgress = onProgress ?: return
    if (total <= 0) return
    val now = System.nanoTime()
    val finished = sent >= total
    val last = lastProgressAt
    if (!finished && last != null && now - last < PROGRESS_NANOS) return
    lastProgressAt = now
    if (finished) this.onProgress = null
    onProgress(sent, total)
  }
}
