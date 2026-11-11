# AudioNote architecture

AudioNote is a local-only React Native app for long study audio. This document records the build architecture that produces installable Android and iOS bundles, and the app shell those bundles contain.

## App shell

Expo SDK 58 (React Native 0.88, New Architecture) with continuous native generation. `android/` and `ios/` are not committed. `npx expo prebuild` creates them from `app.config.ts` and config plugins.

| Concern | Module |
| --- | --- |
| Entry | `index.ts` registers the playback session, then the root component |
| Screens | `@react-navigation/native-stack` in `src/navigation/RootNavigator.tsx`. Library shows a fixed mini player when audio is active; the full player pins transport and scrubbing to the bottom dock |
| Playback | `@rntp/player` (React Native Track Player v5). `src/playback/session.ts` sets up speech playback, lock-screen commands, and a one-second progress ticker |
| Library database | `expo-sqlite` via `src/db/open.ts`. Schema version 2 |
| Lists and gestures | `@shopify/flash-list`, `react-native-gesture-handler`, `react-native-reanimated` + `react-native-worklets` |
| Files | Local module `modules/audionote-file-access`. `expo-file-system` reads only the head and tail of a file |

`@rntp/player` does not run inside Expo Go. Bundles are dev builds (`expo-dev-client`) or release binaries from the pipelines below. Playback is speech-oriented, keeps playing if the task is removed from recents, and pauses when headphones disconnect.

Background audio:

- iOS `UIBackgroundModes` includes `audio` (`app.config.ts`).
- Android foreground-service permissions come from the player library manifest (`FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`).

`@rntp/player` is free for personal and educational use and requires a commercial license otherwise. See the package `license.txt`.

Typecheck resolves the published player declarations. `tsconfig.json` clears Expo's `react-native` custom condition so TypeScript does not compile the player's TypeScript sources, which import a codegen path React Native 0.88 no longer ships as a sibling `.d.ts`.

## Identifiers and version

| | Value |
| --- | --- |
| Display name | AudioNote |
| iOS bundle id | `app.audionote` |
| Android application id | `app.audionote` |
| URL scheme | `audionote` |
| Marketing version | `APP_VERSION`, or `package.json` `version` (`0.1.0`) |
| Android `versionCode` / iOS `CFBundleVersion` | `ANDROID_VERSION_CODE` / `IOS_BUILD_NUMBER`. CI sets both to `github.run_number`. Tag `v1.2.3` sets the marketing version to `1.2.3`. |

iOS deployment target is 16.4, which matches Expo SDK 58. Android compile SDK 37, target SDK 36, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.30.5, JDK 17. Hermes and the New Architecture are on. The platform package is `platforms;android-37` on older sdkmanager releases and `platforms;android-37.0` on the current Android CLI. CI installs whichever exists and links `platforms/android-37` when only the dotted directory is present. `android-actions/setup-android@v3` is given `packages: platform-tools` only. Its default also requests the obsolete `tools` package, which the SDK repository no longer serves.

Release Android builds do not run R8. The player ships no consumer ProGuard rules, and shrinking a first bundle before those rules exist would risk stripping playback. `expo-build-properties` sets `enableMinifyInReleaseBuilds` to false.

## How a bundle is produced

```text
app.config.ts + plugins
        |
        v
npx expo prebuild --clean --no-install
        |
        +-- android/ --> ./gradlew assembleRelease bundleRelease --> APK + AAB
        |
        +-- ios/ --> pod install --> xcodebuild archive --> IPA
```

`scripts/build-android.sh` and `scripts/build-ios.sh` are the commands CI runs. Local Android builds use the same script. iOS builds need macOS.

### Android signing

`plugins/withAndroidReleaseSigning.js` edits `android/app/build.gradle` during prebuild. When `AUDIONOTE_RELEASE_SIGNING=required` and the upload keystore is missing, Gradle fails instead of using the debug certificate. When the keystore path, store password, key alias, and key password are all set, the release build type uses that keystore. Otherwise the release build type keeps `signingConfigs.debug`.

The upload keystore has to be selected while the release build type is being configured. Android Gradle Plugin copies that choice into the release variant. Setting `signingConfig` later, from `afterEvaluate`, does not change the certificate on the APK: `assembleRelease` still signs with the debug keystore. The plugin assigns `signingConfigs.audionoteRelease` inside the release build type and again in `androidComponents.finalizeDsl`, which runs before the variant is locked. After the variant exists, configuration fails if its store file is not the upload keystore.

