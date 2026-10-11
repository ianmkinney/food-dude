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
import { parseRecipe, parseRecipeFromImages } from '../services/recipeParser';
import { friendlyMediaErrorMessage } from '../services/mediaTypes';
import { recipeOperations } from '../database/operations';
import FunLoader from '../components/FunLoader';
import { importRecipeFromLink } from '../services/recipeLinkImportFlow';
import RecipeImportReviewForm from '../components/RecipeImportReviewForm';

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
        } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const shared = (params.get('url') || params.get('text') || params.get('title') || '').trim();
            if (shared) setInput(shared);
        }
        if (route.params?.sharedFiles) {
            const files = route.params.sharedFiles;
            // Keep the shared mime type and file name — the AI layer needs them to
            // declare the real format (iPhone screenshots are PNG, photos can be HEIC).
            const assets = files
                .map((f) => ({
                    uri: f.path || f.uri || f.filePath,
                    mimeType: f.mimeType || f.type,
                    fileName: f.fileName || f.name,
                }))
                .filter((asset) => Boolean(asset.uri));
            setImages(assets);
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
                    result = await importRecipeFromLink(input.trim(), {
                        onStatus: (msg) => setImportStatus(msg),
                    });
                    if (result.success) {
                        result = { success: true, recipe: result.recipe, aiExtracted: result.aiExtracted };
                    } else {
                        result = { success: false, error: result.error, needsSignIn: result.needsSignIn };
                    }
                } else {
                    setImportStatus('Parsing recipe text with AI...');
                    result = await parseRecipe(input.trim());
                }
            }

            setImportStatus('Finalizing...');
            if (result.success) {
                setParsedRecipe(result.recipe);
            } else {
                console.error('[Import Recipe] Import failed:', result.error);
                setError(result.error || friendlyMediaErrorMessage(result.error) || 'Failed to parse recipe');
            }
        } catch (e) {
            console.error('[Import Recipe] Import threw:', e);
            setError(friendlyMediaErrorMessage(e));
        } finally {
            setIsLoading(false);
            setImportStatus('');
        }
    };

    const handleSave = async (recipeToSave = parsedRecipe) => {
        if (!recipeToSave) return;

        try {
            setIsLoading(true);
            const recipeId = await recipeOperations.create(recipeToSave);
            if (recipeToSave.aiExtracted) {
                await recipeOperations.setProvenance(recipeId, { isAiGenerated: true });
            }
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
                    <TextInput accessibilityLabel="Recipe link or text"
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
                        {images.map((asset, index) => (
                            <Image key={asset.uri || index} source={{ uri: asset.uri }} style={styles.previewImage} />
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
                    <RecipeImportReviewForm
                        recipe={parsedRecipe}
                        onChange={setParsedRecipe}
                        onSave={(draft) => {
                            setParsedRecipe(draft);
                            handleSave(draft);
                        }}
                        saving={isLoading}
                        saveLabel="Save to Cookbook"
                    />
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
