import React from 'react';
import Animated from 'react-native-reanimated';
import { layoutSpring, useEnterStyle, useReducedMotion } from '../motion';

const AnimatedListItem = ({ index = 0, style, children }) => {
    const reduceMotion = useReducedMotion();
    const enterStyle = useEnterStyle({ index });

    return (
        <Animated.View layout={reduceMotion ? undefined : layoutSpring()} style={[style, enterStyle]}>
            {children}
        </Animated.View>
    );
};

export default AnimatedListItem;
