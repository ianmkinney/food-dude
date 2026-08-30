import React from 'react';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { motion } from '../theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

const AnimatedListItem = ({ index = 0, style, children }) => {
    const reduceMotion = useReducedMotion();
    const entering = reduceMotion
        ? undefined
        : FadeInDown.duration(motion.duration.enter)
              .delay(Math.min(index, 8) * motion.stagger)
              .springify();

    return (
        <Animated.View
            entering={entering}
            layout={reduceMotion ? undefined : LinearTransition.springify()}
            style={style}
        >
            {children}
        </Animated.View>
    );
};

export default AnimatedListItem;
