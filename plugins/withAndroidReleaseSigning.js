const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = 'AUDIONOTE_UPLOAD_STORE_FILE';

const SIGNING_SNIPPET = `
// AudioNote release signing.
// Production builds set AUDIONOTE_RELEASE_SIGNING=required and must provide
// the upload keystore path, store password, key alias, and key password.
// Those builds fail instead of using the debug certificate.
// Local and pull-request builds leave the keystore unset and keep the debug
// signing config. Do not submit that APK to a store.

android {
    signingConfigs {
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
}

afterEvaluate {
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
        android.buildTypes.release.signingConfig = android.signingConfigs.audionoteRelease
    }
}
`;

/** @type {import('@expo/config-plugins').ConfigPlugin} */
function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('AudioNote signing plugin expects android/app/build.gradle to be Groovy.');
    }

    if (!gradleConfig.modResults.contents.includes(MARKER)) {
      gradleConfig.modResults.contents += `\n${SIGNING_SNIPPET}`;
    }

    return gradleConfig;
  });
}

module.exports = withAndroidReleaseSigning;
