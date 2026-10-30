package app.audionote.fileaccess

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

private const val OPEN_AUDIO_REQUEST = 4816

class AudioNoteFileAccessModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("AudioNoteFileAccess")

    AsyncFunction("pickAudio") { promise: Promise ->
      if (pending != null) {
        throw PickerInProgress()
      }
      pending = promise
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        type = "audio/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        putExtra(
          Intent.EXTRA_MIME_TYPES,
          arrayOf(
            "audio/*",
            "audio/mpeg",
            "audio/mp4",
            "audio/x-m4a",
            "audio/aac",
            "audio/wav",
            "audio/x-wav",
            "audio/flac",
            "audio/ogg",
            "audio/opus",
          ),
        )
      }
      appContext.throwingActivity.startActivityForResult(intent, OPEN_AUDIO_REQUEST)
    }

    AsyncFunction("resolveBookmark") { bookmark: String ->
      val uri = Uri.parse(bookmark)
      val descriptor = appContext.reactContext?.contentResolver?.openFileDescriptor(uri, "r")
        ?: throw UnreadableAudio()
      descriptor.close()
      ResolvedBookmark(uri = bookmark, bookmark = bookmark, stale = false)
    }

    Function("releaseAccess") { _: String ->
      // Android persistable grants stay with the content resolver.
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode != OPEN_AUDIO_REQUEST) {
        return@OnActivityResult
      }
      val promise = pending
      pending = null
      if (promise == null) {
        return@OnActivityResult
      }
      if (resultCode != Activity.RESULT_OK || intent == null) {
        promise.resolve(PickAudioResult(canceled = true, files = emptyList()))
        return@OnActivityResult
      }
      try {
        val files = mutableListOf<PickedAudioFile>()
        val clip = intent.clipData
        if (clip != null) {
          for (index in 0 until clip.itemCount) {
            clip.getItemAt(index).uri?.let { files.add(readAudio(it)) }
          }
        } else {
          intent.data?.let { files.add(readAudio(it)) }
        }
        if (files.isEmpty()) {
          promise.resolve(PickAudioResult(canceled = true, files = emptyList()))
        } else {
          promise.resolve(PickAudioResult(canceled = false, files = files))
        }
      } catch (error: Exception) {
        promise.reject(UnreadableAudio(error.message))
      }
    }
  }

  private fun readAudio(uri: Uri): PickedAudioFile {
    var name = uri.lastPathSegment ?: "audio"
    var size = 0L
    val resolver = appContext.reactContext?.contentResolver ?: throw UnreadableAudio()
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (nameIndex >= 0) {
          name = cursor.getString(nameIndex) ?: name
        }
        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
          size = cursor.getLong(sizeIndex)
        }
      }
    }
    try {
      resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    } catch (_: SecurityException) {
      // The session grant still lets this process read the file.
    }
    return PickedAudioFile(
      uri = uri.toString(),
      name = name,
      size = size.toDouble(),
      mimeType = resolver.getType(uri),
      bookmark = null,
    )
  }
}

private class PickerInProgress : CodedException("A file picker is already open")

private class UnreadableAudio(message: String? = null) :
  CodedException(message ?: "Could not read the selected audio")

internal data class PickAudioResult(
  @Field val canceled: Boolean,
  @Field val files: List<PickedAudioFile>,
) : Record

internal data class PickedAudioFile(
  @Field val uri: String,
  @Field val name: String,
  @Field val size: Double,
  @Field val mimeType: String?,
  @Field val bookmark: String?,
) : Record

internal data class ResolvedBookmark(
  @Field val uri: String,
  @Field val bookmark: String?,
  @Field val stale: Boolean,
) : Record
