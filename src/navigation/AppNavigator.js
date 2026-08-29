import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

// Import screens
import RecipeBookScreen from '../screens/RecipeBookScreen';
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
import HeaderTitle from '../components/HeaderTitle';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabNavigator = () => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    return (
        <Tab.Navigator
            screenOptions={({ route, navigation }) => {
                return {
                    headerTitle: (props) => (
                        <HeaderTitle
                            {...props}
                            showPartyButton={route.name !== 'AI Chef'}
                            showAccountButton={route.name === 'Recipes'}
                        />
                    ),
                    headerTitleAlign: 'center',
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName;

                    switch (route.name) {
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

                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: theme.primary[500],
                tabBarInactiveTintColor: theme.colors.text.tertiary,
                tabBarStyle: {
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.colors.border,
                    paddingBottom: 30,
                    paddingTop: 10,
                    height: 90,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                },
                headerStyle: {
                    backgroundColor: theme.colors.background,
                    borderBottomColor: theme.colors.border,
                },
                    headerTintColor: theme.colors.text.primary,
                    headerTitleStyle: {
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                };
            }}
        >
            <Tab.Screen
                name="Recipes"
                component={RecipeBookScreen}
                options={{ title: 'Recipe Book' }}
            />
            <Tab.Screen
                name="Planner"
                component={MealPlannerScreen}
                options={{ title: 'Meal Planner' }}
            />
            <Tab.Screen
                name="Pantry"
                component={PantryScreen}
                options={{ title: 'My Pantry' }}
            />
            <Tab.Screen
                name="Grocery"
                component={GroceryListScreen}
                options={{ title: 'Grocery List' }}
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
                    fontWeight: 'bold',
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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
                        fontWeight: 'bold',
                        fontSize: 20,
                    },
                    headerLeft: () => (
                        <TouchableOpacity
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

export default AppNavigator;
