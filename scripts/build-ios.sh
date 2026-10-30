#!/usr/bin/env bash
# Prebuild the iOS project and produce a Release .ipa.
# Without signing secrets this is an unsigned device bundle (CODE_SIGNING_ALLOWED=NO).
# With IOS_CERTIFICATE_P12_BASE64, IOS_CERTIFICATE_PASSWORD, and
# IOS_PROVISIONING_PROFILE_BASE64, the archive is signed and exported.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx expo prebuild --platform ios --no-install --clean

cd ios
pod install

project="$(find . -maxdepth 1 -name '*.xcodeproj' -print -quit)"
if [[ -z "$project" ]]; then
  echo "No Xcode project was generated." >&2
  exit 1
fi

scheme="$(basename "$project" .xcodeproj)"
workspace="${scheme}.xcworkspace"
archive="$ROOT/dist/ios/${scheme}.xcarchive"
ipa="$ROOT/dist/ios/${scheme}.ipa"
mkdir -p "$ROOT/dist/ios"

sign_args=(
  CODE_SIGNING_ALLOWED=NO
  CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_IDENTITY=""
)
export_signed=0
keychain_path=""

cleanup() {
  if [[ -n "$keychain_path" && -f "$keychain_path" ]]; then
    security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -n "${IOS_CERTIFICATE_P12_BASE64:-}" || -n "${IOS_PROVISIONING_PROFILE_BASE64:-}" ]]; then
  : "${IOS_CERTIFICATE_P12_BASE64:?IOS_CERTIFICATE_P12_BASE64 is required to sign}"
  : "${IOS_CERTIFICATE_PASSWORD:?IOS_CERTIFICATE_PASSWORD is required to sign}"
  : "${IOS_PROVISIONING_PROFILE_BASE64:?IOS_PROVISIONING_PROFILE_BASE64 is required to sign}"

  work="$(mktemp -d)"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf '%s' "$IOS_CERTIFICATE_P12_BASE64" | base64 -D > "$work/cert.p12"
    printf '%s' "$IOS_PROVISIONING_PROFILE_BASE64" | base64 -D > "$work/profile.mobileprovision"
  else
    printf '%s' "$IOS_CERTIFICATE_P12_BASE64" | base64 -d > "$work/cert.p12"
    printf '%s' "$IOS_PROVISIONING_PROFILE_BASE64" | base64 -d > "$work/profile.mobileprovision"
  fi
  security cms -D -i "$work/profile.mobileprovision" > "$work/profile.plist"
  profile_name="$(plutil -extract Name raw "$work/profile.plist")"
  team_id="$(plutil -extract TeamIdentifier.0 raw "$work/profile.plist")"
  profile_uuid="$(plutil -extract UUID raw "$work/profile.plist")"

  profile_dir="$HOME/Library/MobileDevice/Provisioning Profiles"
  mkdir -p "$profile_dir"
  cp "$work/profile.mobileprovision" "$profile_dir/${profile_uuid}.mobileprovision"

  keychain_path="$work/audionote.keychain-db"
  keychain_password="$(openssl rand -base64 24)"
  security create-keychain -p "$keychain_password" "$keychain_path"
  security set-keychain-settings -lut 21600 "$keychain_path"
  security unlock-keychain -p "$keychain_password" "$keychain_path"
  security import "$work/cert.p12" -k "$keychain_path" -P "$IOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain_path"
  security list-keychains -d user -s "$keychain_path" "$(security list-keychains -d user | sed -e 's/^ *"//' -e 's/"$//')"

  sign_args=(
    CODE_SIGNING_ALLOWED=YES
    CODE_SIGN_STYLE=Manual
    "CODE_SIGN_IDENTITY=${IOS_CODE_SIGN_IDENTITY:-Apple Distribution}"
    "PROVISIONING_PROFILE_SPECIFIER=${profile_name}"
    "DEVELOPMENT_TEAM=${team_id}"
  )
  export_signed=1
  echo "iOS signing: ${profile_name}"
else
  echo "iOS signing: unsigned device archive"
fi

xcodebuild archive \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Release \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -archivePath "$archive" \
  COMPILER_INDEX_STORE_ENABLE=NO \
  "${sign_args[@]}"

app="$(find "$archive/Products/Applications" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "$app" ]]; then
  echo "Archive did not contain an .app bundle." >&2
  exit 1
fi

if [[ "$export_signed" -eq 1 ]]; then
  method="app-store-connect"
  if plutil -extract ProvisionedDevices raw "$work/profile.plist" >/dev/null 2>&1; then
    method="release-testing"
  fi
  cat > "$ROOT/dist/ios/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${method}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>teamID</key>
  <string>${team_id}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>app.audionote</key>
    <string>${profile_name}</string>
  </dict>
</dict>
</plist>
EOF
  xcodebuild -exportArchive \
    -archivePath "$archive" \
    -exportPath "$ROOT/dist/ios/export" \
    -exportOptionsPlist "$ROOT/dist/ios/ExportOptions.plist"
  exported="$(find "$ROOT/dist/ios/export" -maxdepth 1 -name '*.ipa' -print -quit)"
  cp "$exported" "$ipa"
else
  payload="$(mktemp -d)/Payload"
  mkdir -p "$payload"
  cp -R "$app" "$payload/"
  rm -f "$ipa"
  (cd "$(dirname "$payload")" && zip -qr "$ipa" Payload)
fi

echo "IPA: $ipa"
