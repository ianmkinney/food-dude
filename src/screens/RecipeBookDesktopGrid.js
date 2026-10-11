import React from 'react';
import { View } from 'react-native';

/** Native fallback — desktop recipe grid is web-only. */
export default function RecipeBookDesktopGrid({ children }) {
    return <View>{children}</View>;
}
