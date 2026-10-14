import React, { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ScrollView,
    TextInput,
    Alert,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSyncDataRefresh } from '../hooks/useSyncDataRefresh';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { recipeOperations } from '../database/operations';
import { useActiveEnhanceRecipeIds } from '../hooks/useRecipeEnhanceStatus';
import ElevatedCard from '../components/ElevatedCard';
import AnimatedPressable from '../components/AnimatedPressable';
import FabCluster from '../components/FabCluster';
import EmptyState from '../components/EmptyState';
import { navigateWithTransition } from '../motion/viewTransition';
import { ASSISTANT_NAME } from '../config/assistant';
import { useLayoutMode } from '../layout/useLayoutMode';
import { useFloatingActionLayout } from '../layout/floatingActionLayout';
import { desktopPageStyles, desktopRecipeStyles } from '../components/layout/desktopTheme';
import DesktopPageHeader from '../components/layout/DesktopPageHeader';
import RecipeBookDesktopGrid from './RecipeBookDesktopGrid';
import CoverImage from '../components/CoverImage';
import ImageLightbox from '../components/ImageLightbox';

const safeRecipeText = (value) => {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
};

const RecipeCard = ({ item, index, theme, navigation, layout = 'horizontal', enhancing = false, onImagePress }) => {
    const thumbRef = useRef(null);
    const cooked = item.is_cooked === 1 || item.is_cooked === true;
    const vertical = layout === 'vertical';
    return (
        <ElevatedCard
            theme={theme}
            index={index}
            wrapperStyle={vertical ? desktopRecipeStyles.gridItemWrap : undefined}
            style={[
                styles.recipeCard,
                vertical && desktopRecipeStyles.gridCard,
                cooked && { opacity: 0.72 },
            ]}
            onPress={() => navigateWithTransition(
                () => navigation.navigate('RecipeDetail', { recipeId: item.id }),
                { sourceRef: thumbRef, name: 'recipe-hero' },
            )}
        >
            <View style={[styles.recipeCardContent, vertical && styles.recipeCardContentVertical]}>
                <View ref={thumbRef} style={vertical ? desktopRecipeStyles.gridCardImage : styles.thumb}>
                    {item.image_uri ? (
                        <CoverImage
                            uri={item.image_uri}
                            style={vertical ? desktopRecipeStyles.gridCardImageFill : styles.recipeImage}
                            onPress={onImagePress ? () => onImagePress(item.image_uri) : undefined}
                            accessibilityLabel={`${item.title} photo`}
                        />
                    ) : (
                        <View
                            style={[
                                vertical ? desktopRecipeStyles.gridPlaceholder : styles.placeholderImage,
                                { backgroundColor: theme.primary[100] },
                            ]}
                        >
                            <Ionicons name="restaurant" size={vertical ? 40 : 32} color={theme.primary[500]} />
                        </View>
                    )}
                </View>
                <View style={[styles.recipeInfo, vertical && styles.recipeInfoVertical]}>
                    <View style={styles.recipeTitleRow}>
                        <Text style={[styles.recipeTitle, { color: theme.colors.text.primary }]} numberOfLines={2}>
                            {safeRecipeText(item.title) || 'Untitled recipe'}
                        </Text>
                        {cooked && <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />}
                    </View>
                    {!!safeRecipeText(item.description) && (
                        <Text style={[styles.recipeDescription, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                            {safeRecipeText(item.description)}
                        </Text>
                    )}
                    <View style={styles.recipeMeta}>
                        {enhancing && (
                            <View style={styles.metaItem}>
                                <Ionicons name="sparkles" size={14} color={theme.accent.purple} />
                                <Text style={[styles.metaText, { color: theme.accent.purple }]}>Enhancing…</Text>
                            </View>
                        )}
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
    const { isDesktop } = useLayoutMode();
    const [recipes, setRecipes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'cooked', 'uncooked'
    const enhancingIds = useActiveEnhanceRecipeIds();
    const [lightboxUri, setLightboxUri] = useState(null);
    const [frame, setFrame] = useState({ width: 0, height: 0 });
    const { listInset } = useFloatingActionLayout(1, frame);

    // Header customization removed as per user request
    const loadRecipes = useCallback(async () => {
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
    }, [filter]);

    useFocusEffect(
        useCallback(() => {
            loadRecipes();
        }, [loadRecipes])
    );

    useSyncDataRefresh(loadRecipes);

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

    const renderRecipeCard = useCallback(
        ({ item, index }) => (
            <RecipeCard
                item={item}
                index={index}
                theme={theme}
                navigation={navigation}
                layout="horizontal"
                enhancing={enhancingIds.has(item.id)}
                onImagePress={setLightboxUri}
            />
        ),
        [navigation, theme, enhancingIds]
    );

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

    const recipeCountLabel = loading ? 'Loading…' : `${recipes.length} saved`;

    return (
        <View
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
            }}
        >
            <ImageLightbox visible={!!lightboxUri} uri={lightboxUri} onClose={() => setLightboxUri(null)} isDark={isDark} />
            {isDesktop ? (
                <DesktopPageHeader title="Recipe Book" subtitle={recipeCountLabel}>
                    <View style={desktopPageStyles.searchRow}>
                        <View
                            style={[
                                desktopPageStyles.searchField,
                                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
                            ]}
                        >
                            <Ionicons name="search" size={20} color={theme.colors.text.tertiary} />
                            <TextInput
                                accessibilityLabel="Search recipes"
                                style={[styles.searchInput, { color: theme.colors.text.primary, marginLeft: 0 }]}
                                placeholder="Search recipes…"
                                placeholderTextColor={theme.colors.text.tertiary}
                                value={searchQuery}
                                onChangeText={handleSearch}
                            />
                        </View>
                        <AnimatedPressable
                            accessibilityRole="button"
                            accessibilityLabel="Add recipe"
                            onPress={() => navigation.navigate('AddRecipe')}
                            style={[desktopPageStyles.primaryBtn, { backgroundColor: theme.primary[500] }, theme.shadows.glow]}
                        >
                            <Ionicons name="add" size={20} color="#FFFFFF" />
                            <Text style={desktopPageStyles.primaryBtnText}>Add recipe</Text>
                        </AnimatedPressable>
                        {isEmptyLibrary ? (
                            <AnimatedPressable
                                accessibilityRole="button"
                                accessibilityLabel="Add sample recipes"
                                onPress={addSampleRecipes}
                                style={[
                                    desktopPageStyles.primaryBtn,
                                    { backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.border },
                                ]}
                            >
                                <Text style={[desktopPageStyles.primaryBtnText, { color: theme.colors.text.primary }]}>
                                    Add samples
                                </Text>
                            </AnimatedPressable>
                        ) : null}
                    </View>
                </DesktopPageHeader>
            ) : null}

            {!isEmptyLibrary && (
            <View
                style={[
                    styles.filterContainer,
                    isDesktop && desktopRecipeStyles.filterRowDesktop,
                    { backgroundColor: theme.colors.surfaceGlass, borderBottomColor: theme.colors.borderSoft },
                ]}
            >
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

            {!isEmptyLibrary && !isDesktop && (
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

            {isDesktop ? (
                <ScrollView
                    contentContainerStyle={[styles.listContent, desktopRecipeStyles.gridScroll]}
                    keyboardShouldPersistTaps="handled"
                >
                    {recipes.length === 0 && !loading ? renderEmptyState() : null}
                    {recipes.length > 0 ? (
                        <RecipeBookDesktopGrid>
                            {recipes.map((item, index) => (
                                <RecipeCard
                                    key={recipeKey(item)}
                                    item={item}
                                    index={index}
                                    theme={theme}
                                    navigation={navigation}
                                    layout="vertical"
                                    enhancing={enhancingIds.has(item.id)}
                                    onImagePress={setLightboxUri}
                                />
                            ))}
                        </RecipeBookDesktopGrid>
                    ) : null}
                </ScrollView>
            ) : (
                <FlatList
                    data={recipes}
                    renderItem={renderRecipeCard}
                    keyExtractor={recipeKey}
                    initialNumToRender={8}
                    maxToRenderPerBatch={6}
                    windowSize={7}
                    contentContainerStyle={[
                        styles.listContent,
                        {
                            paddingLeft: listInset.paddingLeft,
                            paddingRight: listInset.paddingRight,
                            paddingBottom: listInset.paddingBottom,
                        },
                    ]}
                    ListEmptyComponent={!loading && renderEmptyState()}
                    refreshing={loading}
                    onRefresh={loadRecipes}
                />
            )}

            {!isDesktop ? (
                <FabCluster
                    frame={frame}
                    actions={[
                        {
                            key: 'add',
                            theme,
                            accessibilityLabel: 'Add recipe',
                            testID: 'fab-add',
                            morphTo: 'af-sheet',
                            onPress: () => navigation.navigate('AddRecipe'),
                            icon: <Ionicons name="add" size={28} color="#FFFFFF" />,
                        },
                    ]}
                />
            ) : null}
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
    recipeCardContentVertical: {
        flexDirection: 'column',
        alignItems: 'stretch',
    },
    recipeInfo: {
        flex: 1,
        marginLeft: 16,
        minWidth: 0,
    },
    recipeInfoVertical: {
        marginLeft: 0,
        width: '100%',
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