`scripts/build-android.sh` selects the mode:

| `AUDIONOTE_RELEASE_SIGNING` | Behavior |
| --- | --- |
| `required` | Production. Credentials are mandatory. After Gradle, `apksigner verify --verbose --print-certs` must show the upload certificate on every APK, and `keytool -printcert` must show it on every AAB. The script then writes `audionote-production-signing.sha256`. |
| `debug` | Ignores upload-key variables, keeps the debug certificate, and writes `DEBUG-SIGNING.txt`. Not for Myket, Play, or any other store. |
| unset or `auto` | Uses `required` when the upload-key credentials are complete, and `debug` when none are set. Partial credentials fail. |

Generate the upload keystore once and reuse it for every store release. For a PKCS12 keystore, the store password and key password are the same. Do not commit the keystore or its passwords. The script decodes `ANDROID_KEYSTORE_BASE64` into `.keystore/` (gitignored, mode `600`) and deletes that file when the process exits. It does not print the keystore or the passwords.

GitHub Actions secrets for production Android builds:

| Secret | Use |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 of the upload `.jks` or `.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Store them as Actions secrets. Do not put them in the repository, in a pull request, or in the workflow log. Pull-request jobs do not reference these secrets, so a pull request from this repository does not receive them. Fork pull requests cannot receive Actions secrets either.

| Trigger | Android artifacts | Signing |
| --- | --- | --- |
| Pull request | `audionote-android-pr-debug-apk`, `audionote-android-pr-debug-aab` | Debug certificate. Do not submit it to a store. |
| Push to `main` | `audionote-android-apk`, `audionote-android-aab` | Upload key required. The job fails before upload if certificate verification did not succeed. |
| Tag `v*` | Same production artifacts, also attached to the GitHub Release | Upload key required. |
| Manual `workflow_dispatch` | Same production artifacts | Upload key required. |

Submit a production artifact from a green `main`, tag, or manual run to Myket. A Gradle `assembleRelease` success is not enough: the workflow uploads the APK only after the certificate stamp exists.

### iOS signing

- Pull requests do not receive iOS signing secrets. `scripts/build-ios.sh` archives with `CODE_SIGNING_ALLOWED=NO` and zips the `.app` into an unsigned `.ipa` named `audionote-ios-pr-ipa`.
- Pushes to `main`, tags, and manual runs pass `IOS_CERTIFICATE_P12_BASE64`, `IOS_CERTIFICATE_PASSWORD`, and `IOS_PROVISIONING_PROFILE_BASE64` only to the build step. The script creates a temporary keychain, imports the certificate, installs the profile, archives with manual signing, and `xcodebuild -exportArchive`s a signed IPA. A profile that lists devices exports as `release-testing`. A distribution profile without devices exports as `app-store-connect`. The artifact name is `audionote-ios-ipa`.
- Optional `IOS_CODE_SIGN_IDENTITY` (default `Apple Distribution`) and `APPLE_TEAM_ID` (written into the native project at prebuild). Without those secrets, a production iOS build is still unsigned.

## GitHub pipelines

| Workflow | When | Runner | Output |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | Pull requests and pushes to `main` | `ubuntu-24.04` | Unit tests, Android signing checks, `tsc`, `expo install --check`, `expo export` for Android and iOS |
| `.github/workflows/mobile-bundles.yml` | Pull requests, `main`, tags `v*`, manual | `ubuntu-24.04` and `macos-26` | PR: `audionote-android-pr-debug-apk`, `audionote-android-pr-debug-aab`, `audionote-ios-pr-ipa`. Production (`main`, tags, manual): `audionote-android-apk`, `audionote-android-aab`, `audionote-ios-ipa` |
| `.github/workflows/eas-build.yml` | Manual | `ubuntu-24.04` | EAS build queued for an `eas.json` profile. Requires `EXPO_TOKEN` |

`macos-26` provides Xcode 26.4+, which Expo SDK 58 requires. Tag pushes that build both binaries publish them on a GitHub Release. Pull-request bundle jobs are cancelled when a newer commit arrives. Tag jobs are not cancelled.

`eas.json` profiles, for the optional EAS path and for local `eas build`:

| Profile | Android | iOS |
| --- | --- | --- |
| `development` | Dev client APK, internal | Simulator dev client |
| `preview` | APK, internal | Device build |
| `production` | AAB | Store build |

`appVersionSource` is `local`, so versions come from `app.config.ts` rather than the EAS service.

## Native modules in the binary

Autolinking includes every native dependency in `package.json`, plus packages under `modules/`. `audionote-file-access` lives in both places: Metro resolves the `file:` dependency, and autolinking sees one module because the `node_modules` entry and `modules/audionote-file-access` are the same directory. The Android library sets `version` in its `build.gradle`; the Expo module plugin will not configure the project without it. The release binary links the player, SQLite, the file system, gesture handler, Reanimated, FlashList, and this file-access module.

JavaScript export (`npm run export`) embeds the Hermes bundle Metro produces for both platforms. It does not compile Kotlin or Swift. The mobile-bundles workflow is what proves the native project links and archives. `babel.config.js` loads `babel-preset-expo` and the Reanimated plugin, so `babel-preset-expo` is a direct dependency. Metro does not see the copy nested under `expo`.

## Library and playback

Lessons stay in their original location. Import uses `ACTION_OPEN_DOCUMENT` on Android and `UIDocumentPicker` with `asCopy: false` on iOS. The picker delegate is its own `NSObject`, because Expo's `Module` class cannot conform to `UIDocumentPickerDelegate`. Android keeps a persistable read grant on the `content://` URI. iOS stores a base64 security-scoped bookmark and resolves it to a file URL before playback. Re-importing the same header fingerprint refreshes that grant on the existing row, so notes remain. Locate file does the same for a chosen row when the URI no longer opens.

