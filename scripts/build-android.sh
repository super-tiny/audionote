#!/usr/bin/env bash
# Build a release APK and AAB with Expo prebuild and Gradle.
#
# AUDIONOTE_RELEASE_SIGNING:
#   required  Production. The upload keystore is mandatory. Gradle and this
#             script both fail instead of signing with the debug certificate.
#             The APK (apksigner) and AAB (keytool) must match that certificate.
#   debug     Pull-request / local install build. Upload-key variables are
#             ignored. The artifact is not for Myket, Play, or any other store.
#   auto      Default for local runs. Complete upload-key credentials select
#             required. No credentials select debug. Partial credentials fail.
#
# CI secret names are ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD,
# ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD. Gradle reads the
# AUDIONOTE_UPLOAD_* variables. Do not enable xtrace: bash -x would print
# the keystore passwords. Never commit the keystore.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE_DIR="${AUDIONOTE_KEYSTORE_DIR:-$ROOT/.keystore}"
PRODUCTION_STAMP_PATH="${AUDIONOTE_SIGNING_STAMP_PATH:-$ROOT/android/app/build/outputs/audionote-production-signing.sha256}"
DEBUG_MARKER_PATH="${AUDIONOTE_DEBUG_MARKER_PATH:-$ROOT/android/app/build/outputs/DEBUG-SIGNING.txt}"

KEYSTORE_CREATED=0
KEYSTORE_PATH=""
KEY_PASSWORD_CHECK_DIR=""
EXPECTED_FINGERPRINT=""

normalize_fingerprint() {
  local hex
  hex="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cd '0-9a-f')"
  if [[ ${#hex} -ne 64 ]]; then
    return 1
  fi
  printf '%s' "$hex"
}

format_fingerprint() {
  local hex="$1" index pair formatted=""
  for ((index = 0; index < 64; index += 2)); do
    pair="$(printf '%s' "${hex:index:2}" | tr '[:lower:]' '[:upper:]')"
    if [[ -n "$formatted" ]]; then
      formatted="${formatted}:${pair}"
    else
      formatted="$pair"
    fi
  done
  printf '%s' "$formatted"
}

# Certificate SHA-256 values only. Ignores public-key digests and
# "SHA256withRSA" algorithm names.
extract_sha256_fingerprints() {
  local line hex normalized
  while IFS= read -r line || [[ -n "$line" ]]; do
    hex=""
    if [[ "$line" =~ certificate\ SHA-256\ digest:[[:space:]]*([0-9A-Fa-f:]+) ]]; then
      hex="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^[[:space:]]*SHA256:[[:space:]]*([0-9A-Fa-f:]+)[[:space:]]*$ ]]; then
      hex="${BASH_REMATCH[1]}"
    else
      continue
    fi
    if normalized="$(normalize_fingerprint "$hex")"; then
      printf '%s\n' "$normalized"
    fi
  done
}

primary_sha256() {
  local text="$1" line
  while IFS= read -r line; do
    if [[ -n "$line" ]]; then
      printf '%s' "$line"
      return 0
    fi
  done < <(printf '%s\n' "$text" | extract_sha256_fingerprints)
  return 1
}

value_present() {
  local name="$1" value=""
  case "$name" in
    ''|*[!A-Za-z0-9_]*) return 1 ;;
  esac
  if printenv "$name" >/dev/null 2>&1; then
    value="$(printenv "$name")"
  fi
  [[ -n "${value//[[:space:]]/}" ]]
}

first_present() {
  local name
  for name in "$@"; do
    if value_present "$name"; then
      printf '%s' "${!name}"
      return 0
    fi
  done
}

output_contains_secret() {
  local output="$1" secret="$2"
  [[ -n "$secret" ]] || return 1
  case "$output" in
    *"$secret"*) return 0 ;;
    *) return 1 ;;
  esac
}

tool_output_leaks_secret() {
  local output="$1" secret
  for secret in \
    "${AUDIONOTE_UPLOAD_STORE_PASSWORD:-}" \
    "${AUDIONOTE_UPLOAD_KEY_PASSWORD:-}" \
    "${AUDIONOTE_UPLOAD_KEY_ALIAS:-}" \
    "${ANDROID_KEYSTORE_BASE64:-}" \
    "${ANDROID_KEYSTORE_PASSWORD:-}" \
    "${ANDROID_KEY_PASSWORD:-}" \
    "${ANDROID_KEY_ALIAS:-}"
  do
    if output_contains_secret "$output" "$secret"; then
      return 0
    fi
  done
  return 1
}

