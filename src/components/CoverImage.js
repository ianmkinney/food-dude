import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

/**
 * Fills its container with a cover-cropped image (no letterboxing).
 * Optional onPress for lightbox / zoom.
 */
export default function CoverImage({
    uri,
    style,
    imageStyle,
    onPress,
    accessibilityLabel,
    children,
    resizeMode = 'cover',
}) {
    if (!uri) return null;
    const content = (
        <>
            <Image
                source={{ uri }}
                style={[StyleSheet.absoluteFillObject, imageStyle]}
                resizeMode={resizeMode}
                accessibilityLabel={accessibilityLabel}
                accessibilityIgnoresInvertColors
            />
            {children}
        </>
    );
    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={[styles.clip, style]}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel || 'View image'}
            >
                {content}
            </Pressable>
        );
    }
    return <View style={[styles.clip, style]}>{content}</View>;
}

const styles = StyleSheet.create({
    clip: { overflow: 'hidden', position: 'relative' },
});
