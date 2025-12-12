import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Image,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { parseRecipe, parseRecipeFromUrl, parseRecipeFromImages } from '../services/recipeParser';
import { recipeOperations } from '../database/operations';
import FunLoader from '../components/FunLoader';

const AddRecipeScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('text'); // 'text', 'image'
    const [selectedImages, setSelectedImages] = useState([]);

    const handlePickImages = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (permissionResult.granted === false) {
                Alert.alert('Permission Required', 'You need to allow access to your photos to upload screenshots.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'], // Use array of strings as suggested
                allowsMultipleSelection: true,
                quality: 0.8,
                base64: false,
            });

            if (!result.canceled) {
                setSelectedImages(result.assets.map(asset => asset.uri));
            }
        } catch (error) {
            console.error('ImagePicker Error:', error);
            Alert.alert('Error', 'Failed to open image picker: ' + error.message);
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
                // Save to database
                const recipeId = await recipeOperations.create(result.recipe);
                // Ensure recipe is fully saved and database is ready
                await new Promise(resolve => setTimeout(resolve, 200));
                Alert.alert(
                    'Success',
                    'Recipe imported successfully!',
                    [
                        {
                            text: 'View Recipe',
                            onPress: () => {
                                // Navigate directly to RecipeDetail - it will show the recipe from the recipe book
                                navigation.navigate('RecipeDetail', { recipeId: Number(recipeId) });
                            },
                        },
                        {
                            text: 'Add Another',
                            onPress: () => {
                                setInput('');
                                setSelectedImages([]);
                            },
                            style: 'cancel',
                        },
                    ]
                );
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
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]}>
                    Import Recipe
                </Text>
                <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
                    Import from text or screenshots (AI powered).
                </Text>

                {/* Mode Switcher */}
                <View style={[styles.modeContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                    <TouchableOpacity
                        style={[styles.modeButton, mode === 'text' && { backgroundColor: theme.primary[100] }]}
                        onPress={() => setMode('text')}
                    >
                        <Text style={[styles.modeText, { color: mode === 'text' ? theme.primary[600] : theme.colors.text.secondary }]}>Text</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeButton, mode === 'image' && { backgroundColor: theme.primary[100] }]}
                        onPress={() => setMode('image')}
                    >
                        <Text style={[styles.modeText, { color: mode === 'image' ? theme.primary[600] : theme.colors.text.secondary }]}>Image</Text>
                    </TouchableOpacity>
                </View>

                {/* Input Area */}
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
                                {selectedImages.map((uri, index) => (
                                    <Image key={index} source={{ uri }} style={styles.previewImage} />
                                ))}
                            </ScrollView>
                        )}
                    </View>
                ) : (
                    <View style={[styles.inputContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                        <TextInput
                            style={[styles.input, { color: theme.colors.text.primary, minHeight: mode === 'text' ? 200 : 50 }]}
                            placeholder={mode === 'url' ? "https://..." : "Paste recipe text here..."}
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={input}
                            onChangeText={setInput}
                            multiline={mode === 'text'}
                            textAlignVertical="top"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                )}

                {/* Import Button */}
                <TouchableOpacity
                    style={[
                        styles.importButton,
                        { backgroundColor: theme.primary[500], opacity: loading ? 0.7 : 1 },
                    ]}
                    onPress={handleImport}
                    disabled={loading}
                >
                    <Ionicons name="cloud-download-outline" size={24} color="#FFFFFF" />
                    <Text style={styles.importButtonText}>Import Recipe</Text>
                </TouchableOpacity>

                <FunLoader visible={loading} />
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        marginBottom: 24,
        lineHeight: 22,
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
