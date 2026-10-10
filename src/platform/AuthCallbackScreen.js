import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Shown in a sign-in popup that returned to the app origin instead of the full app. */
export default function AuthCallbackScreen() {
  const [closing, setClosing] = useState(true);

  useEffect(() => {
    try {
      window.close();
    } catch {}
    const timer = setTimeout(() => setClosing(false), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {closing ? 'Finishing sign-in…' : 'Signed in. You can close this window and return to AmpliFood.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFF8F2' },
  text: { fontSize: 16, color: '#2A1E17', textAlign: 'center' },
});
