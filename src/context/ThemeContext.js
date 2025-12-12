import React, { createContext, useState, useEffect, useContext } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [themeMode, setThemeMode] = useState('system'); // 'system', 'light', 'dark'
    const [isDark, setIsDark] = useState(systemColorScheme === 'dark');

    useEffect(() => {
        loadThemePreference();
    }, []);

    useEffect(() => {
        updateTheme();
    }, [themeMode, systemColorScheme]);

    const loadThemePreference = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem('themeMode');
            if (savedTheme) {
                setThemeMode(savedTheme);
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

    return (
        <ThemeContext.Provider value={{ isDark, themeMode, toggleTheme, setSystemTheme }}>
            {children}
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
