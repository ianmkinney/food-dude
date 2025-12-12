import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Alert,
    ActivityIndicator,
    TextInput,
    Modal,
    Platform,
    KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { recipeOperations, mealPlanOperations, groceryOperations, recipeCookingHistoryOperations, userOperations } from '../database/operations';
import aiChefService from '../services/aiChefService';

const RecipeDetailScreen = ({ route, navigation }) => {
    const { recipeId } = route.params;
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    const [recipe, setRecipe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generatingImage, setGeneratingImage] = useState(false);

    // Edit State
    const [editedRecipe, setEditedRecipe] = useState(null);

    // Modal State
    const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
    const [selectedMealType, setSelectedMealType] = useState('dinner');
    const [aiUpdateModalVisible, setAiUpdateModalVisible] = useState(false);
    const [aiChanges, setAiChanges] = useState([]);
    const [aiUpdatedRecipe, setAiUpdatedRecipe] = useState(null);
    const [updatingWithAI, setUpdatingWithAI] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState('');
    const [customInstructionsModalVisible, setCustomInstructionsModalVisible] = useState(false);
    const [customInstructions, setCustomInstructions] = useState('');
    const [generatingImageStatus, setGeneratingImageStatus] = useState('');
    const [generatingInstructionsStatus, setGeneratingInstructionsStatus] = useState('');

    useEffect(() => {
        loadRecipe();
    }, [recipeId]);

    const loadRecipe = async () => {
        try {
            const data = await recipeOperations.getById(recipeId);
            setRecipe(data);
            setEditedRecipe(JSON.parse(JSON.stringify(data))); // Deep copy
        } catch (error) {
            console.error('Error loading recipe:', error);
            Alert.alert('Error', 'Failed to load recipe details');
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Ensure we pass imageUri in the format operations expects, or rely on operations update
            // The operations.update expects imageUri (camelCase) but our state has image_uri (snake_case)
            // We'll create a sanitized object to pass
            const updatePayload = {
                ...editedRecipe,
                imageUri: editedRecipe.image_uri // Map snake_case to camelCase
            };
            await recipeOperations.update(recipeId, updatePayload);
            setRecipe(editedRecipe);
            setIsEditing(false);
            Alert.alert('Success', 'Recipe updated successfully');
        } catch (error) {
            console.error('Error updating recipe:', error);
            Alert.alert('Error', 'Failed to update recipe');
        } finally {
            setSaving(false);
        }
    };

    const handlePickImage = async () => {
        console.log('handlePickImage called');
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            console.log('Permission status:', status);
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Sorry, we need camera roll permissions to make this work!');
                return;
            }

            console.log('Launching image library...');
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });
            console.log('Image picker result:', result);

            if (!result.canceled) {
                setEditedRecipe({ ...editedRecipe, image_uri: result.assets[0].uri });
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Error', 'Failed to pick image: ' + error.message);
        }
    };

    const addToGroceryList = async () => {
        Alert.alert(
            'Add to Grocery List',
            'Add all ingredients to your grocery list?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Add All',
                    onPress: async () => {
                        try {
                            for (const ing of recipe.ingredients) {
                                await groceryOperations.add({
                                    name: ing.ingredient,
                                    quantity: ing.quantity,
                                    unit: ing.unit,
                                    category: 'Uncategorized',
                                    recipeId: recipe.id,
                                    recipeName: recipe.title
                                });
                            }
                            Alert.alert('Success', 'Ingredients added to grocery list');
                        } catch (error) {
                            Alert.alert('Error', 'Failed to add items');
                        }
                    }
                }
            ]
        );
    };

    const handleMarkAsCooked = async () => {
        try {
            // Ensure recipeId is a number
            const id = typeof recipeId === 'string' ? parseInt(recipeId, 10) : recipeId;
            if (isNaN(id)) {
                Alert.alert('Error', 'Invalid recipe ID');
                return;
            }

            // Toggle recipe cooked status
            const result = await recipeCookingHistoryOperations.markAsCooked(id);
            
            // Update user's recipes cooked count
            try {
                const currentUser = await userOperations.getCurrent();
                if (currentUser && currentUser.user_id) {
                    if (result.marked) {
                        // Recipe was marked as cooked - increment count
                        await userOperations.incrementRecipesCooked(currentUser.user_id);
                    } else {
                        // Recipe was unmarked - decrement count
                        await userOperations.decrementRecipesCooked(currentUser.user_id);
                    }
                }
            } catch (userError) {
                console.error('Error updating user recipes cooked count:', userError);
                // Don't fail the whole operation if user update fails
            }
            
            // Reload recipe to reflect the change
            await loadRecipe();
            
            if (result.marked) {
                Alert.alert('Success', 'Recipe marked as cooked! 🎉');
            } else {
                Alert.alert('Success', 'Recipe unmarked as cooked');
            }
        } catch (error) {
            console.error('Error toggling recipe cooked status:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                recipeId: recipeId,
                recipeIdType: typeof recipeId
            });
            Alert.alert('Error', `Failed to update recipe status: ${error.message || 'Unknown error'}`);
        }
    };

    const addToSchedule = async () => {
        try {
            // Simple scheduling for "Today" for now, or open modal
            // Let's just add for today as a quick action or show modal
            const today = new Date().toISOString().split('T')[0];
            await mealPlanOperations.add({
                recipeId: recipe.id,
                date: today,
                mealType: selectedMealType,
                servings: recipe.servings
            });
            setScheduleModalVisible(false);
            Alert.alert('Success', 'Added to meal plan for today!');
        } catch (error) {
            Alert.alert('Error', 'Failed to schedule meal');
        }
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Recipe',
            'Are you sure you want to delete this recipe?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await recipeOperations.delete(recipeId);
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete recipe');
                        }
                    },
                },
            ]
        );
    };

    // Helper to update ingredient in edit mode
    const updateIngredient = (index, field, value) => {
        const newIngredients = [...editedRecipe.ingredients];
        newIngredients[index] = { ...newIngredients[index], [field]: value };
        setEditedRecipe({ ...editedRecipe, ingredients: newIngredients });
    };

    // Helper to update instruction in edit mode
    const updateInstruction = (index, value) => {
        const newInstructions = [...editedRecipe.instructions];
        newInstructions[index] = value;
        setEditedRecipe({ ...editedRecipe, instructions: newInstructions });
    };

    const handleGenerateInstructions = async () => {
        setGenerating(true);
        setGeneratingInstructionsStatus('Analyzing recipe...');
        try {
            setGeneratingInstructionsStatus('Generating instructions...');
            const result = await aiChefService.getDetailedInstructions(editedRecipe);
            if (result.success && Array.isArray(result.instructions)) {
                setEditedRecipe({
                    ...editedRecipe,
                    instructions: result.instructions
                });
                Alert.alert('Success', 'Instructions generated!');
            } else {
                Alert.alert('Error', 'Failed to generate instructions');
            }
        } catch (error) {
            console.error('Error generating instructions:', error);
            Alert.alert('Error', 'Failed to generate instructions');
        } finally {
            setGenerating(false);
            setGeneratingInstructionsStatus('');
        }
    };

    const handleAIUpdate = () => {
        // Show custom instructions prompt first
        setCustomInstructionsModalVisible(true);
    };

    const handleAIUpdateWithInstructions = async () => {
        setCustomInstructionsModalVisible(false);
        setUpdatingWithAI(true);
        setUpdatingStatus('Analyzing recipe...');
        try {
            setUpdatingStatus('Enhancing with AI...');
            const result = await aiChefService.enhanceRecipe(recipe, customInstructions.trim() || null);
            if (result.success && result.enhancement) {
                const { updatedRecipe, changes } = result.enhancement;

                if (changes.length === 0) {
                    Alert.alert('No Changes Needed', 'Your recipe looks complete and accurate!');
                    setUpdatingWithAI(false);
                    setUpdatingStatus('');
                    setCustomInstructions('');
                    return;
                }

                setUpdatingStatus('Preparing suggestions...');
                // Store changes and updated recipe for display and application
                setAiChanges(changes);
                setAiUpdatedRecipe(updatedRecipe);
                setAiUpdateModalVisible(true);
            } else {
                Alert.alert('Error', result.error || 'Failed to enhance recipe');
            }
        } catch (error) {
            console.error('Error updating with AI:', error);
            Alert.alert('Error', 'Failed to update recipe with AI');
        } finally {
            setUpdatingWithAI(false);
            setUpdatingStatus('');
            setCustomInstructions('');
        }
    };

    const applyAIChanges = async () => {
        try {
            // Validate that we have changes to apply
            if (!aiChanges || aiChanges.length === 0) {
                Alert.alert('Error', 'No changes to apply');
                setAiUpdateModalVisible(false);
                return;
            }

            // Reload recipe to ensure we have the latest data
            const currentRecipe = await recipeOperations.getById(recipeId);
            if (!currentRecipe) {
                Alert.alert('Error', 'Recipe not found');
                setAiUpdateModalVisible(false);
                return;
            }

            // Build update object starting with existing recipe data (using camelCase for database operations)
            // Use nullish coalescing to preserve 0 and false values
            const updates = {
                title: currentRecipe.title,
                description: currentRecipe.description ?? null,
                imageUri: currentRecipe.image_uri ?? null,
                servings: currentRecipe.servings ?? null,
                prepTime: currentRecipe.prep_time ?? null,
                cookTime: currentRecipe.cook_time ?? null,
                totalTime: currentRecipe.total_time ?? null,
                difficulty: currentRecipe.difficulty ?? null,
                cuisine: currentRecipe.cuisine ?? null,
                notes: currentRecipe.notes ?? null,
                ingredients: Array.isArray(currentRecipe.ingredients) ? currentRecipe.ingredients : [],
                instructions: Array.isArray(currentRecipe.instructions) ? currentRecipe.instructions : [],
                tags: Array.isArray(currentRecipe.tags) ? currentRecipe.tags : [],
                calories: currentRecipe.calories ?? null,
                protein: currentRecipe.protein ?? null,
                carbohydrates: currentRecipe.carbohydrates ?? null,
                fat: currentRecipe.fat ?? null,
                fiber: currentRecipe.fiber ?? null,
                sugar: currentRecipe.sugar ?? null,
                sodium: currentRecipe.sodium ?? null
            };

            // Map AI field names (snake_case) to database field names (camelCase)
            const fieldMapping = {
                'prep_time': 'prepTime',
                'cook_time': 'cookTime',
                'total_time': 'totalTime',
                'servings': 'servings',
                'difficulty': 'difficulty',
                'cuisine': 'cuisine',
                'description': 'description',
                'calories': 'calories',
                'protein': 'protein',
                'carbohydrates': 'carbohydrates',
                'fat': 'fat',
                'fiber': 'fiber',
                'sugar': 'sugar',
                'sodium': 'sodium'
            };

            // Helper function to convert value to proper type
            const convertValue = (field, value) => {
                // Handle null/undefined/empty string
                if (value === null || value === undefined || value === '') {
                    return null;
                }
                // Convert numeric fields to numbers (preserve 0)
                if (['prepTime', 'cookTime', 'totalTime', 'servings', 'calories', 'protein', 'carbohydrates', 'fat', 'fiber', 'sugar', 'sodium'].includes(field)) {
                    if (typeof value === 'string') {
                        const trimmed = value.trim();
                        if (trimmed === '') return null;
                        const num = parseFloat(trimmed);
                        return isNaN(num) ? null : num;
                    }
                    // Already a number, but ensure it's valid
                    return typeof value === 'number' && !isNaN(value) ? value : null;
                }
                // Convert string fields, handling null
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    return trimmed === '' ? null : trimmed;
                }
                return value;
            };

            // Apply AI changes on top of existing data with field name conversion and type conversion
            aiChanges.forEach(change => {
                const mappedField = fieldMapping[change.field] || change.field;
                updates[mappedField] = convertValue(mappedField, change.newValue);
            });

            // If AI provided updated ingredients or instructions, use them
            if (aiUpdatedRecipe) {
                // Handle ingredients - convert from AI format to database format
                if (aiUpdatedRecipe.ingredients && Array.isArray(aiUpdatedRecipe.ingredients)) {
                    updates.ingredients = aiUpdatedRecipe.ingredients.map(ing => ({
                        ingredient: ing.ingredient || '',
                        quantity: ing.quantity || null,
                        unit: ing.unit || null,
                        section: ing.section || null
                    }));
                }
                
                // Handle instructions - ensure they're strings
                if (aiUpdatedRecipe.instructions && Array.isArray(aiUpdatedRecipe.instructions)) {
                    updates.instructions = aiUpdatedRecipe.instructions.map(inst => 
                        typeof inst === 'string' ? inst : String(inst)
                    );
                }
            }

            await recipeOperations.update(recipeId, updates);
            await loadRecipe();
            setAiUpdateModalVisible(false);
            setAiChanges([]);
            setAiUpdatedRecipe(null);
            Alert.alert('Success', 'Recipe updated with AI improvements!');
        } catch (error) {
            console.error('Error applying AI changes:', error);
            Alert.alert('Error', 'Failed to apply changes: ' + error.message);
        }
    };

    const handleGenerateImage = async () => {
        setGeneratingImage(true);
        setGeneratingImageStatus('Creating image...');
        try {
            setGeneratingImageStatus('Generating with AI...');
            const result = await aiChefService.generateRecipeImage(editedRecipe);
            if (result.success && result.imageUri) {
                setGeneratingImageStatus('Finalizing...');
                // Show success and apply the generated image
                setEditedRecipe({ ...editedRecipe, image_uri: result.imageUri });
                Alert.alert(
                    'Image Generated!',
                    'AI has created a professional photo for your recipe. You can see it above. Save the recipe to keep this image.',
                    [{ text: 'OK' }]
                );
            } else {
                Alert.alert('Error', result.error || 'Failed to generate image. The response format may need adjustment.');
                console.log('Full result:', result);
            }
        } catch (error) {
            console.error('Error generating image:', error);
            Alert.alert('Error', 'Failed to generate image with AI: ' + error.message);
        } finally {
            setGeneratingImage(false);
            setGeneratingImageStatus('');
        }
    };

    if (loading || !recipe) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.primary[500]} />
            </View>
        );
    }

    return (
        <SafeAreaView 
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            edges={['top']}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.content}>
                {/* Header Image */}
                <TouchableOpacity
                    style={[styles.imageContainer, { backgroundColor: theme.primary[100] }]}
                    onPress={isEditing ? handlePickImage : null}
                    disabled={!isEditing}
                >
                    {(isEditing ? editedRecipe.image_uri : recipe.image_uri) ? (
                        <Image
                            source={{ uri: isEditing ? editedRecipe.image_uri : recipe.image_uri }}
                            style={styles.image}
                        />
                    ) : (
                        <Ionicons name="restaurant" size={80} color={theme.primary[300]} />
                    )}
                    {isEditing && (
                        <View style={styles.editImageOverlay}>
                            <Ionicons name="camera" size={24} color="#FFF" />
                            <Text style={styles.editImageText}>Tap to change photo</Text>
                            <TouchableOpacity
                                style={[styles.generateImageButton, { backgroundColor: theme.accent.purple }]}
                                onPress={handleGenerateImage}
                                disabled={generatingImage}
                            >
                                {generatingImage ? (
                                    <>
                                        <ActivityIndicator size="small" color="#FFF" />
                                        <Text style={styles.generateImageText}>
                                            {generatingImageStatus || 'Generating...'}
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="sparkles" size={18} color="#FFF" />
                                        <Text style={styles.generateImageText}>Generate with AI</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </TouchableOpacity>

                <View style={styles.detailsContainer}>
                    {/* Header Actions */}
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => isEditing ? handleSave() : setIsEditing(true)}
                        >
                            <Text style={[styles.actionButtonText, { color: theme.primary[500] }]}>
                                {isEditing ? (saving ? 'Saving...' : 'Save') : 'Edit'}
                            </Text>
                        </TouchableOpacity>
                        {isEditing && (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => {
                                    setIsEditing(false);
                                    setEditedRecipe(JSON.parse(JSON.stringify(recipe)));
                                }}
                            >
                                <Text style={[styles.actionButtonText, { color: theme.colors.error }]}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Title & Description */}
                    {isEditing ? (
                        <>
                            <TextInput
                                style={[styles.editTitle, { color: theme.colors.text.primary, borderBottomColor: theme.colors.border }]}
                                value={editedRecipe.title}
                                onChangeText={(text) => setEditedRecipe({ ...editedRecipe, title: text })}
                                placeholder="Recipe Title"
                            />
                            <TextInput
                                style={[styles.editDescription, { color: theme.colors.text.secondary, borderBottomColor: theme.colors.border }]}
                                value={editedRecipe.description}
                                onChangeText={(text) => setEditedRecipe({ ...editedRecipe, description: text })}
                                placeholder="Description"
                                multiline
                            />
                        </>
                    ) : (
                        <>
                            <Text style={[styles.title, { color: theme.colors.text.primary }]}>
                                {recipe.title}
                            </Text>
                            {recipe.description && (
                                <Text style={[styles.description, { color: theme.colors.text.secondary }]}>
                                    {recipe.description}
                                </Text>
                            )}
                        </>
                    )}

                    {/* Action Buttons (View Mode Only) */}
                    {!isEditing && (
                        <View style={styles.quickActions}>
                            <TouchableOpacity style={[styles.quickActionButton, { backgroundColor: theme.primary[100] }]} onPress={() => setScheduleModalVisible(true)}>
                                <Ionicons name="calendar-outline" size={20} color={theme.primary[700]} />
                                <Text style={[styles.quickActionText, { color: theme.primary[700] }]}>Schedule</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.quickActionButton, { backgroundColor: theme.colors.success + '20' }]} onPress={addToGroceryList}>
                                <Ionicons name="cart-outline" size={20} color={theme.colors.success} />
                                <Text style={[styles.quickActionText, { color: theme.colors.success }]}>Add to List</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.quickActionButton, 
                                    recipe?.is_cooked === 1
                                        ? { backgroundColor: theme.colors.success + '20' } 
                                        : { backgroundColor: theme.accent.green + '20' }
                                ]}
                                onPress={handleMarkAsCooked}
                            >
                                <Ionicons 
                                    name={recipe?.is_cooked === 1 ? "checkmark-circle" : "checkmark-circle-outline"} 
                                    size={20} 
                                    color={recipe?.is_cooked === 1 ? theme.colors.success : theme.accent.green} 
                                />
                                <Text style={[
                                    styles.quickActionText, 
                                    { color: recipe?.is_cooked === 1 ? theme.colors.success : theme.accent.green }
                                ]}>
                                    {recipe?.is_cooked === 1 ? 'Cooked ✓' : 'Mark as Cooked'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.quickActionButton, { backgroundColor: theme.accent.purple + '20' }]}
                                onPress={handleAIUpdate}
                                disabled={updatingWithAI}
                            >
                                {updatingWithAI ? (
                                    <>
                                        <ActivityIndicator size="small" color={theme.accent.purple} />
                                        <Text style={[styles.quickActionText, { color: theme.accent.purple }]}>
                                            {updatingStatus || 'Updating...'}
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="sparkles" size={20} color={theme.accent.purple} />
                                        <Text style={[styles.quickActionText, { color: theme.accent.purple }]}>Update with AI</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Meta Info */}
                    <View style={styles.metaContainer}>
                        <View style={styles.metaItem}>
                            <Ionicons name="time-outline" size={20} color={theme.colors.text.secondary} />
                            {isEditing ? (
                                <TextInput
                                    style={[styles.editMeta, { color: theme.colors.text.primary }]}
                                    value={String(editedRecipe.total_time || '')}
                                    onChangeText={(text) => setEditedRecipe({ ...editedRecipe, total_time: text })}
                                    placeholder="Min"
                                    keyboardType="numeric"
                                />
                            ) : (
                                <Text style={[styles.metaText, { color: theme.colors.text.secondary }]}>
                                    {recipe.total_time || '--'} min
                                </Text>
                            )}
                        </View>
                        <View style={styles.metaItem}>
                            <Ionicons name="people-outline" size={20} color={theme.colors.text.secondary} />
                            {isEditing ? (
                                <TextInput
                                    style={[styles.editMeta, { color: theme.colors.text.primary }]}
                                    value={String(editedRecipe.servings || '')}
                                    onChangeText={(text) => setEditedRecipe({ ...editedRecipe, servings: text })}
                                    placeholder="Servings"
                                    keyboardType="numeric"
                                />
                            ) : (
                                <Text style={[styles.metaText, { color: theme.colors.text.secondary }]}>
                                    {recipe.servings || '--'} servings
                                </Text>
                            )}
                        </View>
                        <View style={styles.metaItem}>
                            <Ionicons name="bar-chart-outline" size={20} color={theme.colors.text.secondary} />
                            {isEditing ? (
                                <TextInput
                                    style={[styles.editMeta, { color: theme.colors.text.primary }]}
                                    value={editedRecipe.difficulty || ''}
                                    onChangeText={(text) => setEditedRecipe({ ...editedRecipe, difficulty: text })}
                                    placeholder="Difficulty"
                                />
                            ) : (
                                <Text style={[styles.metaText, { color: theme.colors.text.secondary }]}>
                                    {recipe.difficulty || 'Medium'}
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* Nutritional Information */}
                    {(recipe.calories != null || recipe.protein != null || recipe.carbohydrates != null || recipe.fat != null || recipe.fiber != null || recipe.sugar != null || recipe.sodium != null) ? (
                        <>
                            <View style={styles.sectionHeader}>
                                <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Nutritional Information</Text>
                                <Text style={[styles.sectionSubtitle, { color: theme.colors.text.secondary }]}>
                                    Per serving
                                </Text>
                            </View>
                            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                                <View style={styles.nutritionGrid}>
                                    {recipe.calories != null && (
                                        <View style={styles.nutritionItem}>
                                            <Text style={[styles.nutritionValue, { color: theme.colors.text.primary }]}>
                                                {Math.round(recipe.calories)}
                                            </Text>
                                            <Text style={[styles.nutritionLabel, { color: theme.colors.text.secondary }]}>
                                                Calories
                                            </Text>
                                        </View>
                                    )}
                                    {recipe.protein != null && (
                                        <View style={styles.nutritionItem}>
                                            <Text style={[styles.nutritionValue, { color: theme.colors.text.primary }]}>
                                                {Math.round(recipe.protein)}g
                                            </Text>
                                            <Text style={[styles.nutritionLabel, { color: theme.colors.text.secondary }]}>
                                                Protein
                                            </Text>
                                        </View>
                                    )}
                                    {recipe.carbohydrates != null && (
                                        <View style={styles.nutritionItem}>
                                            <Text style={[styles.nutritionValue, { color: theme.colors.text.primary }]}>
                                                {Math.round(recipe.carbohydrates)}g
                                            </Text>
                                            <Text style={[styles.nutritionLabel, { color: theme.colors.text.secondary }]}>
                                                Carbs
                                            </Text>
                                        </View>
                                    )}
                                    {recipe.fat != null && (
                                        <View style={styles.nutritionItem}>
                                            <Text style={[styles.nutritionValue, { color: theme.colors.text.primary }]}>
                                                {Math.round(recipe.fat)}g
                                            </Text>
                                            <Text style={[styles.nutritionLabel, { color: theme.colors.text.secondary }]}>
                                                Fat
                                            </Text>
                                        </View>
                                    )}
                                    {recipe.fiber != null && (
                                        <View style={styles.nutritionItem}>
                                            <Text style={[styles.nutritionValue, { color: theme.colors.text.primary }]}>
                                                {Math.round(recipe.fiber)}g
                                            </Text>
                                            <Text style={[styles.nutritionLabel, { color: theme.colors.text.secondary }]}>
                                                Fiber
                                            </Text>
                                        </View>
                                    )}
                                    {recipe.sugar != null && (
                                        <View style={styles.nutritionItem}>
                                            <Text style={[styles.nutritionValue, { color: theme.colors.text.primary }]}>
                                                {Math.round(recipe.sugar)}g
                                            </Text>
                                            <Text style={[styles.nutritionLabel, { color: theme.colors.text.secondary }]}>
                                                Sugar
                                            </Text>
                                        </View>
                                    )}
                                    {recipe.sodium != null && (
                                        <View style={styles.nutritionItem}>
                                            <Text style={[styles.nutritionValue, { color: theme.colors.text.primary }]}>
                                                {Math.round(recipe.sodium)}mg
                                            </Text>
                                            <Text style={[styles.nutritionLabel, { color: theme.colors.text.secondary }]}>
                                                Sodium
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </>
                    ) : (
                        !isEditing && (
                            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                                <View style={styles.nutritionPlaceholder}>
                                    <Ionicons name="nutrition-outline" size={32} color={theme.colors.text.tertiary} />
                                    <Text style={[styles.nutritionPlaceholderText, { color: theme.colors.text.secondary }]}>
                                        Nutritional information not available
                                    </Text>
                                    <Text style={[styles.nutritionPlaceholderHint, { color: theme.colors.text.tertiary }]}>
                                        Use "Update with AI" to generate nutritional info
                                    </Text>
                                </View>
                            </View>
                        )
                    )}

                    {/* Ingredients */}
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Ingredients</Text>
                        {isEditing && (
                            <TouchableOpacity onPress={() => {
                                const newIngs = [...editedRecipe.ingredients, { ingredient: '', quantity: '', unit: '' }];
                                setEditedRecipe({ ...editedRecipe, ingredients: newIngs });
                            }}>
                                <Ionicons name="add-circle" size={24} color={theme.primary[500]} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        {(isEditing ? editedRecipe.ingredients : recipe.ingredients).map((item, index) => (
                            <View key={index} style={[styles.ingredientRow, { borderBottomColor: theme.colors.border, borderBottomWidth: index === (isEditing ? editedRecipe.ingredients : recipe.ingredients).length - 1 ? 0 : 1 }]}>
                                {isEditing ? (
                                    <View style={styles.editIngredientRow}>
                                        <TextInput
                                            style={[styles.editIngQty, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                                            value={item.quantity}
                                            onChangeText={(text) => updateIngredient(index, 'quantity', text)}
                                            placeholder="Qty"
                                        />
                                        <TextInput
                                            style={[styles.editIngUnit, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                                            value={item.unit}
                                            onChangeText={(text) => updateIngredient(index, 'unit', text)}
                                            placeholder="Unit"
                                        />
                                        <TextInput
                                            style={[styles.editIngName, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                                            value={item.ingredient}
                                            onChangeText={(text) => updateIngredient(index, 'ingredient', text)}
                                            placeholder="Ingredient"
                                        />
                                        <TouchableOpacity onPress={() => {
                                            const newIngs = editedRecipe.ingredients.filter((_, i) => i !== index);
                                            setEditedRecipe({ ...editedRecipe, ingredients: newIngs });
                                        }}>
                                            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <Text style={[styles.ingredientText, { color: theme.colors.text.primary }]}>
                                        • {item.quantity} {item.unit} {item.ingredient}
                                    </Text>
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Instructions */}
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Instructions</Text>
                        {isEditing && (
                            <TouchableOpacity onPress={() => {
                                const newInst = [...editedRecipe.instructions, ''];
                                setEditedRecipe({ ...editedRecipe, instructions: newInst });
                            }}>
                                <Ionicons name="add-circle" size={24} color={theme.primary[500]} />
                            </TouchableOpacity>
                        )}
                    </View>
                    {isEditing && editedRecipe.instructions.length === 0 && (
                        <TouchableOpacity
                            style={[styles.generateButton, { backgroundColor: theme.primary[100] }]}
                            onPress={handleGenerateInstructions}
                            disabled={generating}
                        >
                            {generating ? (
                                <>
                                    <ActivityIndicator size="small" color={theme.primary[700]} />
                                    <Text style={[styles.generateButtonText, { color: theme.primary[700] }]}>
                                        {generatingInstructionsStatus || 'Generating...'}
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Ionicons name="sparkles" size={20} color={theme.primary[700]} />
                                    <Text style={[styles.generateButtonText, { color: theme.primary[700] }]}>
                                        Generate with AI
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}
                    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        {(isEditing ? editedRecipe.instructions : recipe.instructions).map((step, index) => (
                            <View key={index} style={[styles.instructionRow, { borderBottomColor: theme.colors.border, borderBottomWidth: index === (isEditing ? editedRecipe.instructions : recipe.instructions).length - 1 ? 0 : 1 }]}>
                                <View style={[styles.stepNumber, { backgroundColor: theme.primary[100] }]}>
                                    <Text style={[styles.stepNumberText, { color: theme.primary[700] }]}>{index + 1}</Text>
                                </View>
                                {isEditing ? (
                                    <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                                        <TextInput
                                            style={[styles.editInstruction, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                                            value={step}
                                            onChangeText={(text) => updateInstruction(index, text)}
                                            multiline
                                            placeholder="Step instruction"
                                        />
                                        <TouchableOpacity onPress={() => {
                                            const newInst = editedRecipe.instructions.filter((_, i) => i !== index);
                                            setEditedRecipe({ ...editedRecipe, instructions: newInst });
                                        }}>
                                            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <Text style={[styles.instructionText, { color: theme.colors.text.primary }]}>
                                        {step}
                                    </Text>
                                )}
                            </View>
                        ))}
                    </View>

                    {/* Delete Button (Only in Edit Mode or always visible at bottom) */}
                    <TouchableOpacity
                        style={[styles.deleteButton, { borderColor: theme.colors.error }]}
                        onPress={handleDelete}
                    >
                        <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                        <Text style={[styles.deleteButtonText, { color: theme.colors.error }]}>Delete Recipe</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Schedule Modal */}
            <Modal
                visible={scheduleModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setScheduleModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Schedule Meal</Text>
                        <Text style={[styles.modalSubtitle, { color: theme.colors.text.secondary }]}>Add to today's schedule?</Text>

                        <View style={styles.mealTypeContainer}>
                            {['breakfast', 'lunch', 'dinner'].map((type) => (
                                <TouchableOpacity
                                    key={type}
                                    style={[
                                        styles.mealTypeButton,
                                        selectedMealType === type && { backgroundColor: theme.primary[100], borderColor: theme.primary[500] },
                                        { borderColor: theme.colors.border }
                                    ]}
                                    onPress={() => setSelectedMealType(type)}
                                >
                                    <Text style={[
                                        styles.mealTypeText,
                                        selectedMealType === type && { color: theme.primary[700], fontWeight: 'bold' },
                                        { color: theme.colors.text.secondary }
                                    ]}>
                                        {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.colors.border }]}
                                onPress={() => setScheduleModalVisible(false)}
                            >
                                <Text style={styles.modalButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.primary[500] }]}
                                onPress={addToSchedule}
                            >
                                <Text style={[styles.modalButtonText, { color: '#FFF' }]}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Custom Instructions Modal */}
            <Modal
                visible={customInstructionsModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => {
                    setCustomInstructionsModalVisible(false);
                    setCustomInstructions('');
                }}
            >
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                    >
                        <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <Ionicons name="sparkles" size={24} color={theme.accent.purple} />
                                    <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>
                                        Custom Instructions
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => {
                                    setCustomInstructionsModalVisible(false);
                                    setCustomInstructions('');
                                }}>
                                    <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.modalBody}>
                                <Text style={[styles.modalLabel, { color: theme.colors.text.secondary }]}>
                                    Optional: Tell the AI how you'd like to modify this recipe
                                </Text>
                                <TextInput
                                    style={[styles.modalTextArea, {
                                        backgroundColor: theme.colors.background,
                                        color: theme.colors.text.primary,
                                        borderColor: theme.colors.border
                                    }]}
                                    value={customInstructions}
                                    onChangeText={setCustomInstructions}
                                    placeholder="e.g., Make it vegetarian, reduce calories, add more spice, use less salt, etc."
                                    placeholderTextColor={theme.colors.text.tertiary}
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                />
                                <Text style={[styles.modalHint, { color: theme.colors.text.tertiary }]}>
                                    Leave blank to let AI automatically enhance the recipe
                                </Text>
                            </View>

                            <View style={[styles.modalActions, { borderTopColor: theme.colors.border }]}>
                                <TouchableOpacity
                                    style={[styles.modalCancelButton, { borderColor: theme.colors.border }]}
                                    onPress={() => {
                                        setCustomInstructionsModalVisible(false);
                                        setCustomInstructions('');
                                    }}
                                >
                                    <Text style={[styles.modalCancelText, { color: theme.colors.text.secondary }]}>
                                        Cancel
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalSubmitButton, { backgroundColor: theme.accent.purple }]}
                                    onPress={handleAIUpdateWithInstructions}
                                    disabled={updatingWithAI}
                                >
                                    {updatingWithAI ? (
                                        <>
                                            <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
                                            <Text style={styles.modalSubmitText}>
                                                {updatingStatus || 'Processing...'}
                                            </Text>
                                        </>
                                    ) : (
                                        <Text style={styles.modalSubmitText}>Enhance Recipe</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* AI Update Report Modal */}
            <Modal
                visible={aiUpdateModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setAiUpdateModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.aiModalContent, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.aiModalHeader}>
                            <Ionicons name="sparkles" size={28} color={theme.accent.purple} />
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>AI Recipe Enhancement</Text>
                        </View>
                        <Text style={[styles.aiModalSubtitle, { color: theme.colors.text.secondary }]}>
                            The AI analyzed your recipe and suggests the following improvements:
                        </Text>

                        {(aiUpdatedRecipe && (aiUpdatedRecipe.ingredients || aiUpdatedRecipe.instructions)) && (
                            <View style={[styles.aiInfoBox, { backgroundColor: theme.primary[50], borderColor: theme.primary[200] }]}>
                                <Ionicons name="information-circle" size={18} color={theme.primary[700]} />
                                <Text style={[styles.aiInfoText, { color: theme.primary[700] }]}>
                                    {aiUpdatedRecipe.ingredients && aiUpdatedRecipe.instructions 
                                        ? 'Ingredients and instructions have been updated'
                                        : aiUpdatedRecipe.ingredients 
                                        ? 'Ingredients have been updated'
                                        : 'Instructions have been updated'}
                                </Text>
                            </View>
                        )}

                        <ScrollView style={styles.changesContainer}>
                            {aiChanges.map((change, index) => (
                                <View key={index} style={[styles.changeItem, { borderColor: theme.colors.border }]}>
                                    <Text style={[styles.changeField, { color: theme.accent.purple }]}>
                                        {change.field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </Text>
                                    <View style={styles.changeValues}>
                                        <View style={styles.valueContainer}>
                                            <Text style={[styles.valueLabel, { color: theme.colors.text.tertiary }]}>Before:</Text>
                                            <Text style={[styles.valueText, { color: theme.colors.text.secondary }]}>
                                                {change.oldValue || 'Not set'}
                                            </Text>
                                        </View>
                                        <Ionicons name="arrow-forward" size={16} color={theme.colors.text.tertiary} />
                                        <View style={styles.valueContainer}>
                                            <Text style={[styles.valueLabel, { color: theme.colors.text.tertiary }]}>After:</Text>
                                            <Text style={[styles.valueText, { color: theme.primary[500], fontWeight: 'bold' }]}>
                                                {change.newValue}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={[styles.reasonContainer, { backgroundColor: theme.primary[50] }]}>
                                        <Ionicons name="information-circle" size={14} color={theme.primary[500]} />
                                        <Text style={[styles.reasonText, { color: theme.primary[700] }]}>
                                            {change.reason}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.colors.border }]}
                                onPress={() => {
                                    setAiUpdateModalVisible(false);
                                    setAiChanges([]);
                                    setAiUpdatedRecipe(null);
                                }}
                            >
                                <Text style={styles.modalButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.accent.purple }]}
                                onPress={applyAIChanges}
                            >
                                <Text style={[styles.modalButtonText, { color: '#FFF' }]}>Apply Changes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        paddingBottom: 40,
    },
    imageContainer: {
        height: 250,
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    editImageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    editImageText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
    },
    generateImageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 12,
        gap: 6,
    },
    generateImageText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '600',
    },
    detailsContainer: {
        padding: 20,
        marginTop: -20,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: 'inherit',
    },
    headerActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 10,
        gap: 16,
    },
    actionButton: {
        padding: 8,
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    editTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
        borderBottomWidth: 1,
        paddingBottom: 4,
    },
    description: {
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 24,
        fontStyle: 'italic',
    },
    editDescription: {
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 24,
        borderBottomWidth: 1,
        paddingBottom: 4,
        minHeight: 60,
    },
    quickActions: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 24,
        flexWrap: 'wrap',
    },
    quickActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 6,
    },
    quickActionText: {
        fontWeight: '600',
        fontSize: 13,
    },
    metaContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 24,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#E5E7EB',
    },
    metaItem: {
        alignItems: 'center',
        gap: 4,
        minWidth: 80,
    },
    metaText: {
        fontSize: 14,
        fontWeight: '500',
    },
    editMeta: {
        fontSize: 14,
        fontWeight: '500',
        borderBottomWidth: 1,
        borderColor: '#ccc',
        textAlign: 'center',
        minWidth: 60,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    sectionSubtitle: {
        fontSize: 14,
        fontStyle: 'italic',
    },
    nutritionGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        justifyContent: 'space-around',
    },
    nutritionItem: {
        alignItems: 'center',
        minWidth: 80,
        paddingVertical: 8,
    },
    nutritionValue: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    nutritionLabel: {
        fontSize: 12,
        textTransform: 'uppercase',
    },
    nutritionPlaceholder: {
        alignItems: 'center',
        paddingVertical: 24,
        gap: 8,
    },
    nutritionPlaceholderText: {
        fontSize: 16,
        fontWeight: '500',
    },
    nutritionPlaceholderHint: {
        fontSize: 13,
        fontStyle: 'italic',
    },
    card: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
    },
    ingredientRow: {
        paddingVertical: 12,
    },
    editIngredientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    editIngQty: {
        width: 50,
        borderBottomWidth: 1,
        padding: 4,
    },
    editIngUnit: {
        width: 60,
        borderBottomWidth: 1,
        padding: 4,
    },
    editIngName: {
        flex: 1,
        borderBottomWidth: 1,
        padding: 4,
    },
    ingredientText: {
        fontSize: 16,
    },
    instructionRow: {
        flexDirection: 'row',
        paddingVertical: 16,
        gap: 16,
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepNumberText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    instructionText: {
        flex: 1,
        fontSize: 16,
        lineHeight: 24,
    },
    editInstruction: {
        flex: 1,
        fontSize: 16,
        borderWidth: 1,
        borderRadius: 8,
        padding: 8,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginTop: 20,
        gap: 8,
    },
    deleteButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        borderRadius: 16,
        padding: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    modalBody: {
        padding: 20,
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    modalTextArea: {
        minHeight: 100,
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        fontSize: 16,
        marginBottom: 8,
    },
    modalHint: {
        fontSize: 12,
        marginTop: 4,
        fontStyle: 'italic',
    },
    modalCancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    modalCancelText: {
        fontSize: 16,
        fontWeight: '600',
    },
    modalSubmitButton: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    modalSubmitText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalSubtitle: {
        fontSize: 16,
        marginBottom: 24,
    },
    mealTypeContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 24,
    },
    mealTypeButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    mealTypeText: {
        fontSize: 14,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 16,
        width: '100%',
    },
    modalButton: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    generateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
        gap: 8,
    },
    generateButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    aiModalContent: {
        width: '90%',
        maxHeight: '80%',
        borderRadius: 16,
        padding: 24,
    },
    aiModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    aiModalSubtitle: {
        fontSize: 14,
        marginBottom: 20,
    },
    changesContainer: {
        maxHeight: 400,
        marginBottom: 20,
    },
    changeItem: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    changeField: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    changeValues: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 12,
    },
    valueContainer: {
        flex: 1,
    },
    valueLabel: {
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    valueText: {
        fontSize: 14,
    },
    reasonContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 10,
        borderRadius: 8,
        gap: 6,
    },
    reasonText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
    },
    aiInfoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 16,
        gap: 8,
    },
    aiInfoText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
    },
});

export default RecipeDetailScreen;