print_tool_output() {
  local output="$1"
  if tool_output_leaks_secret "$output"; then
    echo "Keystore tool output was discarded because it contained a signing secret." >&2
    return 0
  fi
  printf '%s\n' "$output" >&2
}

any_signing_input_present() {
  local name
  for name in \
    ANDROID_KEYSTORE_BASE64 \
    ANDROID_KEYSTORE_PASSWORD \
    ANDROID_KEY_ALIAS \
    ANDROID_KEY_PASSWORD \
    AUDIONOTE_UPLOAD_STORE_FILE \
    AUDIONOTE_UPLOAD_STORE_PASSWORD \
    AUDIONOTE_UPLOAD_KEY_ALIAS \
    AUDIONOTE_UPLOAD_KEY_PASSWORD
  do
    if value_present "$name"; then
      return 0
    fi
  done
  return 1
}

signing_inputs_complete() {
  local store_password key_alias key_password
  store_password="$(first_present ANDROID_KEYSTORE_PASSWORD AUDIONOTE_UPLOAD_STORE_PASSWORD)"
  key_alias="$(first_present ANDROID_KEY_ALIAS AUDIONOTE_UPLOAD_KEY_ALIAS)"
  key_password="$(first_present ANDROID_KEY_PASSWORD AUDIONOTE_UPLOAD_KEY_PASSWORD)"
  if [[ -z "$store_password" || -z "$key_alias" || -z "$key_password" ]]; then
    return 1
  fi
  if value_present ANDROID_KEYSTORE_BASE64; then
    return 0
  fi
  if value_present AUDIONOTE_UPLOAD_STORE_FILE && [[ -f "${AUDIONOTE_UPLOAD_STORE_FILE}" ]]; then
    return 0
  fi
  return 1
}

explain_missing_signing() {
  echo "Production Android signing is incomplete. Set every one of these:" >&2
  echo "  ANDROID_KEYSTORE_BASE64, or AUDIONOTE_UPLOAD_STORE_FILE pointing at an existing keystore" >&2
  echo "  ANDROID_KEYSTORE_PASSWORD, or AUDIONOTE_UPLOAD_STORE_PASSWORD" >&2
  echo "  ANDROID_KEY_ALIAS, or AUDIONOTE_UPLOAD_KEY_ALIAS" >&2
  echo "  ANDROID_KEY_PASSWORD, or AUDIONOTE_UPLOAD_KEY_PASSWORD" >&2
  echo "Do not commit the keystore or these passwords." >&2
  if value_present AUDIONOTE_UPLOAD_STORE_FILE && [[ ! -f "${AUDIONOTE_UPLOAD_STORE_FILE}" ]]; then
    echo "AUDIONOTE_UPLOAD_STORE_FILE is set but the keystore file is missing." >&2
  fi
}

select_signing_mode() {
  local requested="${AUDIONOTE_RELEASE_SIGNING:-auto}"
  case "$requested" in
    required|debug|auto) ;;
    *)
      echo "AUDIONOTE_RELEASE_SIGNING must be required, debug, or auto." >&2
      return 1
      ;;
  esac

  if [[ "$requested" == "debug" ]]; then
    printf '%s' debug
    return 0
  fi

  if signing_inputs_complete; then
    printf '%s' required
    return 0
  fi

  if [[ "$requested" == "auto" ]] && ! any_signing_input_present; then
    printf '%s' debug
    return 0
  fi

  explain_missing_signing
  if [[ "$requested" == "required" ]]; then
    echo "Production signing is required. Refusing the debug keystore." >&2
  else
    echo "Refusing the debug keystore because signing settings are incomplete." >&2
  fi
  return 1
}

clear_upload_signing_env() {
  unset ANDROID_KEYSTORE_BASE64 \
    ANDROID_KEYSTORE_PASSWORD \
    ANDROID_KEY_ALIAS \
    ANDROID_KEY_PASSWORD \
    AUDIONOTE_UPLOAD_STORE_FILE \
    AUDIONOTE_UPLOAD_STORE_PASSWORD \
    AUDIONOTE_UPLOAD_KEY_ALIAS \
    AUDIONOTE_UPLOAD_KEY_PASSWORD || true
}

