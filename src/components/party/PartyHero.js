import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import CoverImage from '../CoverImage';

export default function PartyHero({ name, imageUri, fullImageUri, theme, onImagePress }) {
    const zoomUri = fullImageUri || imageUri;
    return (
        <View style={styles.wrap}>
            <View style={[styles.photo, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
                {imageUri ? (
                    <CoverImage
                        uri={imageUri}
                        style={styles.imageFill}
                        onPress={zoomUri && onImagePress ? () => onImagePress(zoomUri) : undefined}
                        accessibilityLabel={`${name} cover photo`}
                    />
                ) : (
                    <Text style={{ fontSize: 36 }}>🎉</Text>
                )}
            </View>
            <Text style={[styles.name, { color: theme.colors.text.primary }]} numberOfLines={2}>
                {name}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
    photo: {
        width: 56,
        height: 56,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageFill: { width: '100%', height: '100%' },
    name: { flex: 1, fontSize: 22, fontWeight: '700', fontFamily: undefined },
});
