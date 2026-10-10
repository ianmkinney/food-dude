const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on web imports wa-sqlite.wasm. Metro must treat it as an asset.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== 'wasm');
config.resolver.unstable_enablePackageExports = true;

// App code (not node_modules) gets `react-native` through src/platform/rn-shim,
// which swaps in Text/TextInput that follow the in-app text size and UI font.
const RN_SHIM_DIR = path.join(__dirname, 'src', 'platform', 'rn-shim') + path.sep;
const APP_DIRS = [path.join(__dirname, 'src') + path.sep, path.join(__dirname, 'App.js')];
// On web, babel-preset-expo has already rewritten named imports into deep
// react-native-web/dist/exports/* paths, so those two are redirected directly.
const WEB_DEEP_EXPORTS = {
  'react-native-web/dist/exports/Text': 'Text.js',
  'react-native-web/dist/exports/TextInput': 'TextInput.js',
};
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath || '';
  const fromApp = APP_DIRS.some((dir) => origin.startsWith(dir)) && !origin.startsWith(RN_SHIM_DIR);
  if (fromApp && WEB_DEEP_EXPORTS[moduleName]) {
    return { type: 'sourceFile', filePath: path.join(RN_SHIM_DIR, WEB_DEEP_EXPORTS[moduleName]) };
  }
  if (fromApp && (moduleName === 'react-native' || moduleName === 'react-native-web')) {
    return { type: 'sourceFile', filePath: path.join(RN_SHIM_DIR, 'index.js') };
  }
  return (upstreamResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

// No COOP/COEP headers here, on purpose: the app only uses expo-sqlite's async
// API, which works without SharedArrayBuffer, and the production host does not
// send them either (Safari has no COEP `credentialless`). Calling any *Sync
// SQLite method would need cross-origin isolation on both. See WEB_DEPLOY.md.

module.exports = config;
