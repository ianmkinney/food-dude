import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

/**
 * Smoothly collapses party chrome while the chat composer is focused (mobile web).
 */
export default function PartyChatCollapsibleHeader({ collapsed, children }) {
    const [measuredHeight, setMeasuredHeight] = useState(0);
    const heightAnim = useRef(new Animated.Value(0)).current;
    const opacityAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!measuredHeight) return;
        if (collapsed) {
            heightAnim.setValue(0);
            opacityAnim.setValue(0);
            return;
        }
        Animated.parallel([
            Animated.timing(heightAnim, {
                toValue: measuredHeight,
                duration: 280,
                useNativeDriver: false,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 220,
                useNativeDriver: false,
            }),
        ]).start();
    }, [collapsed, measuredHeight, heightAnim, opacityAnim]);

    const onLayout = (e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== measuredHeight) {
            setMeasuredHeight(h);
            if (!collapsed) {
                heightAnim.setValue(h);
                opacityAnim.setValue(1);
            }
        }
    };

    return (
        <Animated.View
            testID="party-chat-chrome"
            style={{ height: heightAnim, opacity: opacityAnim, overflow: 'hidden' }}
            accessibilityElementsHidden={collapsed}
            importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
        >
            <View onLayout={onLayout}>{children}</View>
        </Animated.View>
    );
}
