import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function PartyScreenSkeleton({ theme }) {
    const block = (w, h) => (
        <View
            style={{
                width: w,
                height: h,
                borderRadius: 8,
                backgroundColor: theme.colors.surfaceMuted,
            }}
        />
    );
    return (
        <View style={styles.wrap}>
            {block('100%', 44)}
            {block('100%', 56)}
            {block('100%', 44)}
            {block('100%', 36)}
            {block('100%', 120)}
            {block('100%', 120)}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { padding: 16, gap: 8 },
});
