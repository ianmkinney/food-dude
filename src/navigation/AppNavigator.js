import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getSurfaceStyle, getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import AnimatedPressable from '../components/AnimatedPressable';

// Import screens
import RecipeBookScreen from '../screens/RecipeBookScreen';
import SousScreen from '../sous/SousScreen';
import MealPlannerScreen from '../screens/MealPlannerScreen';
import PantryScreen from '../screens/PantryScreen';
import GroceryListScreen from '../screens/GroceryListScreen';
import AiChefScreen from '../screens/AiChefScreen';
import ImportRecipeScreen from '../screens/ImportRecipeScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import AddRecipeScreen from '../screens/AddRecipeScreen';
import AddPantryItemScreen from '../screens/AddPantryItemScreen';
import EditPantryItemScreen from '../screens/EditPantryItemScreen';
import AddGroceryItemScreen from '../screens/AddGroceryItemScreen';
import EstimateCostScreen from '../screens/EstimateCostScreen';
import PartyScreen from '../screens/PartyScreen';
import AccountScreen from '../screens/AccountScreen';
import HeaderTitle, { HeaderAccountActions, HeaderPartyButton } from '../components/HeaderTitle';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const hasModifierKey = (e) => !!(e?.metaKey || e?.altKey || e?.ctrlKey || e?.shiftKey);

const TabBarButton = (props) => {
    const { children, style, onPress, onLongPress, accessibilityState, href, ...rest } = props;
    // On web the tab renders as an <a href>; without preventDefault the browser
    // does a full page load instead of a tab switch. Modified clicks keep the
    // browser's own open-in-new-tab behaviour.
    const handlePress = (e) => {
        if (Platform.OS === 'web' && href) {
            if (hasModifierKey(e) || (e?.button != null && e.button !== 0)) return;
            e?.preventDefault?.();
        }
        onPress?.(e);
    };
    return (
        <AnimatedPressable
            {...rest}
            href={href}
            accessibilityState={accessibilityState}
            onPress={handlePress}
            onLongPress={onLongPress}
            tilt
            style={[style, styles.tabButton]}
        >
            {children}
        </AnimatedPressable>
    );
};

const TabNavigator = () => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const glass = getSurfaceStyle({ ...theme, platform: Platform.OS }, 'glass');

    return (
        <Tab.Navigator
            screenOptions={({ route }) => {
                return {
                    headerTitle: () => <HeaderTitle />,
                    headerTitleAlign: 'center',
                    headerLeft:
                        route.name !== 'AI Chef'
                            ? (props) => <HeaderPartyButton {...props} />
                            : undefined,
                    headerRight:
                        route.name === 'Sous'
                            ? (props) => <HeaderAccountActions {...props} />
                            : undefined,
                    tabBarButton: (props) => <TabBarButton {...props} />,
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName;

                    switch (route.name) {
                        case 'Sous':
                            iconName = focused ? 'sparkles' : 'sparkles-outline';
                            break;
                        case 'Recipes':
                            iconName = focused ? 'book' : 'book-outline';
                            break;
                        case 'Planner':
                            iconName = focused ? 'calendar' : 'calendar-outline';
                            break;
                        case 'Pantry':
                            iconName = focused ? 'cube' : 'cube-outline';
                            break;
                        case 'Grocery':
                            iconName = focused ? 'cart' : 'cart-outline';
                            break;
                        case 'AI Chef':
                            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                            break;
                        default:
                            iconName = 'help-outline';
                    }

                    return (
                        <Ionicons
                            name={iconName}
                            size={focused ? size + 1 : size}
                            color={color}
                        />
                    );
                },
                tabBarActiveTintColor: theme.primary[500],
                tabBarInactiveTintColor: theme.colors.text.tertiary,
                tabBarStyle: {
                    backgroundColor: glass.backgroundColor,
                    borderTopColor: theme.colors.borderSoft,
                    borderTopWidth: 1,
                    // Native keeps room for the home indicator; browsers draw their own chrome.
                    paddingBottom: Platform.OS === 'web' ? 10 : 30,
                    paddingTop: 8,
                    height: Platform.OS === 'web' ? 74 : 94,
                    ...theme.shadows.tabBar,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    lineHeight: 16,
                    fontFamily: theme.typography.fonts.displayMedium,
                },
                headerStyle: {
                    backgroundColor: theme.colors.background,
                    borderBottomColor: theme.colors.borderSoft,
                    ...theme.shadows.sm,
                },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                };
            }}
        >
            <Tab.Screen
                name="Sous"
                component={SousScreen}
                options={{ title: 'Sous', tabBarLabel: 'Sous' }}
            />
            <Tab.Screen
                name="Recipes"
                component={RecipeBookScreen}
                options={{ title: 'Recipe Book', tabBarLabel: 'Recipes' }}
            />
            <Tab.Screen
                name="Planner"
                component={MealPlannerScreen}
                options={{ title: 'Meal Planner', tabBarLabel: 'Planner' }}
            />
            <Tab.Screen
                name="Pantry"
                component={PantryScreen}
                options={{ title: 'My Pantry', tabBarLabel: 'Pantry' }}
            />
            <Tab.Screen
                name="Grocery"
                component={GroceryListScreen}
                options={{ title: 'Grocery List', tabBarLabel: 'Grocery' }}
            />
            <Tab.Screen
                name="AI Chef"
                component={AiChefScreen}
                options={{ title: 'AI Chef' }}
            />
        </Tab.Navigator>
    );
};

