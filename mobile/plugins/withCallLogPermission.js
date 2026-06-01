const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

/** Declare READ_CALL_LOG for admin call-history order picker (device-local only). */
function withCallLogPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    AndroidConfig.Manifest.ensureToolsAvailable(manifest);
    AndroidConfig.Permissions.ensurePermission(manifest, "android.permission.READ_CALL_LOG");
    return config;
  });
}

module.exports = withCallLogPermission;
