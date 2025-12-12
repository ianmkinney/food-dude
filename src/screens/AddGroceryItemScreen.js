import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { groceryOperations, recipeOperations } from '../database/operations';
import { parseGroceryItemsWithAI, checkPantryForMatches } from '../services/intelligentGroceryService';
import PantryMatchModal from '../components/PantryMatchModal';

const AddGroceryItemScreen = () => {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    const [activeTab, setActiveTab] = useState('manual'); // manual, list, recipe
    const [loading, setLoading] = useState(false);
    const [aiProcessingStatus, setAiProcessingStatus] = useState('');

    // Manual Mode State
    const [manualName, setManualName] = useState('');
    const [manualQuantity, setManualQuantity] = useState('1');
    const [manualUnit, setManualUnit] = useState('');
    const [manualCategory, setManualCategory] = useState('');
    const [manualNotes, setManualNotes] = useState('');

    // List Mode State
    const [listText, setListText] = useState('');

    // Recipe Mode State
    const [recipes, setRecipes] = useState([]);
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [recipeIngredients, setRecipeIngredients] = useState([]);
    const [selectedIngredients, setSelectedIngredients] = useState(new Set());

    // Pantry Match Modal State
    const [showPantryMatchModal, setShowPantryMatchModal] = useState(false);
    const [pantryMatches, setPantryMatches] = useState([]);

    useEffect(() => {
        if (activeTab === 'recipe') {
            loadRecipes();
        }
    }, [activeTab]);

    const loadRecipes = async () => {
        setLoading(true);
        try {
            const allRecipes = await recipeOperations.getAll();
            setRecipes(allRecipes);
        } catch (error) {
            console.error('Error loading recipes:', error);
            Alert.alert('Error', 'Failed to load recipes');
        } finally {
            setLoading(false);
        }
    };

    const handleRecipeSelect = async (recipe) => {
        setLoading(true);
        try {
            const fullRecipe = await recipeOperations.getById(recipe.id);
            setSelectedRecipe(fullRecipe);
            setRecipeIngredients(fullRecipe.ingredients || []);
            // Select all by default
            const allIds = new Set(fullRecipe.ingredients.map((_, index) => index));
            setSelectedIngredients(allIds);
        } catch (error) {
            console.error('Error loading recipe details:', error);
            Alert.alert('Error', 'Failed to load recipe details');
        } finally {
            setLoading(false);
        }
    };

    const toggleIngredient = (index) => {
        const newSelected = new Set(selectedIngredients);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedIngredients(newSelected);
    };

    const handleManualAdd = async () => {
        if (!manualName.trim()) {
            Alert.alert('Error', 'Please enter an item name');
            return;
        }

        setLoading(true);
        setAiProcessingStatus('Enhancing with AI...');
        try {
            // Use AI to enhance the item with proper packaging
            const [enhancedItem] = await parseGroceryItemsWithAI([{
                name: manualName.trim(),
                quantity: manualQuantity,
                unit: manualUnit,
                category: manualCategory,
                notes: manualNotes,
            }]);
            
            setAiProcessingStatus('Checking pantry...');

            await groceryOperations.add(enhancedItem);

            // Check pantry for matches
            const matches = await checkPantryForMatches([enhancedItem.name]);

            if (matches.length > 0) {
                setPantryMatches(matches);
                setShowPantryMatchModal(true);
                resetManualForm();
            } else {
                Alert.alert('Success', 'Item added to grocery list', [
                    { text: 'Add Another', onPress: resetManualForm },
                    { text: 'Done', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (error) {
            console.error('Error adding manual item:', error);
            Alert.alert('Error', 'Failed to add item');
        } finally {
            setLoading(false);
            setAiProcessingStatus('');
        }
    };

    const resetManualForm = () => {
        setManualName('');
        setManualQuantity('1');
        setManualUnit('');
        setManualCategory('');
        setManualNotes('');
    };

    const handleListAdd = async () => {
        if (!listText.trim()) {
            Alert.alert('Error', 'Please enter some items');
            return;
        }

        const items = listText.split('\n').filter(line => line.trim());
        if (items.length === 0) return;

        setLoading(true);
        setAiProcessingStatus('Enhancing items with AI...');
        try {
            // Use AI to enhance all items with proper packaging
            const enhancedItems = await parseGroceryItemsWithAI(items);
            
            setAiProcessingStatus('Adding to list...');

            let addedCount = 0;
            for (const item of enhancedItems) {
                await groceryOperations.add(item);
                addedCount++;
            }

            // Check pantry for matches
            const itemNames = enhancedItems.map(item => item.name);
            const matches = await checkPantryForMatches(itemNames);

            if (matches.length > 0) {
                setPantryMatches(matches);
                setShowPantryMatchModal(true);
                setListText('');
            } else {
                Alert.alert('Success', `${addedCount} items added to grocery list`, [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (error) {
            console.error('Error adding list items:', error);
            Alert.alert('Error', 'Failed to add items');
        } finally {
            setLoading(false);
            setAiProcessingStatus('');
        }
    };

    const handleRecipeAdd = async () => {
        if (selectedIngredients.size === 0) {
            Alert.alert('Error', 'Please select at least one ingredient');
            return;
        }

        setLoading(true);
        setAiProcessingStatus('Enhancing ingredients with AI...');
        try {
            // Prepare ingredients for AI enhancement
            const ingredientsToAdd = [];
            for (const index of selectedIngredients) {
                const ing = recipeIngredients[index];
                ingredientsToAdd.push({
                    name: ing.ingredient,
                    quantity: ing.quantity,
                    unit: ing.unit,
                    recipeId: selectedRecipe.id,
                    recipeName: selectedRecipe.title,
                });
            }

            // Use AI to enhance ingredients with proper packaging
            const enhancedItems = await parseGroceryItemsWithAI(ingredientsToAdd);
            
            setAiProcessingStatus('Adding to list...');

            let addedCount = 0;
            for (const item of enhancedItems) {
                await groceryOperations.add(item);
                addedCount++;
            }

            // Check pantry for matches
            const itemNames = enhancedItems.map(item => item.name);
            const matches = await checkPantryForMatches(itemNames);

            if (matches.length > 0) {
                setPantryMatches(matches);
                setShowPantryMatchModal(true);
            } else {
                Alert.alert('Success', `${addedCount} ingredients added to grocery list`, [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (error) {
            console.error('Error adding recipe ingredients:', error);
            Alert.alert('Error', 'Failed to add ingredients');
        } finally {
            setLoading(false);
            setAiProcessingStatus('');
        }
    };

    const renderTabs = () => (
        <View style={[styles.tabContainer, { backgroundColor: theme.colors.surface }]}>
            {['manual', 'list', 'recipe'].map((tab) => (
                <TouchableOpacity
                    key={tab}
                    style={[
                        styles.tab,
                        activeTab === tab && { backgroundColor: theme.primary[100] }
                    ]}
                    onPress={() => setActiveTab(tab)}
                >
                    <Text style={[
                        styles.tabText,
                        { color: activeTab === tab ? theme.primary[500] : theme.colors.text.secondary }
                    ]}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderManualForm = () => (
        <ScrollView style={styles.content}>
            <View style={styles.form}>
                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Name</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                    value={manualName}
                    onChangeText={setManualName}
                    placeholder="Item Name"
                    placeholderTextColor={theme.colors.text.tertiary}
                />

                <View style={styles.row}>
                    <View style={[styles.col, { flex: 1 }]}>
                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Quantity</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            value={manualQuantity}
                            onChangeText={setManualQuantity}
                            keyboardType="numeric"
                            placeholder="1"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />
                    </View>
                    <View style={[styles.col, { flex: 1, marginLeft: 10 }]}>
                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Unit</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            value={manualUnit}
                            onChangeText={setManualUnit}
                            placeholder="e.g. kg"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />
                    </View>
                </View>

                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Category</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                    value={manualCategory}
                    onChangeText={setManualCategory}
                    placeholder="e.g. Dairy"
                    placeholderTextColor={theme.colors.text.tertiary}
                />

                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Notes</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.text.primary, borderColor: theme.colors.border, height: 80 }]}
                    value={manualNotes}
                    onChangeText={setManualNotes}
                    placeholder="Optional notes"
                    placeholderTextColor={theme.colors.text.tertiary}
                    multiline
                />

                <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: theme.primary[500] }]}
                    onPress={handleManualAdd}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                            <Text style={styles.saveButtonText}>
                                {aiProcessingStatus || 'Processing...'}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                            <Text style={styles.saveButtonText}>Add Item</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );

    const renderListForm = () => (
        <View style={styles.content}>
            <Text style={[styles.helperText, { color: theme.colors.text.secondary }]}>
                Enter items one per line
            </Text>
            <TextInput
                style={[styles.textArea, { backgroundColor: theme.colors.surface, color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                value={listText}
                onChangeText={setListText}
                placeholder="Eggs&#10;Milk&#10;Bread"
                placeholderTextColor={theme.colors.text.tertiary}
                multiline
                textAlignVertical="top"
            />
            <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary[500] }]}
                onPress={handleListAdd}
                disabled={loading}
            >
                {loading ? (
                    <>
                        <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.saveButtonText}>
                            {aiProcessingStatus || 'Processing...'}
                        </Text>
                    </>
                ) : (
                    <>
                        <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.saveButtonText}>Add Items</Text>
                    </>
                )}
            </TouchableOpacity>
        </View>
    );

    const renderRecipeSelector = () => {
        if (selectedRecipe) {
            return (
                <View style={styles.content}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => setSelectedRecipe(null)}
                    >
                        <Ionicons name="arrow-back" size={24} color={theme.primary[500]} />
                        <Text style={[styles.backText, { color: theme.primary[500] }]}>Back to Recipes</Text>
                    </TouchableOpacity>

                    <Text style={[styles.recipeTitle, { color: theme.colors.text.primary }]}>
                        {selectedRecipe.title}
                    </Text>

                    <FlatList
                        data={recipeIngredients}
                        keyExtractor={(_, index) => index.toString()}
                        renderItem={({ item, index }) => (
                            <TouchableOpacity
                                style={[styles.ingredientItem, { borderBottomColor: theme.colors.border }]}
                                onPress={() => toggleIngredient(index)}
                            >
                                <Ionicons
                                    name={selectedIngredients.has(index) ? 'checkbox' : 'square-outline'}
                                    size={24}
                                    color={selectedIngredients.has(index) ? theme.primary[500] : theme.colors.text.tertiary}
                                />
                                <Text style={[styles.ingredientText, { color: theme.colors.text.primary }]}>
                                    {item.quantity} {item.unit} {item.ingredient}
                                </Text>
                            </TouchableOpacity>
                        )}
                        style={styles.ingredientList}
                    />

                    <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: theme.primary[500] }]}
                        onPress={handleRecipeAdd}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                                <Text style={styles.saveButtonText}>
                                    {aiProcessingStatus || 'Processing...'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                <Text style={styles.saveButtonText}>Add Selected ({selectedIngredients.size})</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            );
        }

        return (
            <FlatList
                data={recipes}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.recipeCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                        onPress={() => handleRecipeSelect(item)}
                    >
                        <Text style={[styles.recipeCardTitle, { color: theme.colors.text.primary }]}>
                            {item.title}
                        </Text>
                        <Ionicons name="chevron-forward" size={24} color={theme.colors.text.tertiary} />
                    </TouchableOpacity>
                )}
                contentContainerStyle={styles.recipeList}
                ListEmptyComponent={
                    <Text style={[styles.emptyText, { color: theme.colors.text.secondary }]}>
                        No recipes found
                    </Text>
                }
            />
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {renderTabs()}
            {loading && <ActivityIndicator size="large" color={theme.primary[500]} style={styles.loader} />}

            <View style={styles.mainContent}>
                {activeTab === 'manual' && renderManualForm()}
                {activeTab === 'list' && renderListForm()}
                {activeTab === 'recipe' && renderRecipeSelector()}
            </View>

            <PantryMatchModal
                visible={showPantryMatchModal}
                matches={pantryMatches}
                onClose={() => {
                    setShowPantryMatchModal(false);
                    setPantryMatches([]);
                    navigation.goBack();
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    tabContainer: {
        flexDirection: 'row',
        padding: 8,
        margin: 16,
        borderRadius: 12,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabText: {
        fontWeight: '600',
        fontSize: 14,
    },
    mainContent: {
        flex: 1,
    },
    content: {
        padding: 20,
        flex: 1,
    },
    form: {
        gap: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    input: {
        height: 48,
        borderRadius: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        fontSize: 16,
    },
    row: {
        flexDirection: 'row',
    },
    col: {
        flex: 1,
    },
    saveButton: {
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        marginBottom: 24,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    helperText: {
        marginBottom: 12,
        fontSize: 14,
    },
    textArea: {
        flex: 1,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        fontSize: 16,
        minHeight: 200,
    },
    recipeList: {
        padding: 16,
    },
    recipeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
    },
    recipeCardTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 40,
        fontSize: 16,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    backText: {
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    recipeTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    ingredientList: {
        flex: 1,
    },
    ingredientItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    ingredientText: {
        fontSize: 16,
        marginLeft: 12,
        flex: 1,
    },
    loader: {
        marginVertical: 10,
    }
});

export default AddGroceryItemScreen;
