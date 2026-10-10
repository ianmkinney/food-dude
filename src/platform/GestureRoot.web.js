// The package entry pulls every handler and hammerjs into the startup bundle.
// On web the root view is only a context provider around a View, so import it
// directly; screens that need gestures load the rest lazily.
export { default } from 'react-native-gesture-handler/src/components/GestureHandlerRootView';