Duration is read from the first or last 512KB: an M4A `mvhd` atom, an MP3 Xing frame count, or a CBR estimate from the MPEG frame length. The player later replaces that hint with its own duration and does not overwrite the format column. M4A/AAC is the format to prefer for a multi-hour lesson. VBR MP3 without a Xing header can seek and measure poorly.

Tables, migrated by the `schema_version` row (currently 4):

| Table | Role |
| --- | --- |
| `audio_item` | URI, bookmark, fingerprint, title, duration, format, missing flag |
| `playback_state` | Resume position and speed |
| `listen_range` | Heard intervals. A seek gap above 4 seconds starts a new range, so progress percent is not the resume cursor. A later pass that starts within a minute and continues the previous end extends that row (`anchor_at` is the latest piece). Replays stay separate |
| `listen_mark` | Spans played more than once. Rebuilt when a row is saved or a growing row crosses another row, not on every progress tick |
| `note` | Text at a timeline position |
| `jump` | Per-lesson seek history: position before the jump, position landed on, newest first. The latest 50 rows are kept |
| `setting` | Skip-back and skip-forward intervals |

These are versioned SQL statements. A query layer such as Drizzle can wrap the same tables later. The `jump` table is created with the rest of the schema (`CREATE TABLE IF NOT EXISTS`), including databases that were already on version 2.

The progress ticker samples about once a second. It writes the resume position every five samples and whenever playback pauses, including when the app leaves the foreground. The player UI polls progress at 4 Hz. Continue listening is the most recently updated item whose position is past one second and short of the end. Search is a debounced `LIKE` on the title.

Timed notes are stored three seconds before the displayed position, including a scrub preview. Markers sit on the scrub bar. The bar's horizontal pan gets finer as the finger moves vertically (`1 / (1 + |y| / 100)`). Double-tap zones sit above the bar so that gesture does not delay the pan. Skip defaults are −15s and +30s, adjustable in 5 second steps and published to the lock screen. Speed runs from 0.5× to 3×. Sleep uses the player's wall-clock timer. Replay jumps back 10 seconds. A-B loop seeks back to A when playback reaches B.

Jump history records a scrub, a tap on the timeline, or a jump to a note. The list opens from the timeline on the playback dock. It ignores playback, the skip buttons, and the 10 second replay. A drag updates an in-memory jump and writes nothing until the finger lifts. Further seeks within about 1.8 seconds keep the first origin and the last landing spot, then one row is saved. The row is dropped when that distance is under 10 seconds. Pause, leaving the player, switching lessons, and the app leaving the foreground flush the pending jump immediately. Tapping a row seeks back to its origin and does not add a row. Times at an hour or longer use `h:mm:ss`.

Backup and export of the library JSON and notes Markdown is a later milestone. Jump rows live in the same database and belong in that export. So does a full play-through of a 9 hour file on a device.
