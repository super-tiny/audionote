#!/usr/bin/env bash
# Prebuild the Android project and produce a release APK and AAB.
# Without an upload keystore, Gradle keeps the debug signing config so the
# APK can be installed. Set ANDROID_KEYSTORE_BASE64 plus the password, alias,
# and key password to sign with a Play upload key.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${ANDROID_KEYSTORE_BASE64:-}" ]]; then
  : "${ANDROID_KEYSTORE_PASSWORD:?ANDROID_KEYSTORE_PASSWORD is required when ANDROID_KEYSTORE_BASE64 is set}"
  : "${ANDROID_KEY_ALIAS:?ANDROID_KEY_ALIAS is required when ANDROID_KEYSTORE_BASE64 is set}"
  : "${ANDROID_KEY_PASSWORD:?ANDROID_KEY_PASSWORD is required when ANDROID_KEYSTORE_BASE64 is set}"

  KEYSTORE_PATH="${AUDIONOTE_UPLOAD_STORE_FILE:-$ROOT/.keystore/release.keystore}"
  mkdir -p "$(dirname "$KEYSTORE_PATH")"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -D > "$KEYSTORE_PATH"
  else
    printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_PATH"
  fi
  export AUDIONOTE_UPLOAD_STORE_FILE="$KEYSTORE_PATH"
  export AUDIONOTE_UPLOAD_STORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
  export AUDIONOTE_UPLOAD_KEY_ALIAS="$ANDROID_KEY_ALIAS"
  export AUDIONOTE_UPLOAD_KEY_PASSWORD="$ANDROID_KEY_PASSWORD"
  echo "Android release signing: upload keystore"
else
  echo "Android release signing: debug keystore (installable CI artifact)"
fi

npx expo prebuild --platform android --no-install --clean

cd android
./gradlew assembleRelease bundleRelease --no-daemon --stacktrace

shopt -s nullglob
apks=(app/build/outputs/apk/release/*.apk)
aabs=(app/build/outputs/bundle/release/*.aab)
shopt -u nullglob

if [[ ${#apks[@]} -eq 0 || ${#aabs[@]} -eq 0 ]]; then
  echo "Gradle finished without a release APK and AAB." >&2
  exit 1
fi

echo "APK: ${apks[0]}"
echo "AAB: ${aabs[0]}"