import { useShareIntent } from '../platform/shareIntent';
import { useEffect } from 'react';

const AppNavigator = () => {
    const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    useEffect(() => {
        if (hasShareIntent) {
            console.log('Received share intent:', shareIntent);

            if (shareIntent.type === 'text' || shareIntent.type === 'weburl') {
                navigation.navigate('ImportRecipe', {
                    sharedContent: shareIntent.value,
                    type: shareIntent.type
                });
            } else if (shareIntent.type === 'image' || shareIntent.type === 'media') {
                navigation.navigate('ImportRecipe', {
                    sharedFiles: shareIntent.files,
                    type: 'image'
                });
            }

            resetShareIntent();
        }
    }, [hasShareIntent, shareIntent, resetShareIntent, navigation]);

    return (
        <Stack.Navigator
            screenOptions={{
                headerStyle: {
                    backgroundColor: theme.colors.background,
                    borderBottomColor: theme.colors.border,
                },
                headerTintColor: theme.colors.text.primary,
                headerTitleStyle: {
                    fontFamily: theme.typography.fonts.display,
                    fontSize: 20,
                },
            }}
        >
            <Stack.Screen
                name="Main"
                component={TabNavigator}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="ImportRecipe"
                component={ImportRecipeScreen}
                options={({ navigation }) => ({
                    title: 'Import Recipe',
                    presentation: 'modal',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="RecipeDetail"
                component={RecipeDetailScreen}
                options={({ navigation }) => ({ 
                    title: 'Recipe Details',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="AddRecipe"
                component={AddRecipeScreen}
                options={({ navigation }) => ({ 
                    title: 'Add Recipe',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="AddPantryItem"
                component={AddPantryItemScreen}
                options={({ navigation }) => ({ 
                    title: 'Add Pantry Item',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="EditPantryItem"
                component={EditPantryItemScreen}
                options={({ navigation }) => ({ 
                    title: 'Edit Pantry Item',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="AddGroceryItem"
                component={AddGroceryItemScreen}
                options={({ navigation }) => ({ 
                    title: 'Add Grocery Item',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="EstimateCost"
                component={EstimateCostScreen}
                options={({ navigation }) => ({ 
                    title: 'Estimate Cost',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="Party"
                component={PartyScreen}
                options={({ navigation }) => ({ 
                    title: 'Party',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="Account"
                component={AccountScreen}
                options={({ navigation }) => ({ 
                    title: 'Account',
                    headerBackTitle: 'Recipe Book',
                    headerStyle: {
                        backgroundColor: theme.colors.background,
                        borderBottomColor: theme.colors.border,
                    },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontFamily: theme.typography.fonts.display,
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => navigation.goBack()}
                            style={{ marginLeft: 16 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
        </Stack.Navigator>
    );
};

const styles = StyleSheet.create({
    tabButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default AppNavigator;
