import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Image,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { parseRecipe, parseRecipeFromUrl, parseRecipeFromImages } from '../services/recipeParser';
import { recipeOperations } from '../database/operations';
import FunLoader from '../components/FunLoader';

const ImportRecipeScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    const [input, setInput] = useState('');
    const [images, setImages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [parsedRecipe, setParsedRecipe] = useState(null);
    const [error, setError] = useState(null);
    const [importStatus, setImportStatus] = useState('');

    useEffect(() => {
        if (route.params?.sharedContent) {
            const content = route.params.sharedContent;
            setInput(content);
        }
        if (route.params?.sharedFiles) {
            const files = route.params.sharedFiles;
            // Extract URIs (expo-share-intent usually provides 'path' or 'uri')
            const imageUris = files.map(f => f.path || f.uri || f.filePath).filter(Boolean);
            setImages(imageUris);
        }
    }, [route.params]);

    const handleImport = async () => {
        if (!input.trim() && images.length === 0) {
            Alert.alert('Error', 'Please enter text/URL or share an image');
            return;
        }

        setIsLoading(true);
        setError(null);
        setParsedRecipe(null);
        setImportStatus('Analyzing input...');

        try {
            let result;

            if (images.length > 0) {
                // Import from images
                setImportStatus('Processing images with AI...');
                result = await parseRecipeFromImages(images);
            } else {
                // Import from text/URL
                const isUrl = /^(http|https):\/\/[^ "]+$/.test(input.trim());

                if (isUrl) {
                    if (input.includes('instagram.com') || input.includes('tiktok.com')) {
                        Alert.alert(
                            'Social Media Link Detected',
                            'Instagram/TikTok links are hard to read. For best results, take a SCREENSHOT and share it to Food Dude, or paste the caption text.',
                            [
                                {
                                    text: 'Try URL Anyway', onPress: async () => {
                                        setIsLoading(true);
                                        setImportStatus('Extracting recipe from URL...');
                                        try {
                                            const res = await parseRecipeFromUrl(input.trim());
                                            if (res.success) setParsedRecipe(res.recipe);
                                            else setError(res.error || 'Failed');
                                        } catch (e) { setError(e.message); }
                                        finally { setIsLoading(false); setImportStatus(''); }
                                    }
                                },
                                { text: 'Cancel', style: 'cancel', onPress: () => { setIsLoading(false); setImportStatus(''); } }
                            ]
                        );
                        return;
                    }
                    setImportStatus('Extracting recipe from URL...');
                    result = await parseRecipeFromUrl(input.trim());
                } else {
                    setImportStatus('Parsing recipe text with AI...');
                    result = await parseRecipe(input.trim());
                }
            }

            setImportStatus('Finalizing...');
            if (result.success) {
                setParsedRecipe(result.recipe);
            } else {
                setError(result.error || 'Failed to parse recipe');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setIsLoading(false);
            setImportStatus('');
        }
    };

    const handleSave = async () => {
        if (!parsedRecipe) return;

        try {
            setIsLoading(true);
            const recipeId = await recipeOperations.create(parsedRecipe);
            // Ensure recipe is fully saved and database is ready
            await new Promise(resolve => setTimeout(resolve, 200));
            Alert.alert(
                'Success',
                'Recipe saved to your cookbook!',
                [
                    {
                        text: 'View Recipe',
                        onPress: () => {
                            // Navigate directly to RecipeDetail - it will show the recipe from the recipe book
                            navigation.navigate('RecipeDetail', { recipeId: Number(recipeId) });
                        },
                    },
                    {
                        text: 'Import Another',
                        onPress: () => {
                            setParsedRecipe(null);
                            setInput('');
                        },
                        style: 'cancel',
                    },
                ]
            );
        } catch (e) {
            Alert.alert('Error', 'Failed to save recipe: ' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: theme.colors.background }]}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>
                        Import Recipe
                    </Text>
                    <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
                        Paste an Instagram URL or recipe text below
                    </Text>
                </View>

                <View style={[styles.inputContainer, { backgroundColor: theme.colors.surface }]}>
                    <TextInput
                        style={[styles.input, { color: theme.colors.text.primary }]}
                        placeholder="https://instagram.com/p/... or paste recipe text"
                        placeholderTextColor={theme.colors.text.tertiary}
                        value={input}
                        onChangeText={setInput}
                        multiline
                        numberOfLines={4}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                {images.length > 0 && (
                    <ScrollView horizontal style={styles.imagePreviewContainer} contentContainerStyle={{ paddingHorizontal: 4 }}>
                        {images.map((uri, index) => (
                            <Image key={index} source={{ uri }} style={styles.previewImage} />
                        ))}
                    </ScrollView>
                )}

                <TouchableOpacity
                    style={[styles.importButton, { backgroundColor: theme.primary[500] }]}
                    onPress={handleImport}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.buttonText}>
                                {importStatus || 'Importing...'}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.buttonText}>Import with AI</Text>
                        </>
                    )}
                </TouchableOpacity>

                <FunLoader visible={isLoading} />

                {error && (
                    <View style={[styles.errorContainer, { backgroundColor: theme.colors.error + '20' }]}>
                        <Ionicons name="alert-circle" size={24} color={theme.colors.error} />
                        <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
                    </View>
                )}

                {parsedRecipe && (
                    <View style={[styles.resultContainer, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.resultTitle, { color: theme.colors.text.primary }]}>
                            {parsedRecipe.title}
                        </Text>

                        {parsedRecipe.description && (
                            <Text style={[styles.resultDescription, { color: theme.colors.text.secondary }]}>
                                {parsedRecipe.description}
                            </Text>
                        )}

                        <View style={styles.statsRow}>
                            <View style={styles.stat}>
                                <Ionicons name="time-outline" size={16} color={theme.colors.text.tertiary} />
                                <Text style={[styles.statText, { color: theme.colors.text.secondary }]}>
                                    {parsedRecipe.totalTime || parsedRecipe.cookTime || '--'} min
                                </Text>
                            </View>
                            <View style={styles.stat}>
                                <Ionicons name="restaurant-outline" size={16} color={theme.colors.text.tertiary} />
                                <Text style={[styles.statText, { color: theme.colors.text.secondary }]}>
                                    {parsedRecipe.ingredients?.length || 0} ingredients
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[styles.saveButton, { backgroundColor: theme.colors.success }]}
                            onPress={handleSave}
                            disabled={isLoading}
                        >
                            <Ionicons name="save-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.buttonText}>Save to Cookbook</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
    },
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
    },
    inputContainer: {
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        minHeight: 120,
    },
    input: {
        fontSize: 16,
        textAlignVertical: 'top',
        minHeight: 100,
    },
    importButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    errorText: {
        marginLeft: 12,
        flex: 1,
        fontSize: 14,
    },
    resultContainer: {
        padding: 20,
        borderRadius: 16,
        marginBottom: 24,
    },
    resultTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    resultDescription: {
        fontSize: 16,
        marginBottom: 16,
        lineHeight: 22,
    },
    statsRow: {
        flexDirection: 'row',
        marginBottom: 24,
    },
    stat: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 24,
    },
    statText: {
        marginLeft: 6,
        fontSize: 14,
        fontWeight: '500',
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
    },
    imagePreviewContainer: {
        flexDirection: 'row',
        marginBottom: 16,
        maxHeight: 120,
    },
    previewImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
        marginRight: 8,
    },
});

export default ImportRecipeScreen;
