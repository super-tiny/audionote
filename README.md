# AudioNote

AudioNote is a mobile app for **long-form study and lecture audio** on Android and iOS. Import files from your device, listen at variable speed, resume where you left off, and attach **timestamped notes**—without uploading your library to a cloud service.

Everything runs **on device**: playback state, listening history, and notes live in a local database. Original audio files stay in place; the app keeps a durable reference so entries remain stable even if you move or relink files later.

---

## Why AudioNote

Long recordings (courses, sermons, language practice, podcasts you own) are awkward in generic music players. AudioNote is built for **sustained listening and review**:

- **Resume reliably** — Each lesson remembers position, speed, and how much you have actually heard (not just scrub position).
- **Study-friendly controls** — Configurable skip intervals, playback speed, sleep timer, and A–B loop for repeating a section.
- **Notes tied to time** — Add a note at the current moment; tap it later to jump back. Notes are stored with the lesson, not in a separate document.
- **Background playback** — Continues with the screen off; lock-screen transport controls on supported devices.
- **Private by design** — No account, no sync server, no analytics pipeline in the app shell described here.

---

## Features

| Area | What you get |
| --- | --- |
| **Library** | Search, import, progress per title, “continue listening,” missing-file relink |
| **Player** | Scrub bar with heard ranges and note markers, centered transport, settings sheet (speed, sleep, loop, skip intervals) |
| **Mini player** | When you return to the library while audio plays, a compact bar offers play/pause and seek without reopening the full player |
| **Navigation** | Native stack navigation; system back returns from the player to the library |

---

## Tech stack

- **Expo SDK 58** (React Native 0.88, New Architecture)
- **Playback** — [`@rntp/player`](https://github.com/doublesymmetry/react-native-track-player) (React Native Track Player v5)
- **Storage** — `expo-sqlite` for library metadata, notes, and listen ranges
- **Files** — Local `audionote-file-access` module plus targeted reads via `expo-file-system`

Playback requires a **development or release build** (not Expo Go). Deeper build and module notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**License note:** `@rntp/player` is free for personal and educational use; commercial distribution may require a separate license from the player authors. See the package `license.txt`.

---

## Getting started

### Requirements

- **Node.js 22** (see `.nvmrc`)
- **Android:** JDK 17, Android SDK 37, build-tools 37.0.0, NDK 27.1.12297006
- **iOS:** macOS with Xcode 26.4 or newer

### Install and run

```bash
npm ci
npm start
```

Create and run a dev client (required for native playback):

```bash
npm run android
# or
npm run ios
```

### Quality checks

```bash
npm run typecheck
npm test
```

---

## Building release bundles

**Android** (Linux or macOS):

```bash
npm run build:android
```

Artifacts: `android/app/build/outputs/apk/release/*.apk` and `.../bundle/release/*.aab`.

**iOS** (macOS):

```bash
bash scripts/build-ios.sh
```

Artifact: `dist/ios/*.ipa`.

Without signing secrets, Android release builds use the debug keystore (sideload only), and iOS output may be unsigned. Production signing is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Native projects are generated with `expo prebuild`; `android/` and `ios/` are not committed.

---

## CI / GitHub Actions

| Workflow | Purpose |
| --- | --- |
| **CI** | Unit tests, TypeScript check, JavaScript bundle export |
| **Mobile bundles** | Release APK, AAB, and IPA artifacts; tags `v*` can publish a GitHub Release |
| **EAS bundle** | Manual workflow; requires `EXPO_TOKEN` and a linked Expo project |

---

## Project layout (high level)

```text
src/
  screens/          Library and full-screen player
  navigation/       React Navigation stack
  playback/         Track player session, engine, progress persistence
  db/               SQLite schema and library API
  library/          Import, search, listen-range logic
  ui/               Shared UI (dock, settings sheet, scrub bar, theme)
modules/
  audionote-file-access/   Native file access for imports
```

---

## Contributing

Issues and pull requests are welcome. Please run `npm run typecheck` and `npm test` before opening a PR.

---

## License

See [LICENSE](LICENSE) in this repository. Third-party components (including the track player) carry their own license terms.