decode_base64_to() {
  local dest="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -D > "$dest"
  else
    printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$dest"
  fi
}

cleanup_keystore() {
  if [[ "${KEYSTORE_CREATED}" == 1 && -n "${KEYSTORE_PATH}" && -f "${KEYSTORE_PATH}" ]]; then
    rm -f "${KEYSTORE_PATH}"
  fi
  if [[ -n "${KEY_PASSWORD_CHECK_DIR}" && -d "${KEY_PASSWORD_CHECK_DIR}" ]]; then
    rm -rf "${KEY_PASSWORD_CHECK_DIR}"
  fi
}

prepare_upload_keystore() {
  local old_umask store_password key_alias key_password output store_type check_output check_store fingerprint line

  store_password="$(first_present ANDROID_KEYSTORE_PASSWORD AUDIONOTE_UPLOAD_STORE_PASSWORD)"
  key_alias="$(first_present ANDROID_KEY_ALIAS AUDIONOTE_UPLOAD_KEY_ALIAS)"
  key_password="$(first_present ANDROID_KEY_PASSWORD AUDIONOTE_UPLOAD_KEY_PASSWORD)"
  if [[ -z "$store_password" || -z "$key_alias" || -z "$key_password" ]]; then
    explain_missing_signing
    return 1
  fi

  old_umask="$(umask)"
  umask 077
  mkdir -p "$KEYSTORE_DIR"
  chmod 700 "$KEYSTORE_DIR"

  if value_present ANDROID_KEYSTORE_BASE64; then
    KEYSTORE_PATH="$(mktemp "$KEYSTORE_DIR/release.XXXXXXXX.keystore")"
    KEYSTORE_CREATED=1
    if ! decode_base64_to "$KEYSTORE_PATH"; then
      echo "Could not decode ANDROID_KEYSTORE_BASE64." >&2
      umask "$old_umask"
      return 1
    fi
    # Drop the keystore bytes from the environment before Gradle starts.
    unset ANDROID_KEYSTORE_BASE64 || true
    chmod 600 "$KEYSTORE_PATH"
    if [[ ! -s "$KEYSTORE_PATH" ]]; then
      echo "Decoded upload keystore is empty." >&2
      umask "$old_umask"
      return 1
    fi
  elif value_present AUDIONOTE_UPLOAD_STORE_FILE && [[ -f "${AUDIONOTE_UPLOAD_STORE_FILE}" ]]; then
    KEYSTORE_PATH="${AUDIONOTE_UPLOAD_STORE_FILE}"
    KEYSTORE_CREATED=0
  else
    explain_missing_signing
    umask "$old_umask"
    return 1
  fi
  umask "$old_umask"

  export AUDIONOTE_UPLOAD_STORE_FILE="$KEYSTORE_PATH"
  export AUDIONOTE_UPLOAD_STORE_PASSWORD="$store_password"
  export AUDIONOTE_UPLOAD_KEY_ALIAS="$key_alias"
  export AUDIONOTE_UPLOAD_KEY_PASSWORD="$key_password"
  unset ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD || true

  if ! output="$(keytool -list -keystore "$KEYSTORE_PATH" -storepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD 2>&1)"; then
    echo "Could not open the upload keystore. Check the keystore password." >&2
    print_tool_output "$output"
    return 1
  fi

  store_type=""
  while IFS= read -r line; do
    case "$line" in
      "Keystore type: "*)
        store_type="${line#Keystore type: }"
        break
        ;;
    esac
  done <<< "$output"
  if [[ -z "$store_type" ]]; then
    echo "Could not read the upload keystore type." >&2
    return 1
  fi
  if [[ "$store_type" == "PKCS12" && "$AUDIONOTE_UPLOAD_STORE_PASSWORD" != "$AUDIONOTE_UPLOAD_KEY_PASSWORD" ]]; then
    echo "PKCS12 upload keystores use one password. The store password and key password must match." >&2
    return 1
  fi

  KEY_PASSWORD_CHECK_DIR="$(mktemp -d)"
  chmod 700 "$KEY_PASSWORD_CHECK_DIR"
  check_store="$KEY_PASSWORD_CHECK_DIR/check.keystore"
  if ! check_output="$(keytool -importkeystore -noprompt \
      -srckeystore "$KEYSTORE_PATH" \
      -destkeystore "$check_store" \
      -srcstoretype "$store_type" \
      -deststoretype PKCS12 \
      -srcalias "$AUDIONOTE_UPLOAD_KEY_ALIAS" \
      -srcstorepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD \
      -srckeypass:env AUDIONOTE_UPLOAD_KEY_PASSWORD \
      -deststorepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD 2>&1)"; then
    rm -rf "$KEY_PASSWORD_CHECK_DIR"
    KEY_PASSWORD_CHECK_DIR=""
    echo "Could not unlock the upload key. Check the key alias and key password." >&2
    print_tool_output "$check_output"
    return 1
  fi
  rm -rf "$KEY_PASSWORD_CHECK_DIR"
  KEY_PASSWORD_CHECK_DIR=""

  if ! output="$(keytool -list -v \
      -keystore "$KEYSTORE_PATH" \
      -alias "$AUDIONOTE_UPLOAD_KEY_ALIAS" \
      -storepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD 2>&1)"; then
    echo "Could not read the upload certificate. Check the key alias." >&2
    print_tool_output "$output"
    return 1
  fi
  if printf '%s\n' "$output" | grep -F -q 'CN=Android Debug'; then
    echo "The upload keystore is the Android debug certificate. Production builds cannot use it." >&2
    return 1
  fi
  if ! fingerprint="$(primary_sha256 "$output")"; then
    echo "The upload keystore did not contain a SHA-256 certificate fingerprint." >&2
    return 1
  fi
  EXPECTED_FINGERPRINT="$fingerprint"
  echo "Android signing: upload keystore. Certificate SHA-256 $(format_fingerprint "$EXPECTED_FINGERPRINT")." >&2
}

