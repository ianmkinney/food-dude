import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Image,
    Alert,
    ActivityIndicator,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useViewTransitionTarget } from '../motion/viewTransition';
import { parseRecipe, parseRecipeFromImages } from '../services/recipeParser';
import { importRecipeFromLink, recipeLinkImportStatus } from '../services/recipeLinkImportFlow';
import { recipeOperations } from '../database/operations';
import FunLoader from '../components/FunLoader';
import RecipeImportReviewForm from '../components/RecipeImportReviewForm';

const AddRecipeScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const sheetRef = useViewTransitionTarget('af-sheet');
    const [input, setInput] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkStatus, setLinkStatus] = useState('');
    const [linkError, setLinkError] = useState(null);
    const [needsSignIn, setNeedsSignIn] = useState(false);
    const [mode, setMode] = useState('text');
    const [selectedImages, setSelectedImages] = useState([]);
    const [reviewRecipe, setReviewRecipe] = useState(null);

    const handlePasteLink = useCallback(async () => {
        try {
            const clip = await Clipboard.getStringAsync();
            if (clip?.trim()) setLinkUrl(clip.trim());
        } catch {
            Alert.alert('Paste', "Couldn't read the clipboard.");
        }
    }, []);

    const handlePickImages = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                quality: 0.8,
                base64: false,
            });

            if (!result.canceled) {
                setSelectedImages(
                    result.assets.map((asset) => ({
                        uri: asset.uri,
                        mimeType: asset.mimeType,
                        fileName: asset.fileName,
                    }))
                );
            }
        } catch (error) {
            console.error('ImagePicker Error:', error);
            Alert.alert('Error', 'Failed to open image picker: ' + error.message);
        }
    };

    const saveReviewedRecipe = async (recipe) => {
        if (!recipe?.title?.trim()) {
            Alert.alert('Error', 'Add a recipe title before saving.');
            return;
        }
        setLoading(true);
        try {
            const recipeId = await recipeOperations.create(recipe);
            if (recipe.aiExtracted) {
                await recipeOperations.setProvenance(recipeId, { isAiGenerated: true });
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
            Alert.alert('Success', 'Recipe saved to your recipe book!', [
                {
                    text: 'View Recipe',
                    onPress: () => navigation.navigate('RecipeDetail', { recipeId: Number(recipeId) }),
                },
                {
                    text: 'Add Another',
                    onPress: () => {
                        setReviewRecipe(null);
                        setLinkUrl('');
                        setInput('');
                        setSelectedImages([]);
                    },
                    style: 'cancel',
                },
            ]);
        } catch (error) {
            Alert.alert('Error', error?.message || 'Failed to save recipe');
        } finally {
            setLoading(false);
        }
    };

    const handleLinkImport = async () => {
        const trimmed = linkUrl.trim();
        if (!trimmed) {
            Alert.alert('Error', 'Paste a recipe or social post link first.');
            return;
        }

        setLinkLoading(true);
        setLinkError(null);
        setNeedsSignIn(false);
        setReviewRecipe(null);
        setLinkStatus(recipeLinkImportStatus(trimmed));

        try {
            const result = await importRecipeFromLink(trimmed, {
                onStatus: (msg) => setLinkStatus(msg),
            });
            if (result.success && result.recipe) {
                setReviewRecipe(result.recipe);
            } else {
                setNeedsSignIn(Boolean(result.needsSignIn));
                setLinkError(result.error || "Couldn't import that link.");
            }
        } catch (error) {
            setLinkError(error?.message || 'Import failed.');
        } finally {
            setLinkLoading(false);
            setLinkStatus('');
        }
    };

    const handleImport = async () => {
        if (mode !== 'image' && !input.trim()) {
            Alert.alert('Error', 'Please enter recipe text');
            return;
        }
        if (mode === 'image' && selectedImages.length === 0) {
            Alert.alert('Error', 'Please select at least one image');
            return;
        }

        setLoading(true);
        try {
            let result;
            if (mode === 'text') {
                result = await parseRecipe(input);
            } else if (mode === 'image') {
                result = await parseRecipeFromImages(selectedImages);
            }

            if (result.success) {
                setReviewRecipe({ ...result.recipe, aiExtracted: true });
            } else {
                Alert.alert('Error', result.error || 'Failed to parse recipe');
            }
        } catch (error) {
            console.error('Import error:', error);
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View ref={sheetRef} style={[styles.container, { backgroundColor: theme.colors.background }]}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>Add Recipe</Text>
                    <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
                        Import from a link, pasted text, or screenshots.
                    </Text>

                    <View
                        style={[
                            styles.linkCard,
                            { backgroundColor: theme.primary[50], borderColor: theme.primary[200] },
                        ]}
                    >
                        <View style={styles.linkHeader}>
                            <Ionicons name="link" size={22} color={theme.primary[600]} />
                            <Text style={[styles.linkTitle, { color: theme.primary[800] }]}>Add from link</Text>
                        </View>
                        <Text style={[styles.linkHint, { color: theme.colors.text.secondary }]}>
                            Instagram posts/reels, TikTok (including /t/ short links), or any public recipe site.
                        </Text>
                        <View style={[styles.linkInputRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <TextInput
                                accessibilityLabel="Recipe link URL"
                                style={[styles.linkInput, { color: theme.colors.text.primary }]}
                                placeholder="https://…"
                                placeholderTextColor={theme.colors.text.tertiary}
                                value={linkUrl}
                                onChangeText={setLinkUrl}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                            <TouchableOpacity
                                onPress={handlePasteLink}
                                style={[styles.pasteButton, { borderColor: theme.colors.border }]}
                                accessibilityRole="button"
                                accessibilityLabel="Paste link"
                            >
                                <Ionicons name="clipboard-outline" size={18} color={theme.primary[600]} />
                                <Text style={[styles.pasteText, { color: theme.primary[700] }]}>Paste</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            style={[styles.linkImportButton, { backgroundColor: theme.primary[600], opacity: linkLoading ? 0.75 : 1 }]}
                            onPress={handleLinkImport}
                            disabled={linkLoading}
                        >
                            {linkLoading ? (
                                <>
                                    <ActivityIndicator size="small" color="#FFF" />
                                    <Text style={styles.linkImportText}>{linkStatus || 'Importing…'}</Text>
                                </>
                            ) : (
                                <>
                                    <Ionicons name="cloud-download-outline" size={20} color="#FFF" />
                                    <Text style={styles.linkImportText}>Import from link</Text>
                                </>
                            )}
                        </TouchableOpacity>
                        {linkError ? (
                            <View style={[styles.errorBox, { backgroundColor: theme.colors.error + '18' }]}>
                                <Ionicons name="alert-circle" size={22} color={theme.colors.error} />
                                <View style={styles.errorBody}>
                                    <Text style={[styles.errorText, { color: theme.colors.error }]}>{linkError}</Text>
                                    {needsSignIn ? (
                                        <TouchableOpacity
                                            onPress={() => navigation.navigate('Account')}
                                            style={styles.signInButton}
                                        >
                                            <Text style={[styles.signInText, { color: theme.primary[700] }]}>
                                                Go to Account to sign in
                                            </Text>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            </View>
                        ) : null}
                    </View>

                    {reviewRecipe ? (
                        <RecipeImportReviewForm
                            recipe={reviewRecipe}
                            onChange={setReviewRecipe}
                            onSave={saveReviewedRecipe}
                            saving={loading}
                        />
                    ) : null}

                    <View style={styles.dividerRow}>
                        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
                        <Text style={[styles.dividerText, { color: theme.colors.text.tertiary }]}>Or use AI</Text>
                        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
                    </View>

                    <View style={[styles.modeContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <TouchableOpacity
                            style={[styles.modeButton, mode === 'text' && { backgroundColor: theme.primary[100] }]}
                            onPress={() => setMode('text')}
                        >
                            <Text
                                style={[
                                    styles.modeText,
                                    { color: mode === 'text' ? theme.primary[600] : theme.colors.text.secondary },
                                ]}
                            >
                                Text
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeButton, mode === 'image' && { backgroundColor: theme.primary[100] }]}
                            onPress={() => setMode('image')}
                        >
                            <Text
                                style={[
                                    styles.modeText,
                                    { color: mode === 'image' ? theme.primary[600] : theme.colors.text.secondary },
                                ]}
                            >
                                Image
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {mode === 'image' ? (
                        <View style={styles.imageSection}>
                            <TouchableOpacity
                                style={[styles.imagePickerButton, { borderColor: theme.primary[500], backgroundColor: theme.primary[50] }]}
                                onPress={handlePickImages}
                            >
                                <Ionicons name="images-outline" size={32} color={theme.primary[500]} />
                                <Text style={[styles.imagePickerText, { color: theme.primary[700] }]}>
                                    {selectedImages.length > 0 ? `${selectedImages.length} images selected` : 'Select Screenshots'}
                                </Text>
                            </TouchableOpacity>

                            {selectedImages.length > 0 && (
                                <ScrollView horizontal style={styles.previewScroll} contentContainerStyle={{ gap: 8 }}>
                                    {selectedImages.map((asset, index) => (
                                        <Image key={asset.uri || index} source={{ uri: asset.uri }} style={styles.previewImage} />
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                    ) : (
                        <View style={[styles.inputContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <TextInput
                                accessibilityLabel="Recipe text"
                                style={[styles.input, { color: theme.colors.text.primary, minHeight: 200 }]}
                                placeholder="Paste recipe text here..."
                                placeholderTextColor={theme.colors.text.tertiary}
                                value={input}
                                onChangeText={setInput}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.importButton, { backgroundColor: theme.primary[500], opacity: loading ? 0.7 : 1 }]}
                        onPress={handleImport}
                        disabled={loading}
                    >
                        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                        <Text style={styles.importButtonText}>Parse with AI</Text>
                    </TouchableOpacity>

                    <FunLoader visible={loading || linkLoading} />
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        marginBottom: 20,
        lineHeight: 22,
    },
    linkCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 20,
    },
    linkHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    linkTitle: {
        fontSize: 20,
        fontWeight: '800',
    },
    linkHint: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    linkInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingLeft: 12,
        marginBottom: 12,
    },
    linkInput: {
        flex: 1,
        fontSize: 16,
        paddingVertical: 12,
    },
    pasteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderLeftWidth: 1,
    },
    pasteText: {
        fontSize: 14,
        fontWeight: '600',
    },
    linkImportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
    },
    linkImportText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
    errorBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
    },
    errorBody: {
        flex: 1,
    },
    errorText: {
        fontSize: 14,
        lineHeight: 20,
    },
    signInButton: {
        marginTop: 8,
    },
    signInText: {
        fontSize: 15,
        fontWeight: '700',
    },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    modeContainer: {
        flexDirection: 'row',
        borderRadius: 12,
        borderWidth: 1,
        padding: 4,
        marginBottom: 20,
    },
    modeButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    modeText: {
        fontSize: 16,
        fontWeight: '600',
    },
    inputContainer: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 16,
        marginBottom: 24,
    },
    input: {
        fontSize: 16,
    },
    imageSection: {
        marginBottom: 24,
    },
    imagePickerButton: {
        height: 120,
        borderRadius: 12,
        borderWidth: 2,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    imagePickerText: {
        marginTop: 8,
        fontSize: 16,
        fontWeight: '600',
    },
    previewScroll: {
        flexDirection: 'row',
    },
    previewImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
    },
    importButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 8,
    },
    importButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default AddRecipeScreen;
