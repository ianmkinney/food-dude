import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    Modal,
    FlatList,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { formatDisplayDate, getStartOfWeek, getWeekDates, addDays, subtractDays } from '../utils/dateHelpers';
import { mealPlanOperations, recipeOperations, partyMealOperations, partyOperations } from '../database/operations';

const MealPlannerScreen = ({ route, navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek());
    const [weekDates, setWeekDates] = useState([]);
    const [mealPlans, setMealPlans] = useState([]);
    const [showMealModal, setShowMealModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedMealType, setSelectedMealType] = useState(null);
    const [partyMeals, setPartyMeals] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [selectedParty, setSelectedParty] = useState(null);
    const [parties, setParties] = useState([]);
    const [draggableItems, setDraggableItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        const dates = getWeekDates(currentWeekStart);
        setWeekDates(dates);
        loadMealPlans(dates[0], dates[6]);
        loadParties();
        loadRecipes();
    }, [currentWeekStart]);

    useEffect(() => {
        // Combine recipes and parties into draggable items
        const items = [];
        
        // Add recipes
        recipes.forEach(recipe => {
            if (recipe.image_uri) {
                items.push({
                    id: `recipe-${recipe.id}`,
                    type: 'recipe',
                    data: recipe,
                    title: recipe.title,
                    imageUri: recipe.image_uri,
                });
            }
        });
        
        // Add parties
        parties.forEach(party => {
            items.push({
                id: `party-${party.id}`,
                type: 'party',
                data: party,
                title: party.name,
                imageUri: null,
            });
        });
        
        setDraggableItems(items);
    }, [recipes, parties]);

    useEffect(() => {
        if (route?.params?.selectedMeal) {
            // If coming from Party screen with a selected meal
            const meal = route.params.selectedMeal;
            Alert.alert('Select Date', 'Choose a date and meal type for this meal', [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Select',
                    onPress: () => {
                        setShowMealModal(true);
                        setSelectedDate(new Date());
                        setSelectedMealType('dinner');
                    },
                },
            ]);
        }
    }, [route?.params?.selectedMeal]);

    const loadMealPlans = async (startDate, endDate) => {
        try {
            const plans = await mealPlanOperations.getByDateRange(
                startDate.toISOString().split('T')[0],
                endDate.toISOString().split('T')[0]
            );
            setMealPlans(plans);
        } catch (error) {
            console.error('Error loading meal plans:', error);
        }
    };

    const loadParties = async () => {
        try {
            const allParties = await partyOperations.getAll();
            setParties(allParties);
            if (allParties.length > 0 && !selectedParty) {
                setSelectedParty(allParties[0]);
                const meals = await partyMealOperations.getByPartyId(allParties[0].id);
                setPartyMeals(meals);
            }
        } catch (error) {
            console.error('Error loading parties:', error);
        }
    };

    const loadRecipes = async () => {
        try {
            const allRecipes = await recipeOperations.getAll();
            setRecipes(allRecipes);
        } catch (error) {
            console.error('Error loading recipes:', error);
        }
    };

    const goToPreviousWeek = () => {
        setCurrentWeekStart(subtractDays(currentWeekStart, 7));
    };

    const goToNextWeek = () => {
        setCurrentWeekStart(addDays(currentWeekStart, 7));
    };

    const handleMealSlotPress = (date, mealType) => {
        setSelectedDate(date);
        setSelectedMealType(mealType);
        setShowMealModal(true);
    };

    const handleSelectMeal = async (recipeId) => {
        if (!selectedDate || !selectedMealType) return;

        try {
            await mealPlanOperations.add({
                recipeId,
                date: selectedDate.toISOString().split('T')[0],
                mealType: selectedMealType,
                servings: 1,
            });
            setShowMealModal(false);
            const dates = getWeekDates(currentWeekStart);
            await loadMealPlans(dates[0], dates[6]);
            Alert.alert('Success', 'Meal added to planner!');
        } catch (error) {
            console.error('Error adding meal:', error);
            Alert.alert('Error', 'Failed to add meal');
        }
    };

    const handleDropOnMealSlot = async (item, date, mealType) => {
        try {
            if (item.type === 'recipe') {
                // Schedule recipe
                await mealPlanOperations.add({
                    recipeId: item.data.id,
                    date: date.toISOString().split('T')[0],
                    mealType: mealType,
                    servings: 1,
                });
                const dates = getWeekDates(currentWeekStart);
                await loadMealPlans(dates[0], dates[6]);
                Alert.alert('Success', `${item.title} scheduled!`);
            } else if (item.type === 'party') {
                // Schedule party - add all recipes from party meals and update party scheduled date
                const partyMeals = await partyMealOperations.getByPartyId(item.data.id);
                let scheduledCount = 0;
                const dateStr = date.toISOString().split('T')[0];
                
                for (const meal of partyMeals) {
                    if (meal.recipeIds && meal.recipeIds.length > 0) {
                        for (const recipeId of meal.recipeIds) {
                            await mealPlanOperations.add({
                                recipeId: recipeId,
                                date: dateStr,
                                mealType: mealType,
                                servings: 1,
                            });
                            scheduledCount++;
                        }
                    }
                }
                
                // Update party with scheduled date
                await partyOperations.update(item.data.id, {
                    scheduled_date: dateStr,
                    scheduled_meal_type: mealType,
                });
                
                const dates = getWeekDates(currentWeekStart);
                await loadMealPlans(dates[0], dates[6]);
                Alert.alert('Success', `Party "${item.title}" scheduled with ${scheduledCount} recipe(s)!`);
            }
            setSelectedItem(null);
        } catch (error) {
            console.error('Error scheduling item:', error);
            Alert.alert('Error', 'Failed to schedule item');
            setSelectedItem(null);
        }
    };

    const handleMealSlotWithMeal = async (meal, date, mealType) => {
        Alert.alert(
            meal.title,
            'What would you like to do?',
            [
                {
                    text: 'View Recipe',
                    onPress: async () => {
                        try {
                            const dateStr = date.toISOString().split('T')[0];
                            // Check if there's a party scheduled for this date and meal type
                            const allParties = await partyOperations.getAll();
                            const matchingParty = allParties.find(
                                p => p.scheduled_date === dateStr && p.scheduled_meal_type === mealType
                            );
                            
                            if (matchingParty) {
                                // Navigate to Party screen
                                navigation.navigate('Party');
                            } else {
                                // Navigate to Recipe Detail screen
                                navigation.navigate('RecipeDetail', { recipeId: meal.recipe_id });
                            }
                        } catch (error) {
                            console.error('Error navigating to recipe/party:', error);
                            Alert.alert('Error', 'Failed to open recipe/party');
                        }
                    },
                },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await mealPlanOperations.delete(meal.id);
                            const dates = getWeekDates(currentWeekStart);
                            await loadMealPlans(dates[0], dates[6]);
                            Alert.alert('Success', 'Meal removed from planner');
                        } catch (error) {
                            console.error('Error removing meal:', error);
                            Alert.alert('Error', 'Failed to remove meal');
                        }
                    },
                },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    const renderMealSlot = (date, mealType) => {
        const dateStr = date.toISOString().split('T')[0];
        const meal = mealPlans.find(m => m.date === dateStr && m.meal_type === mealType);
        const isSelected = selectedItem && selectedItem.date === dateStr && selectedItem.mealType === mealType;

        return (
            <TouchableOpacity
                style={[
                    styles.mealSlot,
                    {
                        backgroundColor: isSelected ? theme.primary[100] : theme.colors.surface,
                        borderColor: isSelected ? theme.primary[500] : theme.colors.border,
                        borderWidth: isSelected ? 2 : 1,
                    }
                ]}
                onPress={() => {
                    if (selectedItem && selectedItem.item) {
                        // Drop selected item here
                        handleDropOnMealSlot(selectedItem.item, date, mealType);
                        setSelectedItem(null);
                    } else if (meal) {
                        // Meal exists - show options
                        handleMealSlotWithMeal(meal, date, mealType);
                    } else {
                        // Open meal selection modal
                        handleMealSlotPress(date, mealType);
                    }
                }}
            >
                {meal ? (
                    <Ionicons name="checkmark-circle" size={24} color={theme.primary[500]} />
                ) : (
                    <Ionicons name="add-circle-outline" size={24} color={theme.colors.text.tertiary} />
                )}
            </TouchableOpacity>
        );
    };

    const renderDraggableItem = ({ item }) => {
        const isSelected = selectedItem && selectedItem.item && selectedItem.item.id === item.id;
        
        return (
            <TouchableOpacity
                style={[
                    styles.draggableItem,
                    {
                        backgroundColor: isSelected ? theme.primary[100] : theme.colors.surface,
                        borderColor: isSelected ? theme.primary[500] : theme.colors.border,
                        borderWidth: isSelected ? 2 : 1,
                    }
                ]}
                onPress={() => {
                    if (isSelected) {
                        setSelectedItem(null);
                    } else {
                        setSelectedItem({ item });
                        Alert.alert(
                            'Item Selected',
                            `Tap a meal slot to schedule "${item.title}"`,
                            [{ text: 'OK' }]
                        );
                    }
                }}
            >
                {item.imageUri ? (
                    <Image source={{ uri: item.imageUri }} style={styles.draggableItemImage} />
                ) : (
                    <View style={[styles.draggableItemPlaceholder, { backgroundColor: theme.primary[100] }]}>
                        <Ionicons 
                            name={item.type === 'party' ? 'people' : 'restaurant'} 
                            size={24} 
                            color={theme.primary[500]} 
                        />
                    </View>
                )}
                <Text style={[styles.draggableItemTitle, { color: theme.colors.text.primary }]} numberOfLines={1}>
                    {item.title}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Week Navigation */}
            <View style={[styles.weekNav, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                <TouchableOpacity onPress={goToPreviousWeek} style={styles.navButton}>
                    <Ionicons name="chevron-back" size={24} color={theme.primary[500]} />
                </TouchableOpacity>
                <Text style={[styles.weekTitle, { color: theme.colors.text.primary }]}>
                    {formatDisplayDate(weekDates[0])} - {formatDisplayDate(weekDates[6])}
                </Text>
                <TouchableOpacity onPress={goToNextWeek} style={styles.navButton}>
                    <Ionicons name="chevron-forward" size={24} color={theme.primary[500]} />
                </TouchableOpacity>
            </View>

            {/* Draggable Items Bar */}
            {draggableItems.length > 0 && (
                <View style={[styles.draggableBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                    <Text style={[styles.draggableBarTitle, { color: theme.colors.text.secondary }]}>
                        {selectedItem ? 'Tap a meal slot to schedule' : 'Tap to select, then tap a meal slot'}
                    </Text>
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.draggableList}
                    >
                        {draggableItems.map((item) => (
                            <View key={item.id}>
                                {renderDraggableItem({ item })}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Meal Plan Grid */}
            <ScrollView style={styles.scrollView}>
                <View style={styles.grid}>
                    {/* Header Row */}
                    <View style={styles.headerRow}>
                        <View style={styles.mealTypeCell} />
                        {weekDates.map((date, index) => (
                            <View key={index} style={styles.dayHeader}>
                                <Text style={[styles.dayText, { color: theme.colors.text.secondary }]}>
                                    {formatDisplayDate(date).split(',')[0]}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Breakfast Row */}
                    <View style={styles.mealRow}>
                        <View style={[styles.mealTypeCell, { backgroundColor: theme.colors.surface }]}>
                            <Ionicons name="sunny-outline" size={20} color={theme.accent.yellow} />
                            <Text style={[styles.mealTypeText, { color: theme.colors.text.primary }]}>Breakfast</Text>
                        </View>
                        {weekDates.map((date, index) => (
                            <View key={index} style={styles.mealCell}>
                                {renderMealSlot(date, 'breakfast')}
                            </View>
                        ))}
                    </View>

                    {/* Lunch Row */}
                    <View style={styles.mealRow}>
                        <View style={[styles.mealTypeCell, { backgroundColor: theme.colors.surface }]}>
                            <Ionicons name="partly-sunny-outline" size={20} color={theme.primary[500]} />
                            <Text style={[styles.mealTypeText, { color: theme.colors.text.primary }]}>Lunch</Text>
                        </View>
                        {weekDates.map((date, index) => (
                            <View key={index} style={styles.mealCell}>
                                {renderMealSlot(date, 'lunch')}
                            </View>
                        ))}
                    </View>

                    {/* Dinner Row */}
                    <View style={styles.mealRow}>
                        <View style={[styles.mealTypeCell, { backgroundColor: theme.colors.surface }]}>
                            <Ionicons name="moon-outline" size={20} color={theme.secondary[500]} />
                            <Text style={[styles.mealTypeText, { color: theme.colors.text.primary }]}>Dinner</Text>
                        </View>
                        {weekDates.map((date, index) => (
                            <View key={index} style={styles.mealCell}>
                                {renderMealSlot(date, 'dinner')}
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>

            {/* Meal Selection Modal */}
            <Modal
                visible={showMealModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowMealModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>
                                Select Meal for {selectedDate ? formatDisplayDate(selectedDate) : ''}
                            </Text>
                            <TouchableOpacity onPress={() => setShowMealModal(false)}>
                                <Ionicons name="close" size={24} color={theme.colors.text.primary} />
                            </TouchableOpacity>
                        </View>

                        {/* Party Meals Section */}
                        {partyMeals.length > 0 && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>
                                    Party Meals
                                </Text>
                                <FlatList
                                    data={partyMeals}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item }) => (
                                        <TouchableOpacity
                                            style={[styles.mealOption, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                                            onPress={() => {
                                                // Use first recipe from party meal
                                                if (item.recipeIds && item.recipeIds.length > 0) {
                                                    handleSelectMeal(item.recipeIds[0]);
                                                }
                                            }}
                                        >
                                            <Ionicons name="people" size={20} color={theme.primary[500]} />
                                            <View style={styles.mealOptionContent}>
                                                <Text style={[styles.mealOptionName, { color: theme.colors.text.primary }]}>
                                                    {item.name}
                                                </Text>
                                                {item.description && (
                                                    <Text style={[styles.mealOptionDesc, { color: theme.colors.text.secondary }]} numberOfLines={1}>
                                                        {item.description}
                                                    </Text>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        )}

                        {/* Recipes Section */}
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>
                                Recipes
                            </Text>
                            <FlatList
                                data={recipes}
                                keyExtractor={(item) => item.id.toString()}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[styles.mealOption, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                                        onPress={() => handleSelectMeal(item.id)}
                                    >
                                        <Ionicons name="restaurant" size={20} color={theme.primary[500]} />
                                        <View style={styles.mealOptionContent}>
                                            <Text style={[styles.mealOptionName, { color: theme.colors.text.primary }]}>
                                                {item.title}
                                            </Text>
                                            {item.description && (
                                                <Text style={[styles.mealOptionDesc, { color: theme.colors.text.secondary }]} numberOfLines={1}>
                                                    {item.description}
                                                </Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                )}
                                style={styles.mealList}
                            />
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    weekNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
    },
    navButton: {
        padding: 8,
    },
    weekTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    grid: {
        padding: 16,
    },
    headerRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    mealRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    mealTypeCell: {
        width: 100,
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        marginRight: 8,
    },
    mealTypeText: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
    },
    dayHeader: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: 2,
    },
    dayText: {
        fontSize: 12,
        fontWeight: '600',
    },
    mealCell: {
        flex: 1,
        marginHorizontal: 2,
    },
    mealSlot: {
        minHeight: 60,
        borderRadius: 8,
        borderWidth: 1,
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mealText: {
        fontSize: 11,
        textAlign: 'center',
        fontWeight: '500',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    mealList: {
        maxHeight: 300,
    },
    mealOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 8,
        gap: 12,
    },
    mealOptionContent: {
        flex: 1,
    },
    mealOptionName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    mealOptionDesc: {
        fontSize: 14,
    },
    draggableBar: {
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    draggableBarTitle: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
        paddingHorizontal: 16,
        textTransform: 'uppercase',
    },
    draggableList: {
        paddingHorizontal: 16,
        gap: 12,
    },
    draggableItem: {
        width: 100,
        marginRight: 12,
        borderRadius: 12,
        padding: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    draggableItemImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: '#f0f0f0',
    },
    draggableItemPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 8,
        marginBottom: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    draggableItemTitle: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default MealPlannerScreen;
