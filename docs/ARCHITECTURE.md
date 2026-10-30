# AudioNote architecture

AudioNote is a local-only React Native app for long study audio. This document records the build architecture that produces installable Android and iOS bundles, and the app shell those bundles contain.

## App shell

Expo SDK 58 (React Native 0.88, New Architecture) with continuous native generation. `android/` and `ios/` are not committed. `npx expo prebuild` creates them from `app.config.ts` and config plugins.

| Concern | Module |
| --- | --- |
| Entry | `index.ts` registers the playback session, then the root component |
| Playback | `@rntp/player` (React Native Track Player v5). `src/playback/session.ts` calls `setupPlayer` and publishes lock-screen commands (play/pause, seek, −15s / +30s) |
| Library database | `expo-sqlite` via `src/db/open.ts`. Schema is versioned by a `schema_version` row |
| Lists and gestures | `@shopify/flash-list`, `react-native-gesture-handler`, `react-native-reanimated` + `react-native-worklets` |
| Files | `expo-document-picker` and `expo-file-system` are linked so later import work does not change the native graph |

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

`plugins/withAndroidReleaseSigning.js` appends a Gradle snippet:

- If `AUDIONOTE_UPLOAD_STORE_FILE` is set (env or Gradle property), release uses that keystore, plus `AUDIONOTE_UPLOAD_STORE_PASSWORD`, `AUDIONOTE_UPLOAD_KEY_ALIAS`, and `AUDIONOTE_UPLOAD_KEY_PASSWORD`.
- Otherwise the Expo/React Native release build type keeps `signingConfigs.debug`, so the APK installs without a committed secret.

CI maps repository secrets into those variables:

| Secret | Use |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 of the upload `.jks` / `.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

The script writes the decoded keystore under `.keystore/`, which is gitignored. Artifacts signed with the debug keystore are for sideloading. Play Console needs the upload keystore secrets.

### iOS signing

- No signing secrets: `xcodebuild archive` with `CODE_SIGNING_ALLOWED=NO`, then the `.app` is zipped into an unsigned `.ipa`.
- `IOS_CERTIFICATE_P12_BASE64`, `IOS_CERTIFICATE_PASSWORD`, and `IOS_PROVISIONING_PROFILE_BASE64`: the script creates a temporary keychain, imports the certificate, installs the profile, archives with manual signing, and `xcodebuild -exportArchive`s a signed IPA. A profile that lists devices exports as `release-testing`. A distribution profile without devices exports as `app-store-connect`.
- Optional `IOS_CODE_SIGN_IDENTITY` (default `Apple Distribution`) and `APPLE_TEAM_ID` (written into the native project at prebuild).

## GitHub pipelines

| Workflow | When | Runner | Output |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | Pull requests and pushes to `main` | `ubuntu-24.04` | `tsc`, `expo install --check`, `expo export` for Android and iOS |
| `.github/workflows/mobile-bundles.yml` | Pull requests, `main`, tags `v*`, manual | `ubuntu-24.04` and `macos-26` | `audionote-android-apk`, `audionote-android-aab`, `audionote-ios-ipa` |
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

Autolinking includes every native dependency in `package.json`, whether or not the current screen imports it. The release binary therefore already links the player, SQLite, the document picker, the file system, gesture handler, Reanimated, and FlashList. Adding a later milestone should not require a new native dependency for those pieces.

JavaScript export (`npm run export`) embeds the Hermes bundle Metro produces for both platforms. It does not compile Kotlin or Swift. The mobile-bundles workflow is what proves the native project links and archives. `babel.config.js` loads `babel-preset-expo` and the Reanimated plugin, so `babel-preset-expo` is a direct dependency. Metro does not see the copy nested under `expo`.

## Not in this slice

Library import, resume ranges, timed notes, swipe seek, and backup/export are later milestones. The database opener only ensures `schema_version`. The player session does not yet load a local file. Those features sit on top of this bundle pipeline.
