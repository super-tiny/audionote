import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

public class AudioNoteFileAccessModule: Module, UIDocumentPickerDelegate {
  private var pending: Promise?
  private var accessed: [String: URL] = [:]

  public func definition() -> ModuleDefinition {
    Name("AudioNoteFileAccess")

    AsyncFunction("pickAudio") { (promise: Promise) in
      if self.pending != nil {
        throw PickerInProgress()
      }
      guard let controller = self.appContext?.utilities?.currentViewController() else {
        throw MissingViewController()
      }
      self.pending = promise
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.audio], asCopy: false)
      picker.allowsMultipleSelection = true
      picker.delegate = self
      picker.modalPresentationStyle = .pageSheet
      controller.present(picker, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("resolveBookmark") { (bookmark: String) -> ResolvedBookmark in
      guard let data = Data(base64Encoded: bookmark) else {
        throw UnreadableAudio()
      }
      var stale = false
      let url = try URL(
        resolvingBookmarkData: data,
        options: [],
        relativeTo: nil,
        bookmarkDataIsStale: &stale
      )
      if let previous = self.accessed.removeValue(forKey: bookmark) {
        previous.stopAccessingSecurityScopedResource()
      }
      _ = url.startAccessingSecurityScopedResource()
      self.accessed[bookmark] = url

      var refreshed: String? = nil
      if stale {
        refreshed = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
          .base64EncodedString()
      }
      return ResolvedBookmark(uri: url.absoluteString, bookmark: refreshed ?? bookmark, stale: stale)
    }

    Function("releaseAccess") { (bookmark: String) in
      if let url = self.accessed.removeValue(forKey: bookmark) {
        url.stopAccessingSecurityScopedResource()
      }
    }
  }

  public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    let promise = pending
    pending = nil
    guard let promise else {
      return
    }
    let files = urls.map { describe(url: $0) }
    if files.isEmpty {
      promise.resolve(PickAudioResult(canceled: true, files: []))
    } else {
      promise.resolve(PickAudioResult(canceled: false, files: files))
    }
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    let promise = pending
    pending = nil
    promise?.resolve(PickAudioResult(canceled: true, files: []))
  }

  private func describe(url: URL) -> PickedAudioFile {
    let started = url.startAccessingSecurityScopedResource()
    defer {
      if started {
        url.stopAccessingSecurityScopedResource()
      }
    }
    let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey])
    let bookmark = try? url
      .bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
      .base64EncodedString()
    return PickedAudioFile(
      uri: url.absoluteString,
      name: url.lastPathComponent,
      size: Double(values?.fileSize ?? 0),
      mimeType: values?.contentType?.preferredMIMEType,
      bookmark: bookmark
    )
  }
}

internal struct PickAudioResult: Record {
  @Field var canceled: Bool = false
  @Field var files: [PickedAudioFile] = []
}

internal struct PickedAudioFile: Record {
  @Field var uri: String = ""
  @Field var name: String = ""
  @Field var size: Double = 0
  @Field var mimeType: String? = nil
  @Field var bookmark: String? = nil
}

internal struct ResolvedBookmark: Record {
  @Field var uri: String = ""
  @Field var bookmark: String? = nil
  @Field var stale: Bool = false
}

internal class PickerInProgress: Exception {
  override var reason: String {
    "A file picker is already open"
  }
}

internal class MissingViewController: Exception {
  override var reason: String {
    "Could not find a view controller to present the file picker"
  }
}

internal class UnreadableAudio: Exception {
  override var reason: String {
    "Could not read the selected audio"
  }
}
