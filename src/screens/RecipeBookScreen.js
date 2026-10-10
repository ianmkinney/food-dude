import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    Alert,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { recipeOperations } from '../database/operations';
import ElevatedCard from '../components/ElevatedCard';
import AnimatedPressable from '../components/AnimatedPressable';
import FloatingActionButton from '../components/FloatingActionButton';
import EmptyState from '../components/EmptyState';
import { navigateWithTransition } from '../motion/viewTransition';
import { ASSISTANT_NAME } from '../config/assistant';

const RecipeCard = ({ item, index, theme, navigation }) => {
    const thumbRef = useRef(null);
    const cooked = item.is_cooked === 1 || item.is_cooked === true;
    return (
        <ElevatedCard
            theme={theme}
            index={index}
            style={[styles.recipeCard, cooked && { opacity: 0.72 }]}
            onPress={() => navigateWithTransition(
                () => navigation.navigate('RecipeDetail', { recipeId: item.id }),
                { sourceRef: thumbRef, name: 'recipe-hero' },
            )}
        >
            <View style={styles.recipeCardContent}>
                <View ref={thumbRef} style={styles.thumb}>
                    {item.image_uri ? (
                        <Image source={{ uri: item.image_uri }} style={styles.recipeImage} />
                    ) : (
                        <View style={[styles.placeholderImage, { backgroundColor: theme.primary[100] }]}>
                            <Ionicons name="restaurant" size={32} color={theme.primary[500]} />
                        </View>
                    )}
                </View>
                <View style={styles.recipeInfo}>
                    <View style={styles.recipeTitleRow}>
                        <Text style={[styles.recipeTitle, { color: theme.colors.text.primary }]} numberOfLines={2}>
                            {item.title}
                        </Text>
                        {cooked && <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />}
                    </View>
                    {!!item.description && (
                        <Text style={[styles.recipeDescription, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                            {item.description}
                        </Text>
                    )}
                    <View style={styles.recipeMeta}>
                        {!!item.total_time && (
                            <View style={styles.metaItem}>
                                <Ionicons name="time-outline" size={14} color={theme.colors.text.tertiary} />
                                <Text style={[styles.metaText, { color: theme.colors.text.tertiary }]}>
                                    {item.total_time} min
                                </Text>
                            </View>
                        )}
                        {!!item.difficulty && (
                            <View style={styles.metaItem}>
                                <Ionicons name="bar-chart-outline" size={14} color={theme.colors.text.tertiary} />
                                <Text style={[styles.metaText, { color: theme.colors.text.tertiary }]}>
                                    {item.difficulty}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </ElevatedCard>
    );
};

const RecipeBookScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [recipes, setRecipes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'cooked', 'uncooked'

    // Header customization removed as per user request
    useFocusEffect(
        useCallback(() => {
            loadRecipes();
        }, [filter])
    );

    const loadRecipes = async () => {
        try {
            setLoading(true);
            const filters = {};
            if (filter === 'cooked') {
                filters.isCooked = true;
            } else if (filter === 'uncooked') {
                filters.isCooked = false;
            }
            const allRecipes = await recipeOperations.getAll(filters);
            setRecipes(allRecipes);
        } catch (error) {
            console.error('Error loading recipes:', error);
            Alert.alert('Error', 'Failed to load recipes');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (query) => {
        setSearchQuery(query);
        if (query.trim() === '') {
            loadRecipes();
        } else {
            try {
                const results = await recipeOperations.search(query);
                // Apply filter to search results
                let filteredResults = results;
                if (filter === 'cooked') {
                    filteredResults = results.filter(r => r.is_cooked === 1 || r.is_cooked === true);
                } else if (filter === 'uncooked') {
                    filteredResults = results.filter(r => !r.is_cooked || r.is_cooked === 0 || r.is_cooked === false);
                }
                setRecipes(filteredResults);
            } catch (error) {
                console.error('Error searching recipes:', error);
            }
        }
    };

    const isEmptyLibrary = !loading && recipes.length === 0 && searchQuery.trim() === '' && filter === 'all';

    const addSampleRecipes = async () => {
        try {
            setLoading(true);
            const samples = [
                {
                    title: 'Weeknight Tomato Pasta',
                    description: 'Garlic, olive oil, and canned tomatoes in twenty minutes.',
                    totalTime: 25,
                    difficulty: 'easy',
                    ingredients: [{ ingredient: 'spaghetti', amount: '12', unit: 'oz' }, { ingredient: 'canned tomatoes', amount: '1', unit: 'can' }],
                    instructions: ['Boil pasta.', 'Simmer tomatoes with garlic and olive oil.', 'Toss and serve.'],
                },
                {
                    title: 'Sheet-Pan Lemon Chicken',
                    description: 'Crispy chicken with potatoes and green beans.',
                    totalTime: 45,
                    difficulty: 'medium',
                    ingredients: [{ ingredient: 'chicken thighs', amount: '4', unit: '' }, { ingredient: 'potatoes', amount: '1', unit: 'lb' }],
                    instructions: ['Roast at 425°F until chicken hits 165°F internal.'],
                },
            ];
            for (const recipe of samples) {
                await recipeOperations.create(recipe);
            }
            await loadRecipes();
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Could not add sample recipes');
        }
    };

    const recipeKey = useCallback((item) => item.id.toString(), []);

    const renderRecipeCard = useCallback(({ item, index }) => (
        <RecipeCard item={item} index={index} theme={theme} navigation={navigation} />
    ), [navigation, theme]);

    const renderEmptyState = () => (
        <EmptyState
            title="No recipes yet"
            description={`Ask ${ASSISTANT_NAME} for an idea or start with a couple of samples.`}
            actionLabel={`Ask ${ASSISTANT_NAME} for a recipe`}
            onAction={() => navigation.navigate(ASSISTANT_NAME)}
            secondaryLabel="Add sample recipes"
            onSecondary={addSampleRecipes}
        />
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {!isEmptyLibrary && (
            <View style={[styles.filterContainer, { backgroundColor: theme.colors.surfaceGlass, borderBottomColor: theme.colors.borderSoft }]}>
                <AnimatedPressable
                    style={[
                        styles.filterButton,
                        filter === 'all' && { backgroundColor: theme.primary[100] },
                        { borderColor: theme.colors.border }
                    ]}
                    onPress={() => setFilter('all')}
                >
                    <Text style={[
                        styles.filterButtonText,
                        { color: filter === 'all' ? theme.primary[700] : theme.colors.text.secondary }
                    ]}>
                        All
                    </Text>
                </AnimatedPressable>
                <AnimatedPressable
                    style={[
                        styles.filterButton,
                        filter === 'cooked' && { backgroundColor: theme.colors.success + '20' },
                        { borderColor: theme.colors.border }
                    ]}
                    onPress={() => setFilter('cooked')}
                >
                    <Ionicons 
                        name="checkmark-circle" 
                        size={16} 
                        color={filter === 'cooked' ? theme.colors.success : theme.colors.text.tertiary} 
                    />
                    <Text style={[
                        styles.filterButtonText,
                        { color: filter === 'cooked' ? theme.colors.success : theme.colors.text.secondary }
                    ]}>
                        Cooked
                    </Text>
                </AnimatedPressable>
                <AnimatedPressable
                    style={[
                        styles.filterButton,
                        filter === 'uncooked' && { backgroundColor: theme.accent.green + '20' },
                        { borderColor: theme.colors.border }
                    ]}
                    onPress={() => setFilter('uncooked')}
                >
                    <Ionicons 
                        name="ellipse-outline" 
                        size={16} 
                        color={filter === 'uncooked' ? theme.accent.green : theme.colors.text.tertiary} 
                    />
                    <Text style={[
                        styles.filterButtonText,
                        { color: filter === 'uncooked' ? theme.accent.green : theme.colors.text.secondary }
                    ]}>
                        Uncooked
                    </Text>
                </AnimatedPressable>
            </View>
            )}

            {!isEmptyLibrary && (
            <View style={[styles.searchContainer, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }, theme.shadows.sm]}>
                <Ionicons name="search" size={20} color={theme.colors.text.tertiary} />
                <TextInput accessibilityLabel="Search recipes"
                    style={[styles.searchInput, { color: theme.colors.text.primary }]}
                    placeholder="Search recipes..."
                    placeholderTextColor={theme.colors.text.tertiary}
                    value={searchQuery}
                    onChangeText={handleSearch}
                />
            </View>
            )}

            {/* Recipe List */}
            <FlatList
                data={recipes}
                renderItem={renderRecipeCard}
                keyExtractor={recipeKey}
                initialNumToRender={8}
                maxToRenderPerBatch={6}
                windowSize={7}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={!loading && renderEmptyState()}
                refreshing={loading}
                onRefresh={loadRecipes}
            />

            <FloatingActionButton
                theme={theme}
                style={styles.fab}
                accessibilityLabel="Add recipe"
                onPress={() => navigation.navigate('AddRecipe')}
                morphTo="af-sheet"
            >
                <Ionicons name="add" size={28} color="#FFFFFF" />
            </FloatingActionButton>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        gap: 8,
    },
    filterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        gap: 6,
    },
    filterButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 18,
        borderWidth: 1,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
    },
    listContent: {
        padding: 16,
        paddingTop: 0,
    },
    recipeCard: {
        padding: 16,
        marginBottom: 14,
    },
    recipeCardContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    recipeInfo: {
        flex: 1,
        marginLeft: 16,
    },
    recipeTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
        gap: 8,
    },
    recipeTitle: {
        fontSize: 18,
        fontWeight: '600',
        flex: 1,
    },
    recipeDescription: {
        fontSize: 14,
        marginBottom: 8,
    },
    recipeMeta: {
        flexDirection: 'row',
        gap: 12,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 12,
        textTransform: 'capitalize',
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
    },
    thumb: {
        width: 80,
        height: 80,
        borderRadius: 12,
        overflow: 'hidden',
    },
    recipeImage: {
        width: 80,
        height: 80,
        borderRadius: 12,
        backgroundColor: '#f0f0f0',
    },
    placeholderImage: {
        width: 80,
        height: 80,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default RecipeBookScreen;
