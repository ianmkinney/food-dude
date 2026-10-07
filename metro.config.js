const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on web imports wa-sqlite.wasm. Metro must treat it as an asset.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== 'wasm');
config.resolver.unstable_enablePackageExports = true;

// No COOP/COEP headers here, on purpose: the app only uses expo-sqlite's async
// API, which works without SharedArrayBuffer, and the production host does not
// send them either (Safari has no COEP `credentialless`). Calling any *Sync
// SQLite method would need cross-origin isolation on both. See WEB_DEPLOY.md.

module.exports = config;
