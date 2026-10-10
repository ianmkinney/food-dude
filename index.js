import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// A sign-in popup or redirect that lands on the app origin must not boot a
// second AmpliFood: it would take the on-device database (OPFS) away from the
// tab that opened it. Finish the hand-off and stop.
function isAuthCallbackWindow() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const { pathname, search, hash } = window.location;
  if (pathname.startsWith('/auth/')) return true;
  const params = `${search}&${hash.replace(/^#/, '')}`;
  const hasAuthResult = /(^|[?&])(id_token|access_token|code|error)=/.test(params) && /(^|[?&])state=/.test(params);
  return hasAuthResult && !!window.opener;
}

if (isAuthCallbackWindow()) {
  const { maybeCompleteAuthSession } = require('expo-web-browser');
  const AuthCallback = require('./src/platform/AuthCallbackScreen').default;
  maybeCompleteAuthSession();
  registerRootComponent(AuthCallback);
} else {
  // registerRootComponent calls AppRegistry.registerComponent('main', () => App);
  // It also ensures that whether you load the app in Expo Go or in a native build,
  // the environment is set up appropriately
  registerRootComponent(require('./App').default);
}