begin_signing() {
  local mode
  mode="$(select_signing_mode)" || return 1
  export AUDIONOTE_RELEASE_SIGNING="$mode"
  if [[ "$mode" == "debug" ]]; then
    clear_upload_signing_env
    echo "Android signing: debug certificate. Not for Myket, Play, or any other store." >&2
    return 0
  fi
  prepare_upload_keystore
}

find_apksigner() {
  local sdk="" sdk_dir="" dir="" latest=""
  if [[ -n "${APKSIGNER:-}" && -x "${APKSIGNER}" ]]; then
    printf '%s' "$APKSIGNER"
    return 0
  fi
  if command -v apksigner >/dev/null 2>&1; then
    command -v apksigner
    return 0
  fi

  sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [[ -z "$sdk" && -f "$ROOT/android/local.properties" ]]; then
    local properties_line
    while IFS= read -r properties_line || [[ -n "$properties_line" ]]; do
      case "$properties_line" in
        sdk.dir=*)
          sdk_dir="${properties_line#sdk.dir=}"
          break
          ;;
      esac
    done < "$ROOT/android/local.properties"
    sdk_dir="${sdk_dir//\\:/:}"
    sdk_dir="${sdk_dir//\\\\/\\}"
    sdk="$sdk_dir"
  fi
  if [[ -z "$sdk" || ! -d "$sdk/build-tools" ]]; then
    echo "apksigner was not found. Install Android build-tools or set ANDROID_HOME." >&2
    return 1
  fi

  while IFS= read -r dir; do
    if [[ -x "$dir/apksigner" ]]; then
      latest="$dir/apksigner"
    fi
  done < <(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -t. -k1,1n -k2,2n -k3,3n)
  if [[ -z "$latest" ]]; then
    echo "apksigner was not found under the Android SDK build-tools directory." >&2
    return 1
  fi
  printf '%s' "$latest"
}

apk_signer_output() {
  local apk="$1" signer output
  signer="$(find_apksigner)" || return 1
  if ! output="$("$signer" verify --verbose --print-certs "$apk" 2>&1)"; then
    echo "apksigner rejected $(basename "$apk")." >&2
    print_tool_output "$output"
    return 1
  fi
  printf '%s\n' "$output"
}

verify_apk_certificate() {
  local apk="$1" output actual
  output="$(apk_signer_output "$apk")" || return 1
  if ! actual="$(primary_sha256 "$output")"; then
    echo "APK $(basename "$apk") has no certificate SHA-256 fingerprint." >&2
    return 1
  fi
  if [[ "$actual" != "$EXPECTED_FINGERPRINT" ]]; then
    echo "APK $(basename "$apk") SHA-256 $(format_fingerprint "$actual") does not match the upload key $(format_fingerprint "$EXPECTED_FINGERPRINT")." >&2
    return 1
  fi
  echo "Verified APK $(basename "$apk") SHA-256 $(format_fingerprint "$actual")." >&2
}

