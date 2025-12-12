import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    Alert,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { recipeOperations } from '../database/operations';

const RecipeBookScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [recipes, setRecipes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'cooked', 'uncooked'

    // Header customization removed as per user request
    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: null,
        });
    }, [navigation]);

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

    const renderRecipeCard = ({ item }) => (
        <TouchableOpacity
            style={[
                styles.recipeCard, 
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                (item.is_cooked === 1 || item.is_cooked === true) && { opacity: 0.7 }
            ]}
            onPress={() => {
                navigation.navigate('RecipeDetail', { recipeId: item.id });
            }}
        >
            <View style={styles.recipeCardContent}>
                {item.image_uri ? (
                    <Image source={{ uri: item.image_uri }} style={styles.recipeImage} />
                ) : (
                    <View style={[styles.placeholderImage, { backgroundColor: theme.primary[100] }]}>
                        <Ionicons name="restaurant" size={32} color={theme.primary[500]} />
                    </View>
                )}
                <View style={styles.recipeInfo}>
                    <View style={styles.recipeTitleRow}>
                        <Text style={[styles.recipeTitle, { color: theme.colors.text.primary }]} numberOfLines={2}>
                            {item.title}
                        </Text>
                        {(item.is_cooked === 1 || item.is_cooked === true) && (
                            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                        )}
                    </View>
                    {item.description && (
                        <Text style={[styles.recipeDescription, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                            {item.description}
                        </Text>
                    )}
                    <View style={styles.recipeMeta}>
                        {item.total_time && (
                            <View style={styles.metaItem}>
                                <Ionicons name="time-outline" size={14} color={theme.colors.text.tertiary} />
                                <Text style={[styles.metaText, { color: theme.colors.text.tertiary }]}>
                                    {item.total_time} min
                                </Text>
                            </View>
                        )}
                        {item.difficulty && (
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
        </TouchableOpacity>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={80} color={theme.colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text.primary }]}>
                No Recipes Yet
            </Text>
            <Text style={[styles.emptyDescription, { color: theme.colors.text.secondary }]}>
                Add your first recipe by tapping the + button
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Filter Buttons */}
            <View style={[styles.filterContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                <TouchableOpacity
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
                </TouchableOpacity>
                <TouchableOpacity
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
                </TouchableOpacity>
                <TouchableOpacity
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
                </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <Ionicons name="search" size={20} color={theme.colors.text.tertiary} />
                <TextInput
                    style={[styles.searchInput, { color: theme.colors.text.primary }]}
                    placeholder="Search recipes..."
                    placeholderTextColor={theme.colors.text.tertiary}
                    value={searchQuery}
                    onChangeText={handleSearch}
                />
            </View>

            {/* Recipe List */}
            <FlatList
                data={recipes}
                renderItem={renderRecipeCard}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={!loading && renderEmptyState()}
                refreshing={loading}
                onRefresh={loadRecipes}
            />

            {/* Add Recipe Button */}
            <TouchableOpacity
                style={[styles.fab, { backgroundColor: theme.primary[500] }]}
                onPress={() => navigation.navigate('AddRecipe')}
            >
                <Ionicons name="add" size={28} color="#FFFFFF" />
            </TouchableOpacity>
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
        borderRadius: 12,
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
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
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
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
    },
    emptyTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyDescription: {
        fontSize: 16,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    recipeImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
    },
    placeholderImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

export default RecipeBookScreen;
