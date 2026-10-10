import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, ActivityIndicator, Platform, Pressable, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { initDatabase, getDatabaseMode } from './src/database/operations';
import { isOpfsBusyError } from './src/database/openDatabase';
import { listenForTakeover, takeOverFromOtherTab } from './src/database/tabGuard';
import AppNavigator from './src/navigation/AppNavigator';
import { getTheme } from './src/theme';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { BrandMark, CheckerStrip } from './src/components/Brand';
import { AlertHost, installAlertPolyfill } from './src/platform/alert';
import { ConsentHost } from './src/consent/ConsentHost';
import OnboardingGate from './src/onboarding/OnboardingGate';
import { MonetizationProvider } from './src/monetization/MonetizationContext';
import WebShell from './src/components/WebShell';
import ScreenErrorBoundary from './src/components/ScreenErrorBoundary';

import { ShareIntentProvider } from './src/platform/shareIntent';

installAlertPolyfill();

const navigationRef = createNavigationContainerRef();
const navigateToTab = (route) => {
  if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: route });
};

// Browser URLs for the screens people land on or refresh. Native keeps its
// existing (unconfigured) deep-link behaviour.
const linking =
  Platform.OS === 'web'
    ? {
       prefixes: [],
       config: {
         screens: {
           Main: {
             path: '',
             screens: {
               Ampi: '',
               Recipes: 'recipes',
               Planner: 'planner',
               Pantry: 'pantry',
               Grocery: 'grocery',
               'AI Chef': 'chef',
             },
           },
           RecipeDetail: { path: 'recipe/:recipeId', parse: { recipeId: Number } },
           AddRecipe: 'add-recipe',
           ImportRecipe: 'import',
           AddPantryItem: 'pantry/add',
           // The pantry item travels as an object param, which cannot live in a URL.
           EditPantryItem: { path: 'pantry/edit', stringify: { item: () => undefined } },
           AddGroceryItem: 'grocery/add',
           EstimateCost: 'grocery/estimate',
           Party: 'party',
           Account: 'account',
           Paywall: 'plus',
         },
       },
     }
    : undefined;

const documentTitle = {
  formatter: (options, route) => {
    const title = options?.title ?? route?.name;
    return title ? `${title} · AmpliFood` : 'AmpliFood';
  },
};

// OPFS hands the SQLite file to one tab at a time.
const isLockedInAnotherTab = (error) =>
  Platform.OS === 'web' && (error?.name === 'TabLockedError' || isOpfsBusyError(error));

const reload = () => window.location.reload();

