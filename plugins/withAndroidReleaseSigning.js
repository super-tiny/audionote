const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = 'AUDIONOTE_UPLOAD_STORE_FILE';

const DEBUG_SIGNING_END = `            keyPassword 'android'
        }
    }
    buildTypes {`;

const UPLOAD_SIGNING_CONFIG = `            keyPassword 'android'
        }
        audionoteRelease {
            def audionoteStoreFile = project.findProperty('${MARKER}') ?: System.getenv('${MARKER}')
            if (audionoteStoreFile) {
                storeFile file(audionoteStoreFile)
                storePassword project.findProperty('AUDIONOTE_UPLOAD_STORE_PASSWORD') ?: System.getenv('AUDIONOTE_UPLOAD_STORE_PASSWORD')
                keyAlias project.findProperty('AUDIONOTE_UPLOAD_KEY_ALIAS') ?: System.getenv('AUDIONOTE_UPLOAD_KEY_ALIAS')
                keyPassword project.findProperty('AUDIONOTE_UPLOAD_KEY_PASSWORD') ?: System.getenv('AUDIONOTE_UPLOAD_KEY_PASSWORD')
            }
        }
    }
    buildTypes {`;

const RELEASE_DEBUG_SIGNING = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const RELEASE_UPLOAD_SIGNING = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            // Select the upload keystore while this build type is still being configured.
            // Android Gradle Plugin copies that choice into the release variant. Assigning
            // it later, from afterEvaluate, leaves the debug certificate on the APK.
            def audionoteStoreFile = project.findProperty('${MARKER}') ?: System.getenv('${MARKER}')
            def audionoteStorePassword = project.findProperty('AUDIONOTE_UPLOAD_STORE_PASSWORD') ?: System.getenv('AUDIONOTE_UPLOAD_STORE_PASSWORD')
            def audionoteKeyAlias = project.findProperty('AUDIONOTE_UPLOAD_KEY_ALIAS') ?: System.getenv('AUDIONOTE_UPLOAD_KEY_ALIAS')
            def audionoteKeyPassword = project.findProperty('AUDIONOTE_UPLOAD_KEY_PASSWORD') ?: System.getenv('AUDIONOTE_UPLOAD_KEY_PASSWORD')
            def audionoteRequireUploadSigning = System.getenv('AUDIONOTE_RELEASE_SIGNING') == 'required'
            if (audionoteRequireUploadSigning && !audionoteStoreFile) {
                throw new GradleException('Production Android signing requires AUDIONOTE_UPLOAD_STORE_FILE. Refusing to sign with the debug keystore.')
            }
            if (audionoteStoreFile) {
                if (!audionoteStorePassword || !audionoteKeyAlias || !audionoteKeyPassword) {
                    throw new GradleException('Upload keystore is set but the store password, key alias, or key password is missing.')
                }
                signingConfig signingConfigs.audionoteRelease
            } else {
                signingConfig signingConfigs.debug
            }`;

const SIGNING_LOCK = `
// AudioNote release signing.
// Re-apply the upload keystore in finalizeDsl, which runs before AGP locks
// the variant. Then fail configuration if the release variant still points
// at a different store file.
androidComponents.finalizeDsl { extension ->
    def audionoteStoreFile = project.findProperty('${MARKER}') ?: System.getenv('${MARKER}')
    def audionoteStorePassword = project.findProperty('AUDIONOTE_UPLOAD_STORE_PASSWORD') ?: System.getenv('AUDIONOTE_UPLOAD_STORE_PASSWORD')
    def audionoteKeyAlias = project.findProperty('AUDIONOTE_UPLOAD_KEY_ALIAS') ?: System.getenv('AUDIONOTE_UPLOAD_KEY_ALIAS')
    def audionoteKeyPassword = project.findProperty('AUDIONOTE_UPLOAD_KEY_PASSWORD') ?: System.getenv('AUDIONOTE_UPLOAD_KEY_PASSWORD')
    def audionoteRequireUploadSigning = System.getenv('AUDIONOTE_RELEASE_SIGNING') == 'required'
    if (audionoteRequireUploadSigning && !audionoteStoreFile) {
        throw new GradleException('Production Android signing requires AUDIONOTE_UPLOAD_STORE_FILE. Refusing to sign with the debug keystore.')
    }
    if (audionoteStoreFile) {
        if (!audionoteStorePassword || !audionoteKeyAlias || !audionoteKeyPassword) {
            throw new GradleException('Upload keystore is set but the store password, key alias, or key password is missing.')
        }
        def releaseSigning = extension.signingConfigs.getByName('audionoteRelease')
        releaseSigning.storeFile = file(audionoteStoreFile)
        releaseSigning.storePassword = audionoteStorePassword
        releaseSigning.keyAlias = audionoteKeyAlias
        releaseSigning.keyPassword = audionoteKeyPassword
        extension.buildTypes.getByName('release').signingConfig = releaseSigning
    }
}

afterEvaluate {
    def audionoteStoreFile = project.findProperty('${MARKER}') ?: System.getenv('${MARKER}')
    if (!audionoteStoreFile) {
        return
    }
    def audionoteExpectedStore = file(audionoteStoreFile)
    android.applicationVariants.all { variant ->
        if (variant.name != 'release') {
            return
        }
        def configuredStore = variant.signingConfig?.storeFile
        if (configuredStore == null || configuredStore.absolutePath != audionoteExpectedStore.absolutePath) {
            throw new GradleException('Release variant is not using the upload keystore. Refusing to sign with the debug certificate.')
        }
    }
}
`;

function applyAndroidReleaseSigning(contents) {
  const normalized = contents.replace(/\r\n/g, '\n');
  if (normalized.includes(MARKER)) {
    return normalized;
  }
  if (!normalized.includes(DEBUG_SIGNING_END)) {
    throw new Error(
      'AudioNote signing plugin could not find the debug signingConfig in android/app/build.gradle.',
    );
  }
  if (!normalized.includes(RELEASE_DEBUG_SIGNING)) {
    throw new Error(
      'AudioNote signing plugin could not find the release signingConfig in android/app/build.gradle.',
    );
  }

  return normalized
    .replace(DEBUG_SIGNING_END, UPLOAD_SIGNING_CONFIG)
    .replace(RELEASE_DEBUG_SIGNING, RELEASE_UPLOAD_SIGNING)
    .concat(SIGNING_LOCK);
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('AudioNote signing plugin expects android/app/build.gradle to be Groovy.');
    }

    gradleConfig.modResults.contents = applyAndroidReleaseSigning(gradleConfig.modResults.contents);
    return gradleConfig;
  });
}

module.exports = withAndroidReleaseSigning;
module.exports.applyAndroidReleaseSigning = applyAndroidReleaseSigning;
