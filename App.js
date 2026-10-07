import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, ActivityIndicator, Platform, Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { initDatabase } from './src/database/operations';
import AppNavigator from './src/navigation/AppNavigator';
import { getTheme } from './src/theme';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { BrandMark, CheckerStrip } from './src/components/Brand';
import { AlertHost, installAlertPolyfill } from './src/platform/alert';

import { ShareIntentProvider } from './src/platform/shareIntent';

installAlertPolyfill();

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
               Recipes: '',
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
const isLockedInAnotherTab = (message) =>
  Platform.OS === 'web' && /NoModificationAllowedError|Access Handles cannot be created/i.test(message || '');

function StartupError({ message, theme }) {
  const locked = isLockedInAnotherTab(message);
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <BrandMark variant="ink" size={88} />
      <Text style={[styles.errorTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.fonts.display }]}>
        {locked ? 'AmpliFood is open in another tab' : 'AmpliFood could not start'}
      </Text>
      <Text style={[styles.errorText, { color: theme.colors.text.secondary }]}>
        {locked
          ? 'Your kitchen is saved in this browser, and only one tab can use it at a time. Close the other AmpliFood tab, then try again.'
          : message}
      </Text>
      {Platform.OS === 'web' && (
        <Pressable
          onPress={() => window.location.reload()}
          style={[styles.retryButton, { backgroundColor: theme.primary[500] }]}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      )}
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
    </View>
  );
}

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const { isDark } = useTheme();
  const theme = getTheme(isDark);
  const [fontsLoaded, fontError] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold });

  useEffect(() => {
    async function prepare() {
      try {
        await initDatabase();
        console.log('✅ AmpliFood app initialized successfully');
        setIsReady(true);
      } catch (e) {
        console.error('❌ Error initializing app:', e);
        setError(e.message);
      }
    }

    prepare();
  }, []);

  if (error) {
    return <StartupError message={error} theme={theme} />;
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
        <NavigationContainer linking={linking} documentTitle={documentTitle}>
          <AppNavigator />
          <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        </NavigationContainer>
        <AlertHost />
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
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
});