function StartupError({ error, theme, onUseHere }) {
  const locked = isLockedInAnotherTab(error);
  const [showDetails, setShowDetails] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const details = [error?.name, error?.message].filter(Boolean).join(': ') + (error?.stack ? `\n\n${error.stack}` : '');

  const moveHere = async () => {
    setTakingOver(true);
    try {
      await onUseHere();
    } catch {
      reload();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <BrandMark variant="ink" size={88} />
      <Text style={[styles.errorTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.fonts.display }]}>
        {locked ? 'AmpliFood is open in another tab' : 'AmpliFood could not start'}
      </Text>
      <Text style={[styles.errorText, { color: theme.colors.text.secondary }]}>
        {locked
          ? 'Your kitchen is saved in this browser, and only one tab can use it at a time. Use that tab or close it, or move AmpliFood here.'
          : error?.message || String(error)}
      </Text>
      {Platform.OS === 'web' && (
        <Pressable
          onPress={locked ? moveHere : reload}
          disabled={takingOver}
          style={[styles.retryButton, { backgroundColor: theme.primary[500], opacity: takingOver ? 0.7 : 1 }]}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>{locked ? (takingOver ? 'Moving here…' : 'Use here') : 'Try again'}</Text>
        </Pressable>
      )}
      {!locked && (
        <>
          <Pressable
            onPress={() => setShowDetails((v) => !v)}
            style={styles.detailsToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
          >
            <Text style={[styles.detailsToggleText, { color: theme.colors.text.secondary }]}>
              {showDetails ? 'Hide details' : 'Details'}
            </Text>
          </Pressable>
          {showDetails && (
            <ScrollView style={[styles.detailsBox, { borderColor: theme.colors.border }]}>
              <Text selectable style={[styles.detailsText, { color: theme.colors.text.secondary }]}>
                {details}
              </Text>
            </ScrollView>
          )}
        </>
      )}
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
    </View>
  );
}

function TemporaryDatabaseBanner({ theme }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: theme.colors.surface, borderColor: theme.primary[500] }]}
    >
      <Text style={[styles.bannerText, { color: theme.colors.text.primary }]}>
        Couldn&apos;t open your saved kitchen, so this session is temporary and changes won&apos;t be saved.
      </Text>
      <View style={styles.bannerActions}>
        <Pressable onPress={reload} accessibilityRole="button" style={styles.bannerButton}>
          <Text style={[styles.bannerButtonText, { color: theme.primary[500] }]}>Retry</Text>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} accessibilityRole="button" style={styles.bannerButton}>
          <Text style={[styles.bannerButtonText, { color: theme.colors.text.secondary }]}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [dbMode, setDbMode] = useState('persistent');
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const [fontsLoaded, fontError] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold });

  const prepare = useCallback(async () => {
    try {
      await initDatabase();
      console.log('✅ AmpliFood app initialized successfully');
      setDbMode(getDatabaseMode());
      setError(null);
      setIsReady(true);
    } catch (e) {
      console.error('❌ Error initializing app:', e);
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  useEffect(() => {
    prepare();
  }, [prepare]);

  // Another tab pressed "Use here": reload, which ends this tab's SQLite worker
  // and frees the database for it.
  useEffect(() => {
    if (Platform.OS !== 'web' || !isReady) return undefined;
    return listenForTakeover(reload);
  }, [isReady]);

  const moveHere = useCallback(async () => {
    await takeOverFromOtherTab();
    await prepare();
  }, [prepare]);

  if (error) {
    return <StartupError error={error} theme={theme} onUseHere={moveHere} />;
  }

  if (!isReady || !(fontsLoaded || fontError)) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <BrandMark size={150} />
        <CheckerStrip squares={10} size={7} style={styles.loadingChecker} />
        <ActivityIndicator size="small" color={theme.primary[500]} />
        <Text style={[styles.loadingText, { color: theme.colors.text.secondary }]}>
          Tuning up AmpliFood…
        </Text>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ShareIntentProvider>
        <OnboardingGate navigate={navigateToTab}>
          <WebShell>
            <NavigationContainer ref={navigationRef} linking={linking} documentTitle={documentTitle}>
              <ScreenErrorBoundary
                isDark={theme.isDark}
                onGoBack={() => {
                  if (navigationRef.isReady()) {
                    if (navigationRef.canGoBack()) navigationRef.goBack();
                    else navigationRef.navigate('Main', { screen: 'Recipes' });
                  }
                }}
              >
                <AppNavigator />
              </ScreenErrorBoundary>
              <StatusBar style={theme.isDark ? 'light' : 'dark'} />
            </NavigationContainer>
          </WebShell>
        </OnboardingGate>
        {dbMode === 'memory' && <TemporaryDatabaseBanner theme={theme} />}
        <ConsentHost />
        <AlertHost />
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MonetizationProvider>
          <AppContent />
        </MonetizationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingChecker: {
    marginTop: 20,
    marginBottom: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  errorTitle: {
    marginTop: 20,
    fontSize: 22,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 420,
  },
  retryButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  detailsToggle: {
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  detailsToggleText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  detailsBox: {
    maxHeight: 220,
    width: '100%',
    maxWidth: 420,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  detailsText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 96,
    maxWidth: 456,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
  },
  bannerButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  bannerButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
