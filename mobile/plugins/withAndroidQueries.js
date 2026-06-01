const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

/** Restore package/intent queries for Maps, dialer, and navigation deep links. */
function withAndroidQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    let queries = manifest.manifest.queries?.[0];
    if (!queries) {
      queries = { intent: [], package: [] };
      manifest.manifest.queries = [queries];
    }
    if (!queries.intent) queries.intent = [];
    if (!queries.package) queries.package = [];

    const addIntent = (action, dataScheme, category) => {
      const exists = queries.intent.some(
        (item) =>
          item.action?.[0]?.$?.["android:name"] === action &&
          item.data?.[0]?.$?.["android:scheme"] === dataScheme
      );
      if (exists) return;
      const intent = {
        action: [{ $: { "android:name": action } }],
        data: [{ $: { "android:scheme": dataScheme } }],
      };
      if (category) {
        intent.category = [{ $: { "android:name": category } }];
      }
      queries.intent.push(intent);
    };

    const addPackage = (name) => {
      if (queries.package.some((p) => p.$?.["android:name"] === name)) return;
      queries.package.push({ $: { "android:name": name } });
    };

    addIntent("android.intent.action.VIEW", "geo");
    addIntent("android.intent.action.VIEW", "google.navigation");
    addIntent("android.intent.action.DIAL", "tel");
    addPackage("com.google.android.apps.maps");
    addPackage("com.android.chrome");

    return config;
  });
}

module.exports = withAndroidQueries;
