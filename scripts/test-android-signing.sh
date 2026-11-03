#!/usr/bin/env bash
# Checks Android signing behavior without a Gradle build.
# Certificate comparison is exercised against a real keystore. When apksigner
# is on PATH or APKSIGNER is set, an APK signed with that keystore must match
# and a different key must fail.

set -euo pipefail

if ! command -v keytool >/dev/null 2>&1 || ! command -v jarsigner >/dev/null 2>&1; then
  echo "keytool and jarsigner are required." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
chmod 700 "$WORK"
export AUDIONOTE_KEYSTORE_DIR="$WORK/keystores"
export AUDIONOTE_SIGNING_STAMP_PATH="$WORK/audionote-production-signing.sha256"
export AUDIONOTE_DEBUG_MARKER_PATH="$WORK/DEBUG-SIGNING.txt"
mkdir -p "$AUDIONOTE_KEYSTORE_DIR"
chmod 700 "$AUDIONOTE_KEYSTORE_DIR"

# shellcheck disable=SC1091
source "$ROOT/scripts/build-android.sh"

STORE_PASS="test-only-not-a-secret"
KEY_PASS="$STORE_PASS"
OTHER_PASS="different-test-password"
checks=0

cleanup_all() {
  cleanup_keystore
  rm -rf "$WORK"
}
trap cleanup_all EXIT