verify_aab_certificate() {
  local aab="$1" output actual
  if ! output="$(keytool -printcert -jarfile "$aab" 2>&1)"; then
    echo "Could not read the signing certificate from AAB $(basename "$aab")." >&2
    print_tool_output "$output"
    return 1
  fi
  if ! actual="$(primary_sha256 "$output")"; then
    echo "AAB $(basename "$aab") has no certificate SHA-256 fingerprint." >&2
    return 1
  fi
  if [[ "$actual" != "$EXPECTED_FINGERPRINT" ]]; then
    echo "AAB $(basename "$aab") SHA-256 $(format_fingerprint "$actual") does not match the upload key $(format_fingerprint "$EXPECTED_FINGERPRINT")." >&2
    return 1
  fi
  echo "Verified AAB $(basename "$aab") SHA-256 $(format_fingerprint "$actual")." >&2
}

write_production_stamp() {
  local directory tmp
  directory="$(dirname "$PRODUCTION_STAMP_PATH")"
  mkdir -p "$directory" || return 1
  tmp="$(mktemp "$directory/stamp.XXXXXXXX")"
  printf '%s\n' "$EXPECTED_FINGERPRINT" > "$tmp"
  mv "$tmp" "$PRODUCTION_STAMP_PATH"
  rm -f "$DEBUG_MARKER_PATH"
  [[ -s "$PRODUCTION_STAMP_PATH" ]]
}

write_debug_marker() {
  local apk output digest body
  mkdir -p "$(dirname "$DEBUG_MARKER_PATH")"
  body="This Android build is signed with the debug certificate."
  body="${body}"$'\n'"Do not submit this APK or AAB to Myket, Google Play, or any other store."
  for apk in "$@"; do
    output="$(apk_signer_output "$apk")" || return 1
    if ! digest="$(primary_sha256 "$output")"; then
      echo "Debug APK $(basename "$apk") has no certificate SHA-256 fingerprint." >&2
      return 1
    fi
    body="${body}"$'\n'"APK $(basename "$apk") SHA-256: $(format_fingerprint "$digest")"
  done
  printf '%s\n' "$body" > "$DEBUG_MARKER_PATH"
  rm -f "$PRODUCTION_STAMP_PATH"
}

main() {
  local -a apks=() aabs=()
  cd "$ROOT"
  trap cleanup_keystore EXIT
  rm -f "$PRODUCTION_STAMP_PATH" "$DEBUG_MARKER_PATH"
  begin_signing || return 1

  npx expo prebuild --platform android --no-install --clean || return 1

  (
    cd "$ROOT/android"
    ./gradlew assembleRelease bundleRelease --no-daemon --stacktrace
  ) || return 1

  shopt -s nullglob
  apks=("$ROOT"/android/app/build/outputs/apk/release/*.apk)
  aabs=("$ROOT"/android/app/build/outputs/bundle/release/*.aab)
  shopt -u nullglob
  if [[ ${#apks[@]} -eq 0 || ${#aabs[@]} -eq 0 ]]; then
    echo "Gradle finished without a release APK and AAB." >&2
    return 1
  fi

  if [[ "$AUDIONOTE_RELEASE_SIGNING" == "debug" ]]; then
    write_debug_marker "${apks[@]}" || return 1
    if [[ -f "$PRODUCTION_STAMP_PATH" ]]; then
      echo "Debug build wrote a production signing stamp." >&2
      return 1
    fi
    echo "Debug-signed APK: ${apks[0]}" >&2
    echo "Debug-signed AAB: ${aabs[0]}" >&2
    return 0
  fi

  local apk aab
  for apk in "${apks[@]}"; do
    verify_apk_certificate "$apk" || return 1
  done
  for aab in "${aabs[@]}"; do
    verify_aab_certificate "$aab" || return 1
  done
  write_production_stamp || return 1
  if [[ ! -s "$PRODUCTION_STAMP_PATH" ]]; then
    echo "Certificate verification did not record a signing stamp." >&2
    return 1
  fi
  echo "Production APK: ${apks[0]}" >&2
  echo "Production AAB: ${aabs[0]}" >&2
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
