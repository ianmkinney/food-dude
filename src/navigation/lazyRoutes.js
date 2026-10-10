import React from 'react';
import { View } from 'react-native';
import { lazyScreen } from './lazyScreen';

// Add screens carry a fixed id so a FAB can morph into them (see motion/sharedElement).
const asAddSheet = (Screen) => {
    function AddSheet(props) {
        return (
            <View nativeID="add-sheet" style={{ flex: 1 }}>
                <Screen {...props} />
            </View>
        );
    }
    AddSheet.preload = Screen.preload;
    return AddSheet;
};

export const MealPlannerScreen = lazyScreen(() => import('../screens/MealPlannerScreen'));
export const PantryScreen = lazyScreen(() => import('../screens/PantryScreen'));
export const GroceryListScreen = lazyScreen(() => import('../screens/GroceryListScreen'));
export const AiChefScreen = lazyScreen(() => import('../screens/AiChefScreen'));
export const ImportRecipeScreen = lazyScreen(() => import('../screens/ImportRecipeScreen'));
export const RecipeDetailScreen = lazyScreen(() => import('../screens/RecipeDetailScreen'));
export const AddRecipeScreen = asAddSheet(lazyScreen(() => import('../screens/AddRecipeScreen')));
export const AddPantryItemScreen = asAddSheet(lazyScreen(() => import('../screens/AddPantryItemScreen')));
export const EditPantryItemScreen = lazyScreen(() => import('../screens/EditPantryItemScreen'));
export const AddGroceryItemScreen = asAddSheet(lazyScreen(() => import('../screens/AddGroceryItemScreen')));
export const EstimateCostScreen = lazyScreen(() => import('../screens/EstimateCostScreen'));
export const PartyScreen = lazyScreen(() => import('../screens/PartyScreen'));
export const AccountScreen = lazyScreen(() => import('../screens/AccountScreen'));
export const PaywallScreen = lazyScreen(() => import('../screens/PaywallScreen'));
