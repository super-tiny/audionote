const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = 'AUDIONOTE_UPLOAD_STORE_FILE';

const SIGNING_SNIPPET = `
// AudioNote release signing.
// Upload keystore (Play Console): set AUDIONOTE_UPLOAD_STORE_FILE and the
// matching password, alias, and key password as env vars or Gradle properties.
// Otherwise release artifacts are signed with the debug keystore so CI can
// produce an installable APK without committed secrets.

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
    if (audionoteStoreFile) {
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
