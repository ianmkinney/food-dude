import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDatabase } from './src/database/operations';
import AppNavigator from './src/navigation/AppNavigator';
import { getTheme } from './src/theme';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

import { ShareIntentProvider } from 'expo-share-intent';

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const { isDark } = useTheme();
  const theme = getTheme(isDark);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize database
        await initDatabase();
        console.log('✅ Food Dude app initialized successfully');
        setIsReady(true);
      } catch (e) {
        console.error('❌ Error initializing app:', e);
        setError(e.message);
      }
    }

    prepare();
  }, []);

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          Error: {error}
        </Text>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.primary[500]} />
        <Text style={[styles.loadingText, { color: theme.colors.text.secondary }]}>
          Loading Food Dude...
        </Text>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ShareIntentProvider>
        <NavigationContainer>
          <AppNavigator />
          <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        </NavigationContainer>
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

