import React, { createContext, useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { PixelRatio, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TEXT_SCALES } from '../theme';
import { TextScaleContext } from '../platform/rn-shim/textScale';

const ThemeContext = createContext();

const TEXT_SIZE_KEY = 'textSize';
export const TEXT_SIZE_OPTIONS = [
    { id: 'small', label: 'Small' },
    { id: 'default', label: 'Default' },
    { id: 'large', label: 'Large' },
    { id: 'xlarge', label: 'Extra large' },
];

// Safari exposes iOS Dynamic Type through the -apple-system-body font (17px at
// the default setting); other browsers report the user's default font size.
const readWebSystemScale = () => {
    try {
        const probe = document.createElement('span');
        probe.style.font = '-apple-system-body';
        if (probe.style.font) {
            document.body.appendChild(probe);
            const px = parseFloat(getComputedStyle(probe).fontSize);
            probe.remove();
            if (px) return px / 17;
        }
        const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return root ? root / 16 : 1;
    } catch {
        return 1;
    }
};

const readSystemScale = () => {
    const raw = Platform.OS === 'web' ? readWebSystemScale() : PixelRatio.getFontScale();
    return Math.min(Math.max(raw || 1, TEXT_SCALES.small), TEXT_SCALES.xlarge);
};

/** The named size closest to a scale, used to show which option the OS setting matches. */
export const nearestTextSize = (scale) =>
    Object.entries(TEXT_SCALES).reduce((best, [id, value]) =>
        Math.abs(value - scale) < Math.abs(TEXT_SCALES[best] - scale) ? id : best, 'default');

const readStoredTextSizeSync = () => {
    if (Platform.OS !== 'web') return null;
    try {
        const saved = window.localStorage.getItem(TEXT_SIZE_KEY);
        return saved && TEXT_SCALES[saved] ? saved : null;
    } catch {
        return null;
    }
};

export const ThemeProvider = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [themeMode, setThemeMode] = useState('system'); // 'system', 'light', 'dark'
    const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
    // null means "follow the OS".
    const [textSize, setTextSizeState] = useState(readStoredTextSizeSync);
    const [systemTextScale] = useState(readSystemScale);

    useEffect(() => {
        loadThemePreference();
    }, []);

    useEffect(() => {
        updateTheme();
    }, [themeMode, systemColorScheme]);

    const loadThemePreference = async () => {
        try {
            const [savedTheme, savedTextSize] = await Promise.all([
                AsyncStorage.getItem('themeMode'),
                AsyncStorage.getItem(TEXT_SIZE_KEY),
            ]);
            if (savedTheme) {
                setThemeMode(savedTheme);
            }
            if (savedTextSize && TEXT_SCALES[savedTextSize]) {
                setTextSizeState(savedTextSize);
            }
        } catch (error) {
            console.error('Error loading theme preference:', error);
        }
    };

    const updateTheme = () => {
        if (themeMode === 'system') {
            setIsDark(systemColorScheme === 'dark');
        } else {
            setIsDark(themeMode === 'dark');
        }
    };

    const toggleTheme = async () => {
        let newMode;
        if (themeMode === 'system') {
            newMode = systemColorScheme === 'dark' ? 'light' : 'dark';
        } else if (themeMode === 'dark') {
            newMode = 'light';
        } else {
            newMode = 'dark';
        }

        setThemeMode(newMode);
        try {
            await AsyncStorage.setItem('themeMode', newMode);
        } catch (error) {
            console.error('Error saving theme preference:', error);
        }
    };

    const setSystemTheme = async () => {
        setThemeMode('system');
        try {
            await AsyncStorage.setItem('themeMode', 'system');
        } catch (error) {
            console.error('Error saving theme preference:', error);
        }
    };

    const setTextSize = useCallback(async (size) => {
        const next = size && TEXT_SCALES[size] ? size : null;
        setTextSizeState(next);
        try {
            if (next) await AsyncStorage.setItem(TEXT_SIZE_KEY, next);
            else await AsyncStorage.removeItem(TEXT_SIZE_KEY);
        } catch (error) {
            console.error('Error saving text size:', error);
        }
    }, []);

    // Following the OS on native means leaving RN's own font scaling on (scale 1);
    // web has no such scaling, so it applies the detected system scale itself.
    const textScale = textSize
        ? TEXT_SCALES[textSize]
        : Platform.OS === 'web'
          ? systemTextScale
          : 1;
    const scaleValue = useMemo(() => ({ scale: textScale, explicit: !!textSize }), [textScale, textSize]);

    return (
        <ThemeContext.Provider
            value={{
                isDark,
                themeMode,
                toggleTheme,
                setSystemTheme,
                textSize,
                setTextSize,
                textScale,
                systemTextSize: nearestTextSize(systemTextScale),
            }}
        >
            <TextScaleContext.Provider value={scaleValue}>{children}</TextScaleContext.Provider>
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};
