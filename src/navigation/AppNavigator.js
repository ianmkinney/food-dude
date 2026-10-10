import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Easing, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../motion';
import AppTabBar from './AppTabBar';

import RecipeBookScreen from '../screens/RecipeBookScreen';
import SousScreen from '../sous/SousScreen';
import { ASSISTANT_NAME } from '../config/assistant';
import { lazyScreen } from './lazyScreen';
import { prefetchTabData } from '../data/queries';

const MealPlannerScreen = lazyScreen(() => import('../screens/MealPlannerScreen'));
const PantryScreen = lazyScreen(() => import('../screens/PantryScreen'));
const GroceryListScreen = lazyScreen(() => import('../screens/GroceryListScreen'));
const AiChefScreen = lazyScreen(() => import('../screens/AiChefScreen'));
const ImportRecipeScreen = lazyScreen(() => import('../screens/ImportRecipeScreen'));
const RecipeDetailScreen = lazyScreen(() => import('../screens/RecipeDetailScreen'));
const AddRecipeScreen = lazyScreen(() => import('../screens/AddRecipeScreen'));
const AddPantryItemScreen = lazyScreen(() => import('../screens/AddPantryItemScreen'));
const EditPantryItemScreen = lazyScreen(() => import('../screens/EditPantryItemScreen'));
const AddGroceryItemScreen = lazyScreen(() => import('../screens/AddGroceryItemScreen'));
const EstimateCostScreen = lazyScreen(() => import('../screens/EstimateCostScreen'));
const PartyScreen = lazyScreen(() => import('../screens/PartyScreen'));
const AccountScreen = lazyScreen(() => import('../screens/AccountScreen'));
const PaywallScreen = lazyScreen(() => import('../screens/PaywallScreen'));
import HeaderTitle, { HeaderAccountActions, HeaderPartyButton } from '../components/HeaderTitle';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
    [ASSISTANT_NAME]: 'sparkles',
    Recipes: 'book',
    Planner: 'calendar',
    Pantry: 'cube',
    Grocery: 'cart',
};

// Pages cross-fade and slide 12px in the direction of travel.
const easeOut = Easing.bezier(...motion.easing.bezier);
const slideScene = ({ current }) => ({
    sceneStyle: {
        opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
        transform: [
            { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-12, 0, 12] }) },
        ],
    },
});
const sceneTransition = {
    animation: 'timing',
    config: { duration: motion.duration.base, easing: easeOut },
};

const renderTabBar = (props) => <AppTabBar {...props} icons={TAB_ICONS} />;

// Once startup has settled, load the tab chunks and their data so a first
// visit renders filled instead of flashing a placeholder.
const PREFETCH_AFTER_MS = 2500;
function usePrefetchTabs() {
    useEffect(() => {
        let idle;
        const run = async () => {
            await Promise.all([MealPlannerScreen, PantryScreen, GroceryListScreen].map((s) => s.preload()));
            await prefetchTabData();
        };
        const timer = setTimeout(() => {
            if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(run, { timeout: 2000 });
            else run();
        }, PREFETCH_AFTER_MS);
        return () => {
            clearTimeout(timer);
            if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
        };
    }, []);
}

const TabNavigator = () => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const reduceMotion = useReducedMotion();
    usePrefetchTabs();

    return (
        <Tab.Navigator
            tabBar={renderTabBar}
            screenOptions={({ route }) => ({
                headerTitle: () => <HeaderTitle />,
                headerTitleAlign: 'center',
                headerLeft: (props) => <HeaderPartyButton {...props} />,
                headerRight:
                    route.name === ASSISTANT_NAME
                        ? (props) => <HeaderAccountActions {...props} />
                        : undefined,
                ...(reduceMotion
                    ? { animation: 'none' }
                    : { sceneStyleInterpolator: slideScene, transitionSpec: sceneTransition }),
                headerStyle: {
                    backgroundColor: theme.colors.background,
                    borderBottomColor: theme.colors.borderSoft,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                },
                headerShadowVisible: false,
                headerTintColor: theme.colors.text.primary,
                headerTitleStyle: {
                    fontFamily: theme.typography.fonts.display,
                    fontSize: 20,
                },
                sceneStyle: { backgroundColor: theme.colors.background },
            })}
        >
            <Tab.Screen
                name={ASSISTANT_NAME}
                component={SousScreen}
                options={{ title: ASSISTANT_NAME, tabBarLabel: ASSISTANT_NAME }}
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
        </Tab.Navigator>
    );
};

import { useShareIntent } from '../platform/shareIntent';

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
                headerShadowVisible: false,
                contentStyle: { backgroundColor: theme.colors.background },
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
                            style={styles.headerBack}
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
                            style={styles.headerBack}
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
                    animation: 'fade_from_bottom',
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
                            style={styles.headerBack}
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
                    animation: 'fade_from_bottom',
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
                            style={styles.headerBack}
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
                            style={styles.headerBack}
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
                    animation: 'fade_from_bottom',
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
                            style={styles.headerBack}
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
                            style={styles.headerBack}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="AiChef"
                component={AiChefScreen}
                options={({ navigation }) => ({
                    title: 'AI Chef',
                    headerBackTitle: ASSISTANT_NAME,
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: ASSISTANT_NAME }))}
                            style={styles.headerBack}
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
                            style={styles.headerBack}
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
                            style={styles.headerBack}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
            <Stack.Screen
                name="Paywall"
                component={PaywallScreen}
                options={({ navigation }) => ({
                    title: 'AmpliFood Plus',
                    presentation: 'modal',
                    headerStyle: { backgroundColor: theme.colors.background },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: { fontFamily: theme.typography.fonts.display, fontSize: 20 },
                    headerLeft: () => (
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Close AmpliFood Plus"
                            onPress={() => {
                                if (navigation.canGoBack()) {
                                    navigation.goBack();
                                } else {
                                    navigation.navigate('Account');
                                }
                            }}
                            style={styles.headerBack}
                        >
                            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
        </Stack.Navigator>
    );
};

const styles = StyleSheet.create({
    headerBack: {
        marginLeft: 6,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default AppNavigator;
