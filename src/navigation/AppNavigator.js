import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Easing, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import AmpliTabBar from './AmpliTabBar';

import RecipeBookScreen from '../screens/RecipeBookScreen';
import SousScreen from '../sous/SousScreen';
import { ASSISTANT_NAME } from '../config/assistant';

import {
    MealPlannerScreen,
    PantryScreen,
    GroceryListScreen,
    AiChefScreen,
    ImportRecipeScreen,
    RecipeDetailScreen,
    AddRecipeScreen,
    AddPantryItemScreen,
    EditPantryItemScreen,
    AddGroceryItemScreen,
    EstimateCostScreen,
    PartyScreen,
    AccountScreen,
    PaywallScreen,
} from './lazyRoutes';
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

const TAB_PRELOADS = {
    Planner: MealPlannerScreen.preload,
    Pantry: PantryScreen.preload,
    Grocery: GroceryListScreen.preload,
};

const tabTransition = {
    animation: 'timing',
    config: { duration: motion.duration.base, easing: Easing.bezier(...motion.easeOut) },
};

// Cross-fade with a 12px slide in the direction of travel.
const tabSceneInterpolator = ({ current }) => ({
    sceneStyle: {
        opacity: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
        transform: [
            {
                translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-12, 0, 12] }),
            },
        ],
    },
});

const TabNavigator = () => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const reduceMotion = useReducedMotion();

    return (
        <Tab.Navigator
            tabBar={(props) => <AmpliTabBar {...props} icons={TAB_ICONS} preloads={TAB_PRELOADS} />}
            screenOptions={{
                headerTitle: () => <HeaderTitle />,
                headerTitleAlign: 'center',
                headerLeft: (props) => <HeaderPartyButton {...props} />,
                headerStyle: {
                    backgroundColor: theme.colors.background,
                    borderBottomColor: theme.colors.borderSoft,
                    borderBottomWidth: 1,
                },
                headerShadowVisible: false,
                headerTintColor: theme.colors.text.primary,
                headerTitleStyle: {
                    fontFamily: theme.typography.fonts.display,
                    fontSize: 20,
                },
                animation: reduceMotion ? 'none' : 'shift',
                transitionSpec: tabTransition,
                sceneStyleInterpolator: tabSceneInterpolator,
            }}
        >
            <Tab.Screen
                name={ASSISTANT_NAME}
                component={SousScreen}
                options={{
                    title: ASSISTANT_NAME,
                    tabBarLabel: ASSISTANT_NAME,
                    headerRight: (props) => <HeaderAccountActions {...props} />,
                }}
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
                name="AiChef"
                component={AiChefScreen}
                options={({ navigation }) => ({
                    title: `${ASSISTANT_NAME} · Photos & pantry`,
                    headerStyle: { backgroundColor: theme.colors.background },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: { fontFamily: theme.typography.fonts.display, fontSize: 20 },
                    headerLeft: () => (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back"
                            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: ASSISTANT_NAME }))}
                            style={{ marginLeft: 16, padding: 10 }}
                        >
                            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
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
                            style={{ marginLeft: 16, padding: 4 }}
                        >
                            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                    ),
                })}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;
