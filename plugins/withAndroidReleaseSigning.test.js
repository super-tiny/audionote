const assert = require('node:assert/strict');
const test = require('node:test');
const { applyAndroidReleaseSigning } = require('./withAndroidReleaseSigning');

const TEMPLATE = `apply plugin: "com.android.application"

android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

test('release signing is chosen inside the release build type', () => {
  const gradle = applyAndroidReleaseSigning(TEMPLATE);
  const buildTypesAt = gradle.indexOf('    buildTypes {');
  const uploadConfigAt = gradle.indexOf('        audionoteRelease {');
  const releaseChoiceAt = gradle.indexOf('signingConfig signingConfigs.audionoteRelease');
  const finalizeAt = gradle.indexOf('androidComponents.finalizeDsl');

  assert.ok(uploadConfigAt !== -1 && uploadConfigAt < buildTypesAt);
  assert.ok(releaseChoiceAt !== -1 && releaseChoiceAt < finalizeAt);
  assert.match(gradle, /signingConfig signingConfigs\.debug/);
  assert.doesNotMatch(gradle, /android\.buildTypes\.release\.signingConfig =/);
  assert.match(
    gradle,
    /extension\.buildTypes\.getByName\('release'\)\.signingConfig = releaseSigning/,
  );
  assert.match(gradle, /Release variant is not using the upload keystore/);
});

test('debug builds keep the debug signing config when no keystore is configured', () => {
  const gradle = applyAndroidReleaseSigning(TEMPLATE);
  assert.match(gradle, /signingConfig signingConfigs\.debug/);
  assert.match(gradle, /else \{\s*signingConfig signingConfigs\.debug/s);
});

test('applying the signing edit twice does not duplicate it', () => {
  const once = applyAndroidReleaseSigning(TEMPLATE);
  const twice = applyAndroidReleaseSigning(once);
  assert.equal(twice, once);
});

test('a template without the release signing anchor fails closed', () => {
  assert.throws(
    () =>
      applyAndroidReleaseSigning(
        TEMPLATE.replace(
          '            // Caution! In production, you need to generate your own keystore file.\n',
          '',
        ),
      ),
    /could not find the release signingConfig/,
  );
});
