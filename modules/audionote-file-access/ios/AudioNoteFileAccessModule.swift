import ExpoModulesCore
import UIKit
import UniformTypeIdentifiers

public class AudioNoteFileAccessModule: Module {
  private var pending: Promise?
  private var pickerDelegate: AudioPickerDelegate?
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
      let delegate = AudioPickerDelegate(
        onPick: { [weak self] urls in
          self?.completePick(urls: urls)
        },
        onCancel: { [weak self] in
          self?.completePick(urls: nil)
        }
      )
      self.pickerDelegate = delegate
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.audio], asCopy: false)
      picker.allowsMultipleSelection = true
      picker.delegate = delegate
      picker.presentationController?.delegate = delegate
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

  private func completePick(urls: [URL]?) {
    let promise = pending
    pending = nil
    pickerDelegate = nil
    guard let promise else {
      return
    }
    guard let urls, !urls.isEmpty else {
      promise.resolve(PickAudioResult(canceled: true, files: []))
      return
    }
    promise.resolve(PickAudioResult(canceled: false, files: urls.map { describe(url: $0) }))
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

/// UIDocumentPickerDelegate requires NSObject. Expo's Module is a plain Swift class, so the picker delegate is separate and retained until the sheet closes.
private final class AudioPickerDelegate: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private let onPick: ([URL]) -> Void
  private let onCancel: () -> Void

  init(onPick: @escaping ([URL]) -> Void, onCancel: @escaping () -> Void) {
    self.onPick = onPick
    self.onCancel = onCancel
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    onPick(urls)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    onCancel()
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    onCancel()
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

internal final class PickerInProgress: Exception, @unchecked Sendable {
  override var reason: String {
    "A file picker is already open"
  }
}

internal final class MissingViewController: Exception, @unchecked Sendable {
  override var reason: String {
    "Could not find a view controller to present the file picker"
  }
}

internal final class UnreadableAudio: Exception, @unchecked Sendable {
  override var reason: String {
    "Could not read the selected audio"
  }
}