pass() {
  checks=$((checks + 1))
  printf 'ok %s\n' "$1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

assert_eq() {
  local actual="$1" expected="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: expected ${expected}, got ${actual}"
  fi
}

assert_no_secrets() {
  local output="$1" label="$2" secret
  for secret in "$STORE_PASS" "$KEY_PASS" "$OTHER_PASS" "${SAVED_BASE64:-}"; do
    if [[ -n "$secret" ]] && printf '%s' "$output" | grep -F -q -- "$secret"; then
      fail "$label output contained a signing secret"
    fi
  done
}

reset_signing() {
  cleanup_keystore
  KEYSTORE_CREATED=0
  KEYSTORE_PATH=""
  KEY_PASSWORD_CHECK_DIR=""
  EXPECTED_FINGERPRINT=""
  unset ANDROID_KEYSTORE_BASE64 \
    ANDROID_KEYSTORE_PASSWORD \
    ANDROID_KEY_ALIAS \
    ANDROID_KEY_PASSWORD \
    AUDIONOTE_UPLOAD_STORE_FILE \
    AUDIONOTE_UPLOAD_STORE_PASSWORD \
    AUDIONOTE_UPLOAD_KEY_ALIAS \
    AUDIONOTE_UPLOAD_KEY_PASSWORD \
    AUDIONOTE_RELEASE_SIGNING || true
  rm -f "$AUDIONOTE_SIGNING_STAMP_PATH" "$AUDIONOTE_DEBUG_MARKER_PATH"
}

capture() {
  local status=0 log="$WORK/capture.log"
  CAPTURED=""
  set +e
  "$@" >"$log" 2>&1
  status=$?
  set -e
  CAPTURED="$(<"$log")"
  assert_no_secrets "$CAPTURED" "$*"
  return "$status"
}

encode_base64_file() {
  if base64 --help 2>&1 | grep -q -- '-w'; then
    base64 -w 0 "$1"
  else
    base64 < "$1" | tr -d '\n'
  fi
}

make_keystore() {
  local path="$1" alias_name="$2" dname="$3" log="$WORK/keytool-gen.log"
  if ! keytool -genkeypair \
    -keystore "$path" \
    -storetype PKCS12 \
    -alias "$alias_name" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 30 \
    -storepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD \
    -keypass:env AUDIONOTE_UPLOAD_KEY_PASSWORD \
    -dname "$dname" >"$log" 2>&1; then
    assert_no_secrets "$(<"$log")" "keytool genkeypair"
    cat "$log" >&2
    fail "could not create a test keystore"
  fi
  assert_no_secrets "$(<"$log")" "keytool genkeypair"
}

write_binary_manifest() {
  local dest="$1"
  python3 - "$dest" <<'PY'
import struct, sys
dest = sys.argv[1]

def u16(n):
    return struct.pack("<H", n)
def u32(n):
    return struct.pack("<I", n)

strings = [
    "http://schemas.android.com/apk/res/android",
    "package",
    "app.audionote.test",
    "manifest",
    "android",
    "uses-sdk",
    "minSdkVersion",
]
(ANDROID_NS, ATTR_PACKAGE, VAL_PACKAGE, TAG_MANIFEST,
 PREFIX_ANDROID, TAG_USES_SDK, ATTR_MIN_SDK) = range(7)

def encode_utf16_string(value):
    encoded = value.encode("utf-16le")
    return u16(len(encoded) // 2) + encoded + u16(0)

offsets = []
cursor = 0
parts = []
for value in strings:
    offsets.append(cursor)
    blob = encode_utf16_string(value)
    parts.append(blob)
    cursor += len(blob)
str_data = b"".join(parts)
offsets_blob = b"".join(u32(offset) for offset in offsets)
header_size = 28
strings_start = header_size + len(offsets_blob)
pool_unaligned = strings_start + len(str_data)
pad = (4 - (pool_unaligned % 4)) % 4
pool_size = pool_unaligned + pad
pool = (
    u16(0x0001) + u16(header_size) + u32(pool_size)
    + u32(len(strings)) + u32(0) + u32(0)
    + u32(strings_start) + u32(0)
    + offsets_blob + str_data + (b"\x00" * pad)
)

ids = [0] * len(strings)
ids[ATTR_MIN_SDK] = 0x0101020C
res_body = b"".join(u32(item) for item in ids)
resmap = u16(0x0180) + u16(8) + u32(8 + len(res_body)) + res_body

def node(node_type, extension):
    header = 16
    total = header + len(extension)
    return u16(node_type) + u16(header) + u32(total) + u32(1) + u32(0xFFFFFFFF) + extension

def attr(ns, name, raw_value, data_type, data):
    return u32(ns) + u32(name) + u32(raw_value) + u16(8) + bytes([0, data_type]) + u32(data)

def start_element(ns, name, attributes):
    attr_ext = (
        u32(ns) + u32(name) + u16(20) + u16(20) + u16(len(attributes))
        + u16(0) + u16(0) + u16(0)
    )
    return node(0x0102, attr_ext + b"".join(attributes))

def end_element(ns, name):
    return node(0x0103, u32(ns) + u32(name))

ns_ext = u32(PREFIX_ANDROID) + u32(ANDROID_NS)
body = pool + resmap + b"".join([
    node(0x0100, ns_ext),
    start_element(0xFFFFFFFF, TAG_MANIFEST, [attr(0xFFFFFFFF, ATTR_PACKAGE, VAL_PACKAGE, 0x03, VAL_PACKAGE)]),
    start_element(0xFFFFFFFF, TAG_USES_SDK, [attr(ANDROID_NS, ATTR_MIN_SDK, 0xFFFFFFFF, 0x10, 21)]),
    end_element(0xFFFFFFFF, TAG_USES_SDK),
    end_element(0xFFFFFFFF, TAG_MANIFEST),
    node(0x0101, ns_ext),
])
xml = u16(0x0003) + u16(8) + u32(8 + len(body)) + body
with open(dest, "wb") as handle:
    handle.write(xml)
PY
}

job_body() {
  local job="$1"
  awk -v job="$job" '
    $0 ~ "^  " job ":$" { capture = 1 }
    capture && $0 ~ "^  [A-Za-z0-9-]+:$" && $0 !~ "^  " job ":$" { exit }
    capture { print }
  ' "$ROOT/.github/workflows/mobile-bundles.yml"
}

reset_signing

sample_hex="00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
formatted="$(format_fingerprint "$sample_hex")"
assert_eq "$formatted" "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF" "format fingerprint"
normalized="$(normalize_fingerprint "$formatted")"
assert_eq "$normalized" "$sample_hex" "normalize fingerprint"
if normalize_fingerprint "abcd"; then
  fail "short fingerprint was accepted"
fi
pass "fingerprint normalization"

expected_cert="$(printf 'b%.0s' {1..64})"
public_key_digest="$(printf 'a%.0s' {1..64})"
apksigner_sample="$(printf '%s\n' \
  "V3.0 Signer: public key SHA-256 digest: ${public_key_digest}" \
  "V3.0 Signer: certificate SHA-256 digest: ${expected_cert}" \
  "Signature algorithm name: SHA256withRSA")"
parsed="$(primary_sha256 "$apksigner_sample")"
assert_eq "$parsed" "$expected_cert" "apksigner certificate digest"
pass "apksigner parser ignores the public key digest"

expected_first="$(printf 'c%.0s' {1..64})"
chain_cert="$(printf 'd%.0s' {1..64})"
keytool_sample="$(printf '%s\n' \
  "Signature algorithm name: SHA256withRSA" \
  "	 SHA256: $(format_fingerprint "$expected_first")" \
  "	 SHA256: $(format_fingerprint "$chain_cert")")"
parsed="$(primary_sha256 "$keytool_sample")"
assert_eq "$parsed" "$expected_first" "first keytool certificate"
pass "keytool parser uses the first certificate fingerprint"

if mode="$(AUDIONOTE_RELEASE_SIGNING=banana select_signing_mode 2>"$WORK/mode.err")"; then
  fail "invalid signing mode was accepted"
fi
pass "invalid signing mode fails"

if mode="$(select_signing_mode)"; then
  assert_eq "$mode" "debug" "auto mode without credentials"
else
  fail "auto mode without credentials failed"
fi
pass "auto mode without credentials is debug"

export ANDROID_KEYSTORE_PASSWORD="$STORE_PASS"
if mode="$(select_signing_mode 2>"$WORK/partial.err")"; then
  fail "partial signing credentials were accepted"
fi
if ! grep -F -q "incomplete" "$WORK/partial.err"; then
  fail "partial credentials did not report incomplete settings"
fi
assert_no_secrets "$(cat "$WORK/partial.err")" "partial credentials"
pass "partial credentials fail closed"

export AUDIONOTE_RELEASE_SIGNING=required
if mode="$(select_signing_mode 2>"$WORK/required.err")"; then
  fail "required mode without a keystore was accepted"
fi
if ! grep -F -q "Refusing the debug keystore" "$WORK/required.err"; then
  fail "required mode did not refuse the debug keystore"
fi
pass "required mode refuses the debug keystore"
reset_signing

export AUDIONOTE_UPLOAD_STORE_PASSWORD="$STORE_PASS"
export AUDIONOTE_UPLOAD_KEY_PASSWORD="$KEY_PASS"
upload_ks="$WORK/upload.keystore"
other_ks="$WORK/other.keystore"
debug_ks="$WORK/debug.keystore"
make_keystore "$upload_ks" upload "CN=AudioNote Upload Test, O=AudioNote, C=US"
make_keystore "$other_ks" upload "CN=AudioNote Other Test, O=AudioNote, C=US"
make_keystore "$debug_ks" androiddebugkey "CN=Android Debug, O=Android, C=US"
upload_listing="$(keytool -list -v -keystore "$upload_ks" -alias upload -storepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD)"
upload_fp="$(primary_sha256 "$upload_listing")"
other_listing="$(keytool -list -v -keystore "$other_ks" -alias upload -storepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD)"
other_fp="$(primary_sha256 "$other_listing")"
if [[ "$upload_fp" == "$other_fp" ]]; then
  fail "two test keystores unexpectedly share a certificate"
fi
unset AUDIONOTE_UPLOAD_STORE_PASSWORD AUDIONOTE_UPLOAD_KEY_PASSWORD

export AUDIONOTE_RELEASE_SIGNING=required
SAVED_BASE64="$(encode_base64_file "$upload_ks")"
export ANDROID_KEYSTORE_BASE64="$SAVED_BASE64"
export ANDROID_KEYSTORE_PASSWORD="$STORE_PASS"
export ANDROID_KEY_ALIAS="upload"
export ANDROID_KEY_PASSWORD="$KEY_PASS"
if ! capture begin_signing; then
  printf '%s\n' "$CAPTURED" >&2
  fail "complete upload credentials were rejected"
fi
if [[ -n "${ANDROID_KEYSTORE_BASE64:-}" ]]; then
  fail "keystore base64 remained in the environment"
fi
if [[ "$KEYSTORE_CREATED" != 1 || ! -f "$KEYSTORE_PATH" ]]; then
  fail "decoded keystore was not created"
fi
assert_eq "$EXPECTED_FINGERPRINT" "$upload_fp" "upload fingerprint"
if [[ "$(uname -s)" == "Linux" ]]; then
  assert_eq "$(stat -c %a "$KEYSTORE_PATH")" "600" "keystore mode"
  assert_eq "$(stat -c %a "$AUDIONOTE_KEYSTORE_DIR")" "700" "keystore directory mode"
fi
decoded_path="$KEYSTORE_PATH"
pass "production credentials decode and match the upload certificate"

EXPECTED_FINGERPRINT="$sample_hex"
if capture write_production_stamp; then
  stamp_value="$(tr -d '[:space:]' < "$AUDIONOTE_SIGNING_STAMP_PATH")"
  assert_eq "$stamp_value" "$sample_hex" "production stamp"
else
  fail "production stamp was not written"
fi
pass "production stamp records the certificate"

staging="$WORK/jar"
mkdir -p "$staging"
echo payload > "$staging/payload.txt"
aab="$WORK/app.aab"
jar cf "$aab" -C "$staging" payload.txt
export AUDIONOTE_UPLOAD_STORE_PASSWORD="$STORE_PASS"
export AUDIONOTE_UPLOAD_KEY_PASSWORD="$KEY_PASS"
jarsigner \
  -keystore "$upload_ks" \
  -storetype PKCS12 \
  -storepass:env AUDIONOTE_UPLOAD_STORE_PASSWORD \
  -keypass:env AUDIONOTE_UPLOAD_KEY_PASSWORD \
  "$aab" upload >/dev/null
unset AUDIONOTE_UPLOAD_STORE_PASSWORD AUDIONOTE_UPLOAD_KEY_PASSWORD
EXPECTED_FINGERPRINT="$upload_fp"
if ! capture verify_aab_certificate "$aab"; then
  printf '%s\n' "$CAPTURED" >&2
  fail "AAB signed with the upload key did not verify"
fi
pass "AAB certificate matches the upload keystore"

EXPECTED_FINGERPRINT="$other_fp"
if capture verify_aab_certificate "$aab"; then
  fail "AAB signed with a different key was accepted"
fi
if ! printf '%s\n' "$CAPTURED" | grep -F -q "does not match"; then
  fail "AAB mismatch did not report a certificate comparison"
fi
pass "AAB certificate mismatch fails"

EXPECTED_FINGERPRINT="$upload_fp"
signer=""
if [[ -n "${APKSIGNER:-}" && -x "${APKSIGNER}" ]]; then
  signer="$APKSIGNER"
elif command -v apksigner >/dev/null 2>&1; then
  signer="$(command -v apksigner)"
fi
if [[ -n "$signer" && -x "$(command -v python3)" && -x "$(command -v zip)" ]]; then
  manifest_dir="$WORK/apk"
  mkdir -p "$manifest_dir"
  write_binary_manifest "$manifest_dir/AndroidManifest.xml"
  unsigned="$WORK/unsigned.apk"
  signed="$WORK/signed.apk"
  (
    cd "$manifest_dir"
    zip -q -X "$unsigned" AndroidManifest.xml
  )
  export AUDIONOTE_UPLOAD_STORE_PASSWORD="$STORE_PASS"
  export AUDIONOTE_UPLOAD_KEY_PASSWORD="$KEY_PASS"
  "$signer" sign \
    --ks "$upload_ks" \
    --ks-type PKCS12 \
    --ks-key-alias upload \
    --ks-pass env:AUDIONOTE_UPLOAD_STORE_PASSWORD \
    --key-pass env:AUDIONOTE_UPLOAD_KEY_PASSWORD \
    --out "$signed" \
    "$unsigned"
  unset AUDIONOTE_UPLOAD_STORE_PASSWORD AUDIONOTE_UPLOAD_KEY_PASSWORD
  export APKSIGNER="$signer"
  EXPECTED_FINGERPRINT="$upload_fp"
  if ! capture verify_apk_certificate "$signed"; then
    printf '%s\n' "$CAPTURED" >&2
    fail "APK signed with the upload key did not verify"
  fi
  pass "APK certificate matches the upload keystore"
  EXPECTED_FINGERPRINT="$other_fp"
  if capture verify_apk_certificate "$signed"; then
    fail "APK signed with a different key was accepted"
  fi
  pass "APK certificate mismatch fails"
  EXPECTED_FINGERPRINT="$upload_fp"
  if ! capture write_debug_marker "$signed"; then
    fail "debug marker was not written"
  fi
  if [[ -f "$AUDIONOTE_SIGNING_STAMP_PATH" ]]; then
    fail "debug marker left a production stamp"
  fi
  if ! grep -F -q "Do not submit" "$AUDIONOTE_DEBUG_MARKER_PATH"; then
    fail "debug marker is missing the store warning"
  fi
  pass "debug marker replaces the production stamp"
else
  echo "skipped live APK verification (apksigner, python3, or zip is unavailable)"
fi

cleanup_keystore
if [[ -f "$decoded_path" ]]; then
  fail "decoded keystore was not deleted"
fi
pass "decoded keystore is removed"

reset_signing
export AUDIONOTE_RELEASE_SIGNING=debug
export ANDROID_KEYSTORE_BASE64="not-a-real-keystore"
export ANDROID_KEYSTORE_PASSWORD="$STORE_PASS"
export ANDROID_KEY_ALIAS="upload"
export ANDROID_KEY_PASSWORD="$KEY_PASS"
if ! capture begin_signing; then
  fail "debug mode should ignore upload credentials"
fi
if [[ -n "${ANDROID_KEYSTORE_BASE64:-}" || -n "${AUDIONOTE_UPLOAD_STORE_PASSWORD:-}" ]]; then
  fail "debug mode left upload credentials in the environment"
fi
if [[ -n "$(find "$AUDIONOTE_KEYSTORE_DIR" -type f -print -quit)" ]]; then
  fail "debug mode wrote a keystore"
fi
pass "debug mode ignores upload credentials"

reset_signing
export AUDIONOTE_RELEASE_SIGNING=required
export AUDIONOTE_UPLOAD_STORE_PASSWORD="$STORE_PASS"
export AUDIONOTE_UPLOAD_KEY_PASSWORD="$OTHER_PASS"
export AUDIONOTE_UPLOAD_KEY_ALIAS="upload"
export AUDIONOTE_UPLOAD_STORE_FILE="$upload_ks"
if capture begin_signing; then
  fail "PKCS12 keystore with two passwords was accepted"
fi
if ! printf '%s\n' "$CAPTURED" | grep -F -q "must match"; then
  fail "PKCS12 password mismatch was not reported"
fi
pass "PKCS12 store and key passwords must match"

reset_signing
export AUDIONOTE_RELEASE_SIGNING=required
export AUDIONOTE_UPLOAD_STORE_PASSWORD="$STORE_PASS"
export AUDIONOTE_UPLOAD_KEY_PASSWORD="$KEY_PASS"
export AUDIONOTE_UPLOAD_KEY_ALIAS="androiddebugkey"
export AUDIONOTE_UPLOAD_STORE_FILE="$debug_ks"
if capture begin_signing; then
  fail "Android debug certificate was accepted for production"
fi
if ! printf '%s\n' "$CAPTURED" | grep -F -q "debug certificate"; then
  fail "debug certificate rejection was not reported"
fi
pass "Android debug certificate is rejected"

reset_signing
kept="$WORK/kept.keystore"
cp "$upload_ks" "$kept"
export AUDIONOTE_RELEASE_SIGNING=required
export AUDIONOTE_UPLOAD_STORE_FILE="$kept"
export AUDIONOTE_UPLOAD_STORE_PASSWORD="$STORE_PASS"
export AUDIONOTE_UPLOAD_KEY_ALIAS="upload"
export AUDIONOTE_UPLOAD_KEY_PASSWORD="$KEY_PASS"
if ! capture begin_signing; then
  printf '%s\n' "$CAPTURED" >&2
  fail "existing keystore file was rejected"
fi
if [[ "$KEYSTORE_CREATED" != 0 ]]; then
  fail "an existing keystore was marked for deletion"
fi
cleanup_keystore
if [[ ! -f "$kept" ]]; then
  fail "cleanup deleted a keystore it did not create"
fi
pass "existing keystore files are left in place"

if output="$(
  env \
    -u ANDROID_KEYSTORE_BASE64 \
    -u ANDROID_KEYSTORE_PASSWORD \
    -u ANDROID_KEY_ALIAS \
    -u ANDROID_KEY_PASSWORD \
    -u AUDIONOTE_UPLOAD_STORE_FILE \
    -u AUDIONOTE_UPLOAD_STORE_PASSWORD \
    -u AUDIONOTE_UPLOAD_KEY_ALIAS \
    -u AUDIONOTE_UPLOAD_KEY_PASSWORD \
    AUDIONOTE_RELEASE_SIGNING=required \
    bash "$ROOT/scripts/build-android.sh" 2>&1
)"; then
  fail "production build without secrets succeeded"
fi
assert_no_secrets "$output" "production build without secrets"
if printf '%s\n' "$output" | grep -F -q "expo prebuild"; then
  fail "production build reached Expo prebuild without a keystore"
fi
if ! printf '%s\n' "$output" | grep -F -q "Refusing the debug keystore"; then
  fail "production build did not refuse the debug keystore"
fi
pass "production script fails before prebuild"

plugin="$ROOT/plugins/withAndroidReleaseSigning.js"
if ! grep -F -q "Refusing to sign with the debug keystore." "$plugin"; then
  fail "Gradle plugin does not refuse a production build without a keystore"
fi
pass "Gradle plugin refuses the debug keystore"

workflow="$ROOT/.github/workflows/mobile-bundles.yml"
pr_job="$(job_body android-pr)"
ios_pr_job="$(job_body ios-pr)"
prod_job="$(job_body android)"
if printf '%s\n' "$pr_job" | grep -F -q 'secrets.'; then
  fail "Android pull-request job references GitHub secrets"
fi
if printf '%s\n' "$ios_pr_job" | grep -F -q 'secrets.'; then
  fail "iOS pull-request job references GitHub secrets"
fi
for secret_name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if ! printf '%s\n' "$prod_job" | grep -F -q "$secret_name"; then
    fail "production Android job is missing $secret_name"
  fi
done
if ! printf '%s\n' "$pr_job" | grep -F -q "audionote-android-pr-debug-apk"; then
  fail "pull-request artifact name is not distinct"
fi
if printf '%s\n' "$pr_job" | grep -F -q "name: audionote-android-apk"; then
  fail "pull-request job uses the production artifact name"
fi
if ! printf '%s\n' "$prod_job" | grep -F -q "audionote-production-signing.sha256"; then
  fail "production job does not require the certificate stamp"
fi
stamp_at="$(printf '%s\n' "$prod_job" | awk '/audionote-production-signing.sha256/ { print NR; exit }')"
upload_at="$(printf '%s\n' "$prod_job" | awk '/name: audionote-android-apk/ { print NR; exit }')"
if [[ -z "$stamp_at" || -z "$upload_at" || "$stamp_at" -ge "$upload_at" ]]; then
  fail "production upload is not gated on certificate verification"
fi
if printf '%s\n' "$prod_job" | grep -F -q 'outputs/**'; then
  fail "production upload path is broad enough to pick up extra files"
fi
pass "workflow keeps production secrets off pull requests"

echo "Android signing checks passed (${checks})"
