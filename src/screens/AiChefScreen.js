import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert,
    ActivityIndicator,
    Image,
    ScrollView,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import ElevatedCard from '../components/ElevatedCard';
import AnimatedPressable from '../components/AnimatedPressable';
import { aiConversationOperations, pantryOperations, recipeOperations, userOperations } from '../database/operations';
import aiChefService from '../services/aiChefService';
import StyledMessage from '../components/StyledMessage';
import TypingIndicator from '../components/TypingIndicator';

const HELPERS_COLLAPSED_KEY = 'aiChefHelpersCollapsed';

const AiChefScreen = () => {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const reduceMotion = useReducedMotion();
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);
    const [typingMessage, setTypingMessage] = useState(0);
    const [recipes, setRecipes] = useState([]);
    const [loadingRecipes, setLoadingRecipes] = useState(true);
    const flatListRef = useRef(null);
    const typingIntervalRef = useRef(null);
    const cancelledRef = useRef(false);
    const [aiStatus, setAiStatus] = useState('');
    const [generatingRecipeStatus, setGeneratingRecipeStatus] = useState('');
    const [helpersCollapsed, setHelpersCollapsed] = useState(false);
    const [helpersMeasured, setHelpersMeasured] = useState(false);
    // 1 = fully expanded, 0 = fully collapsed. Height is driven off a measured
    // shared value instead of a layout animation so web behaves like native.
    const helpersProgress = useSharedValue(1);
    const helpersHeight = useSharedValue(0);

    useEffect(() => {
        let mounted = true;
        AsyncStorage.getItem(HELPERS_COLLAPSED_KEY)
            .then((saved) => {
                if (mounted && saved === 'true') {
                    setHelpersCollapsed(true);
                    helpersProgress.value = 0;
                }
            })
            .catch((error) => {
                console.error('Error loading AI Chef helper state:', error);
            });
        return () => {
            mounted = false;
        };
    }, []);

    const helpersHeightRef = useRef(0);

    const toggleHelpers = useCallback(() => {
        const next = !helpersCollapsed;
        setHelpersCollapsed(next);
        // Parent height goes to 0 when collapsed; the inner onLayout can then
        // report 0 (or a mid-clamp leftover) and wipe the shared value. Restore
        // the last good height before animating open so the panel can grow.
        // If we never captured a height, drop the clamp so content remounts
        // at its natural size and onLayout can measure again.
        if (!next) {
            if (helpersHeightRef.current > 0) {
                helpersHeight.value = helpersHeightRef.current;
            } else {
                setHelpersMeasured(false);
            }
        }
        const target = next ? 0 : 1;
        helpersProgress.value = reduceMotion
            ? target
            : withTiming(target, {
                duration: motion.duration.normal,
                easing: Easing.out(Easing.cubic),
            });
        AsyncStorage.setItem(HELPERS_COLLAPSED_KEY, String(next)).catch((error) => {
            console.error('Error saving AI Chef helper state:', error);
        });
    }, [helpersCollapsed, reduceMotion]);

    const handleHelpersLayout = useCallback((event) => {
        const { height } = event.nativeEvent.layout;
        if (height <= 0) {
            return;
        }
        const stored = helpersHeightRef.current;
        // First pass is often just the pantry pill (recipes still loading, or
        // the carousel has not finished layout). Always grow so we do not
        // freeze that short height and clip the cards.
        if (height > stored) {
            helpersHeightRef.current = height;
            helpersHeight.value = height;
            setHelpersMeasured(true);
            return;
        }
        // Ignore shrinks while the panel is not fully open so collapse cannot
        // write a mid-clamp leftover over the real height.
        if (helpersProgress.value < 1 && stored > 0) {
            return;
        }
        helpersHeightRef.current = height;
        helpersHeight.value = height;
        setHelpersMeasured(true);
    }, []);

    const helpersBodyStyle = useAnimatedStyle(() => ({
        height: helpersHeight.value * helpersProgress.value,
        opacity: helpersProgress.value,
    }));

    const helpersChevronStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${180 * helpersProgress.value}deg` }],
    }));

    const loadConversation = useCallback(async () => {
        try {
            const history = await aiConversationOperations.getAll();
            setMessages(history);
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    }, []);

    const loadWelcomeMessage = useCallback(async () => {
        const hasMessages = await aiConversationOperations.getAll();
        if (hasMessages.length === 0) {
            const welcomeMsg = {
                role: 'assistant',
                message: "👋 Hi! I'm your AI Chef assistant. I can help you:\n\n• Create recipes from your pantry items\n• Answer cooking questions\n• Provide detailed cooking instructions\n• Analyze food images\n\nHow can I help you today?",
                created_at: Date.now(),
            };
            setMessages([welcomeMsg]);
        }
    }, []);

    useEffect(() => {
        loadConversation();
        loadWelcomeMessage();
        loadRecipes();
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadRecipes();
        }, [])
    );

    const loadRecipes = async () => {
        try {
            setLoadingRecipes(true);
            const allRecipes = await recipeOperations.getAll();
            setRecipes(allRecipes);
        } catch (error) {
            console.error('Error loading recipes:', error);
            setRecipes([]);
        } finally {
            setLoadingRecipes(false);
        }
    };

    const handleRecipeSelect = async (recipe) => {
        const message = `Help me cook this recipe: ${recipe.title}`;
        // Get full recipe details for context
        try {
            const fullRecipe = await recipeOperations.getById(recipe.id);
            if (fullRecipe) {
                // Send message with recipe context
                const userMessage = {
                    role: 'user',
                    message: message,
                    created_at: Date.now(),
                };
                setMessages(prev => [...prev, userMessage]);
                await aiConversationOperations.add(userMessage);
                cancelledRef.current = false;
                setLoading(true);

                // Get user flavor preferences
                let flavorPreferences = null;
                try {
                    const currentUser = await userOperations.getCurrent();
                    flavorPreferences = currentUser?.flavor_preferences || null;
                } catch (error) {
                    console.log('[AI Chef] Could not load user preferences:', error);
                }

                if (cancelledRef.current) {
                    return;
                }

                const response = await aiChefService.sendMessage(message, {
                    currentRecipe: fullRecipe,
                    flavorPreferences: flavorPreferences,
                });

                if (cancelledRef.current) {
                    return;
                }

                if (response.success) {
                    // Check if response contains a recipe (JSON format)
                    let recipeData = null;
                    let messageText = response.message;

                    // Try to extract recipe from JSON in the response
                    try {
                        let cleanedMessage = response.message.trim();
                        if (cleanedMessage.startsWith('```json')) {
                            cleanedMessage = cleanedMessage.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                        } else if (cleanedMessage.startsWith('```')) {
                            cleanedMessage = cleanedMessage.replace(/```\n?/g, '');
                        }
                        
                        let jsonMatch = cleanedMessage.match(/\{[\s\S]*\}/);
                        if (!jsonMatch) {
                            jsonMatch = response.message.match(/\{[\s\S]*?"title"[\s\S]*?\}/);
                        }
                        
                        if (jsonMatch) {
                            let recipeJson;
                            try {
                                recipeJson = JSON.parse(jsonMatch[0]);
                            } catch (parseError) {
                                recipeJson = JSON.parse(cleanedMessage);
                            }
                            
                            if (recipeJson.title && recipeJson.ingredients && Array.isArray(recipeJson.ingredients) && recipeJson.instructions && Array.isArray(recipeJson.instructions)) {
                                recipeData = recipeJson;
                                const totalTime = recipeJson.totalTime || (recipeJson.prepTime && recipeJson.cookTime ? recipeJson.prepTime + recipeJson.cookTime : null);
                                messageText = `# ${recipeJson.title}\n\n${recipeJson.description || ''}\n\n**Servings:** ${recipeJson.servings || 'N/A'} | **Time:** ${totalTime || 'N/A'} min | **Difficulty:** ${recipeJson.difficulty || 'N/A'}\n\n## Ingredients\n${recipeJson.ingredients.map(i => `• ${i.quantity || ''} ${i.unit || ''} ${i.ingredient}`).join('\n')}\n\n## Instructions\n${recipeJson.instructions.map((step, i) => `${i + 1}. ${step}`).join('\n\n')}\n\n${recipeJson.chefNote ? `💡 ${recipeJson.chefNote}` : ''}`;
                            }
                        }
                    } catch (e) {
                        // Not a recipe, use message as-is
                    }

                    const assistantMessage = {
                        role: 'assistant',
                        message: messageText,
                        created_at: Date.now(),
                        recipeData: recipeData,
                    };
                    setMessages(prev => [...prev, assistantMessage]);
                    await aiConversationOperations.add(assistantMessage);
                } else {
                    Alert.alert('Error', response.error || 'Failed to get response from AI Chef');
                }
            }
        } catch (error) {
            console.error('Error handling recipe select:', error);
            Alert.alert('Error', 'Failed to load recipe details');
        } finally {
            setLoading(false);
        }
    };

    // Handle typing indicator animation
    useEffect(() => {
        if (loading) {
            typingIntervalRef.current = setInterval(() => {
                setTypingMessage((prev) => (prev + 1) % 2);
            }, 1500); // Alternate every 1.5 seconds
        } else {
            if (typingIntervalRef.current) {
                clearInterval(typingIntervalRef.current);
                typingIntervalRef.current = null;
            }
            setTypingMessage(0);
        }

        return () => {
            if (typingIntervalRef.current) {
                clearInterval(typingIntervalRef.current);
            }
        };
    }, [loading]);

    const handleClearChat = useCallback(async () => {
        Alert.alert(
            'Clear Chat',
            'Are you sure you want to clear the conversation history?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await aiConversationOperations.clear();
                            setMessages([]);
                            aiChefService.clearHistory();
                            loadWelcomeMessage();
                        } catch (error) {
                            console.error('Error clearing chat:', error);
                        }
                    },
                },
            ]
        );
    }, [loadWelcomeMessage]);

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity onPress={handleClearChat} style={{ marginRight: 16 }}>
                    <Ionicons name="trash-outline" size={24} color={theme.colors.text.primary} />
                </TouchableOpacity>
            ),
        });
    }, [navigation, handleClearChat, theme.colors.text.primary]);

    const handleStopGeneration = () => {
        cancelledRef.current = true;
        setLoading(false);
        setAiStatus('');
        setGeneratingRecipeStatus('');
        // Remove the last user message if it was just added
        setMessages(prev => {
            if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
                return prev.slice(0, -1);
            }
            return prev;
        });
    };

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;

        cancelledRef.current = false;
        console.log('[AI Chef] Starting message send...');
        const userMessage = {
            role: 'user',
            message: inputText.trim(),
            created_at: Date.now(),
        };

        console.log('[AI Chef] User message:', userMessage.message);
        setMessages(prev => [...prev, userMessage]);
        const messageText = inputText.trim();
        setInputText('');
        setLoading(true);
        setAiStatus('Processing your message...');
        console.log('[AI Chef] Loading state set to true');

        try {
            // Save user message
            console.log('[AI Chef] Saving user message to database...');
            await aiConversationOperations.add(userMessage);
            console.log('[AI Chef] User message saved');

            // Get user flavor preferences for context
            setAiStatus('Loading preferences...');
            let flavorPreferences = null;
            try {
                const currentUser = await userOperations.getCurrent();
                flavorPreferences = currentUser?.flavor_preferences || null;
            } catch (error) {
                console.log('[AI Chef] Could not load user preferences:', error);
            }

            // Check if cancelled before making AI call
            if (cancelledRef.current) {
                return;
            }

            // Get AI response
            setAiStatus('AI is thinking...');
            console.log('[AI Chef] Calling aiChefService.sendMessage...');
            const startTime = Date.now();
            const response = await aiChefService.sendMessage(messageText, {
                flavorPreferences: flavorPreferences,
            });
            
            // Check if cancelled after AI call
            if (cancelledRef.current) {
                return;
            }
            
            const endTime = Date.now();
            console.log(`[AI Chef] Response received in ${endTime - startTime}ms`);
            console.log('[AI Chef] Response object:', JSON.stringify(response, null, 2));

            if (response.success) {
                console.log('[AI Chef] Response successful, processing message...');
                console.log('[AI Chef] Response message length:', response.message?.length || 0);
                console.log('[AI Chef] Response message preview:', response.message?.substring(0, 100) || 'No message');
                
                // Check if response contains a recipe (JSON format)
                let recipeData = null;
                let messageText = response.message;

                // Try to extract recipe from JSON in the response
                try {
                    console.log('[AI Chef] Checking for recipe in response...');
                    let cleanedMessage = response.message.trim();
                    
                    // Remove markdown code blocks if present
                    if (cleanedMessage.startsWith('```json')) {
                        cleanedMessage = cleanedMessage.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                    } else if (cleanedMessage.startsWith('```')) {
                        cleanedMessage = cleanedMessage.replace(/```\n?/g, '');
                    }
                    
                    // Try to find JSON object - look for complete JSON objects
                    let jsonMatch = cleanedMessage.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) {
                        // Try to find JSON that might be embedded in text
                        jsonMatch = response.message.match(/\{[\s\S]*?"title"[\s\S]*?\}/);
                    }
                    
                    if (jsonMatch) {
                        console.log('[AI Chef] JSON match found, parsing...');
                        let recipeJson;
                        try {
                            recipeJson = JSON.parse(jsonMatch[0]);
                        } catch (parseError) {
                            // Try parsing the cleaned message directly
                            recipeJson = JSON.parse(cleanedMessage);
                        }
                        console.log('[AI Chef] Parsed recipe JSON:', JSON.stringify(recipeJson, null, 2));
                        
                        if (recipeJson.title && recipeJson.ingredients && Array.isArray(recipeJson.ingredients) && recipeJson.instructions && Array.isArray(recipeJson.instructions)) {
                            console.log('[AI Chef] Valid recipe detected!');
                            recipeData = recipeJson;
                            // Format the recipe nicely for display
                            const totalTime = recipeJson.totalTime || (recipeJson.prepTime && recipeJson.cookTime ? recipeJson.prepTime + recipeJson.cookTime : null);
                            messageText = `# ${recipeJson.title}\n\n${recipeJson.description || ''}\n\n**Servings:** ${recipeJson.servings || 'N/A'} | **Time:** ${totalTime || 'N/A'} min | **Difficulty:** ${recipeJson.difficulty || 'N/A'}\n\n## Ingredients\n${recipeJson.ingredients.map(i => `• ${i.quantity || ''} ${i.unit || ''} ${i.ingredient}`).join('\n')}\n\n## Instructions\n${recipeJson.instructions.map((step, i) => `${i + 1}. ${step}`).join('\n\n')}\n\n${recipeJson.chefNote ? `💡 ${recipeJson.chefNote}` : ''}`;
                            console.log('[AI Chef] Recipe formatted successfully');
                        } else {
                            console.log('[AI Chef] JSON found but not a valid recipe structure');
                        }
                    } else {
                        console.log('[AI Chef] No JSON recipe found in response');
                    }
                } catch (e) {
                    // Not a recipe, use message as-is
                    console.log('[AI Chef] Error parsing recipe JSON:', e.message);
                    console.log('[AI Chef] Stack:', e.stack);
                }

                const assistantMessage = {
                    role: 'assistant',
                    message: messageText,
                    created_at: Date.now(),
                    recipeData: recipeData,
                };

                console.log('[AI Chef] Creating assistant message...');
                console.log('[AI Chef] Message length:', messageText.length);
                console.log('[AI Chef] Has recipe data:', !!recipeData);
                
                setMessages(prev => {
                    const newMessages = [...prev, assistantMessage];
                    console.log('[AI Chef] Messages updated, total count:', newMessages.length);
                    return newMessages;
                });
                
                console.log('[AI Chef] Saving assistant message to database...');
                await aiConversationOperations.add(assistantMessage);
                console.log('[AI Chef] Assistant message saved');
            } else {
                console.error('[AI Chef] Response failed:', response.error);
                Alert.alert('Error', response.error || 'Failed to get response from AI Chef');
            }
        } catch (error) {
            if (cancelledRef.current) {
                console.log('[AI Chef] Request was cancelled');
                return;
            }
            console.error('[AI Chef] Error in handleSendMessage:', error);
            console.error('[AI Chef] Error message:', error.message);
            console.error('[AI Chef] Error stack:', error.stack);
            Alert.alert('Error', error.message || 'Failed to send message.');
        } finally {
            if (!cancelledRef.current) {
                console.log('[AI Chef] Setting loading to false');
                setLoading(false);
                setAiStatus('');
            }
        }
    };

    const handleGenerateFromPantry = async () => {
        console.log('[AI Chef] handleGenerateFromPantry called');
        cancelledRef.current = false;
        try {
            setLoading(true);
            setGeneratingRecipeStatus('Loading pantry...');
            console.log('[AI Chef] Loading pantry items...');
            const pantryItems = await pantryOperations.getAll();
            
            if (cancelledRef.current) {
                return;
            }
            
            console.log('[AI Chef] Pantry items loaded:', pantryItems.length);

            if (pantryItems.length === 0) {
                console.log('[AI Chef] Pantry is empty');
                Alert.alert('Empty Pantry', 'Add some items to your pantry first!');
                setGeneratingRecipeStatus('');
                return;
            }

            const userMessage = {
                role: 'user',
                message: '🥘 Generate a recipe from my pantry items',
                created_at: Date.now(),
            };

            console.log('[AI Chef] Adding user message to chat');
            setMessages(prev => [...prev, userMessage]);
            await aiConversationOperations.add(userMessage);

            if (cancelledRef.current) {
                return;
            }

            setGeneratingRecipeStatus('Generating recipe with AI...');
            console.log('[AI Chef] Calling generateRecipeFromPantry...');
            const startTime = Date.now();
            const response = await aiChefService.generateRecipeFromPantry(pantryItems);
            
            if (cancelledRef.current) {
                return;
            }
            
            const endTime = Date.now();
            console.log(`[AI Chef] generateRecipeFromPantry completed in ${endTime - startTime}ms`);
            console.log('[AI Chef] Response:', JSON.stringify(response, null, 2));

            if (response.success) {
                console.log('[AI Chef] Recipe generation successful');
                const recipe = response.recipe;
                console.log('[AI Chef] Recipe data:', JSON.stringify(recipe, null, 2));
                
                const recipeText = `# ${recipe.title}\n\n${recipe.description}\n\n**Servings:** ${recipe.servings} | **Time:** ${recipe.totalTime} min | **Difficulty:** ${recipe.difficulty}\n\n## Ingredients\n${recipe.ingredients.map(i => `• ${i.quantity || ''} ${i.unit || ''} ${i.ingredient}`).join('\n')}\n\n## Instructions\n${recipe.instructions.map((step, i) => `${i + 1}. ${step}`).join('\n\n')}\n\n💡 ${recipe.chefNote || 'Enjoy your meal!'}`;

                const assistantMessage = {
                    role: 'assistant',
                    message: recipeText,
                    created_at: Date.now(),
                    recipeData: recipe, // Store recipe data for saving
                };

                console.log('[AI Chef] Adding assistant message to chat');
                setMessages(prev => [...prev, assistantMessage]);
                await aiConversationOperations.add(assistantMessage);
                console.log('[AI Chef] Recipe message added successfully');
            } else {
                console.error('[AI Chef] Recipe generation failed:', response.error);
                Alert.alert('Error', response.error || 'Failed to generate recipe');
            }
        } catch (error) {
            if (cancelledRef.current) {
                console.log('[AI Chef] Request was cancelled');
                return;
            }
            console.error('[AI Chef] Error in handleGenerateFromPantry:', error);
            console.error('[AI Chef] Error message:', error.message);
            console.error('[AI Chef] Error stack:', error.stack);
            Alert.alert('Error', error.message || 'Failed to generate recipe.');
        } finally {
            if (!cancelledRef.current) {
                console.log('[AI Chef] Setting loading to false');
                setLoading(false);
                setGeneratingRecipeStatus('');
            }
        }
    };

    const handleSaveRecipe = async (recipeData) => {
        if (!recipeData) return;

        try {
            setLoading(true);

            // Format recipe for database
            const recipeToSave = {
                title: recipeData.title,
                description: recipeData.description || recipeData.chefNote || '',
                servings: recipeData.servings || null,
                prepTime: recipeData.prepTime || null,
                cookTime: recipeData.cookTime || null,
                totalTime: recipeData.totalTime || (recipeData.prepTime && recipeData.cookTime ? recipeData.prepTime + recipeData.cookTime : null),
                difficulty: recipeData.difficulty || null,
                cuisine: recipeData.cuisine || null,
                notes: recipeData.chefNote || null,
                ingredients: recipeData.ingredients.map(ing => ({
                    ingredient: ing.ingredient,
                    quantity: ing.quantity || null,
                    unit: ing.unit || null,
                })),
                instructions: recipeData.instructions || [],
                tags: recipeData.tags || [],
            };

            const recipeId = await recipeOperations.create(recipeToSave);
            // Ensure recipe is fully saved and database is ready
            await new Promise(resolve => setTimeout(resolve, 200));
            Alert.alert(
                'Success!',
                'Recipe saved to your recipe book!',
                [
                    {
                        text: 'View Recipe',
                        onPress: () => {
                            // Navigate directly to RecipeDetail - it will show the recipe from the recipe book
                            navigation.navigate('RecipeDetail', { recipeId: Number(recipeId) });
                        },
                    },
                    { text: 'OK', style: 'cancel' },
                ]
            );
        } catch (error) {
            console.error('Error saving recipe:', error);
            Alert.alert('Error', 'Failed to save recipe to recipe book');
        } finally {
            setLoading(false);
        }
    };

    const renderTypingIndicator = () => {
        return <TypingIndicator messageIndex={typingMessage} />;
    };

    const renderMessage = ({ item }) => {
        const isUser = item.role === 'user';
        const hasRecipe = item.recipeData && !isUser;

        return (
            <View
                style={[
                    styles.messageBubble,
                    isUser ? styles.userBubble : styles.assistantBubble,
                    isUser ? theme.shadows.glow : theme.shadows.md,
                    { backgroundColor: isUser ? theme.primary[500] : theme.colors.surfaceElevated },
                ]}
            >
                <StyledMessage message={item.message} isUser={isUser} />
                {hasRecipe && (
                    <AnimatedPressable
                        style={[styles.saveRecipeButton, { backgroundColor: theme.accent.green }]}
                        onPress={() => handleSaveRecipe(item.recipeData)}
                        disabled={loading}
                    >
                        <Ionicons name="bookmark" size={16} color="#FFFFFF" />
                        <Text style={styles.saveRecipeText}>Add to Recipe Book</Text>
                    </AnimatedPressable>
                )}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={90}
        >
            {/* Help me cook — collapsible quick actions + recipe shortcuts */}
            <View style={[styles.helpersPanel, { backgroundColor: theme.colors.surfaceGlass, borderBottomColor: theme.colors.borderSoft }]}>
                <AnimatedPressable
                    style={styles.helpersHeader}
                    onPress={toggleHelpers}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Help me cook"
                    accessibilityHint={
                        helpersCollapsed
                            ? 'Expands the cooking shortcuts'
                            : 'Collapses the cooking shortcuts to give the chat more room'
                    }
                    accessibilityState={{ expanded: !helpersCollapsed }}
                >
                    <Text style={[styles.helpersHeaderTitle, { color: theme.colors.text.primary }]}>
                        Help me cook...
                    </Text>
                    <Animated.View style={helpersChevronStyle}>
                        <Ionicons name="chevron-down" size={20} color={theme.colors.text.secondary} />
                    </Animated.View>
                </AnimatedPressable>

                <Animated.View
                    style={[
                        styles.helpersBody,
                        // Until a layout pass reports a real height, never clamp the
                        // panel to a measured 0 — a missed measure would hide the
                        // content outright. Only the collapsed case pins it shut.
                        helpersMeasured
                            ? helpersBodyStyle
                            : helpersCollapsed && styles.helpersBodyShut,
                    ]}
                    pointerEvents={helpersCollapsed ? 'none' : 'auto'}
                >
                    <View
                        onLayout={handleHelpersLayout}
                        collapsable={false}
                        // After the first measure, take the inner out of the
                        // clipped parent's height constraint so later passes
                        // (carousel, images) can report a larger natural size.
                        // The animated parent height still drives chat layout.
                        style={helpersMeasured ? styles.helpersMeasure : undefined}
                    >
                        <View style={styles.quickActions}>
                            <AnimatedPressable
                                style={[styles.quickActionButton, { backgroundColor: theme.primary[100] }]}
                                onPress={handleGenerateFromPantry}
                                disabled={loading}
                            >
                                {loading && generatingRecipeStatus ? (
                                    <>
                                        <ActivityIndicator size="small" color={theme.primary[500]} />
                                        <Text style={[styles.quickActionText, { color: theme.primary[500] }]}>
                                            {generatingRecipeStatus}
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="sparkles" size={20} color={theme.primary[500]} />
                                        <Text style={[styles.quickActionText, { color: theme.primary[500] }]}>
                                            Recipe from Pantry
                                        </Text>
                                    </>
                                )}
                            </AnimatedPressable>
                        </View>

                        {loadingRecipes && recipes.length === 0 ? (
                            <View style={styles.recipeSelectorNotice}>
                                <ActivityIndicator size="small" color={theme.primary[500]} />
                                <Text style={[styles.recipeSelectorNoticeText, { color: theme.colors.text.tertiary }]}>
                                    Loading your recipes...
                                </Text>
                            </View>
                        ) : recipes.length === 0 ? (
                            <View style={styles.recipeSelectorNotice}>
                                <Ionicons name="book-outline" size={18} color={theme.colors.text.tertiary} />
                                <Text style={[styles.recipeSelectorNoticeText, { color: theme.colors.text.tertiary }]}>
                                    No recipes yet — import or add one to cook along here.
                                </Text>
                            </View>
                        ) : (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.recipeSelectorScroll}
                            >
                                {recipes.map((recipe) => (
                                    <ElevatedCard
                                        key={recipe.id}
                                        theme={theme}
                                        style={styles.recipeBubble}
                                        onPress={() => handleRecipeSelect(recipe)}
                                    >
                                        {recipe.image_uri ? (
                                            <Image 
                                                source={{ uri: recipe.image_uri }} 
                                                style={styles.recipeBubbleImage}
                                            />
                                        ) : (
                                            <View
                                                style={[
                                                    styles.recipeBubblePlaceholder,
                                                    {
                                                        backgroundColor: theme.primary[100],
                                                        borderColor: theme.colors.borderSoft,
                                                    },
                                                ]}
                                            >
                                                <Ionicons name="restaurant-outline" size={26} color={theme.primary[500]} />
                                            </View>
                                        )}
                                        <Text 
                                            style={[styles.recipeBubbleTitle, { color: theme.colors.text.primary }]} 
                                            numberOfLines={2}
                                        >
                                            {recipe.title}
                                        </Text>
                                    </ElevatedCard>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </Animated.View>
            </View>

            {/* Messages */}
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item, index) => index.toString()}
                contentContainerStyle={styles.messagesList}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                ListFooterComponent={loading ? renderTypingIndicator : null}
            />

            {/* Input */}
            <View style={[styles.inputContainer, { backgroundColor: theme.colors.surfaceGlass, borderTopColor: theme.colors.borderSoft }]}>
                <TextInput
                    style={[styles.input, { color: theme.colors.text.primary, backgroundColor: theme.colors.surfaceElevated }, theme.shadows.sm]}
                    placeholder="Ask me anything about cooking..."
                    placeholderTextColor={theme.colors.text.tertiary}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={500}
                    editable={!loading}
                />
                {loading ? (
                    <AnimatedPressable
                        style={[
                            styles.stopButton, 
                            theme.shadows.md,
                            { 
                                backgroundColor: theme.colors.error, 
                            }
                        ]}
                        onPress={handleStopGeneration}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Stop generating"
                    >
                        <Ionicons name="stop-circle" size={22} color="#FFFFFF" />
                        <Text style={styles.stopButtonText}>Stop</Text>
                    </AnimatedPressable>
                ) : (
                    <AnimatedPressable
                        style={[
                            styles.sendButton, 
                            theme.shadows.glow,
                            { 
                                backgroundColor: theme.primary[500], 
                                opacity: !inputText.trim() ? 0.5 : 1,
                            }
                        ]}
                        onPress={handleSendMessage}
                        disabled={!inputText.trim()}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Send message"
                        accessibilityState={{ disabled: !inputText.trim() }}
                    >
                        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                    </AnimatedPressable>
                )}
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    helpersPanel: {
        borderBottomWidth: 1,
    },
    helpersHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 44,
    },
    helpersHeaderTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    helpersBody: {
        overflow: 'hidden',
        position: 'relative',
    },
    helpersBodyShut: {
        height: 0,
        opacity: 0,
    },
    helpersMeasure: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
    },
    quickActions: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    quickActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
        gap: 6,
    },
    quickActionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    messagesList: {
        padding: 16,
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 14,
        borderRadius: 20,
        marginBottom: 12,
    },
    userBubble: {
        alignSelf: 'flex-end',
        borderBottomRightRadius: 4,
    },
    assistantBubble: {
        alignSelf: 'flex-start',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
    },
    saveRecipeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        marginTop: 12,
        gap: 6,
    },
    saveRecipeText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 12,
        borderTopWidth: 1,
        alignItems: 'flex-end',
        gap: 10,
    },
    input: {
        flex: 1,
        minHeight: 52,
        maxHeight: 120,
        borderRadius: 26,
        paddingHorizontal: 18,
        paddingVertical: 14,
        fontSize: 15,
    },
    stopButton: {
        height: 52,
        minWidth: 96,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        paddingHorizontal: 18,
        gap: 6,
    },
    stopButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
    sendButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    sendButtonText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '600',
    },
    recipeSelectorScroll: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 12,
    },
    recipeSelectorNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    recipeSelectorNoticeText: {
        fontSize: 13,
        flexShrink: 1,
    },
    recipeBubble: {
        width: 120,
        marginRight: 12,
        padding: 8,
    },
    recipeBubbleImage: {
        width: '100%',
        height: 80,
        borderRadius: 12,
        marginBottom: 8,
        backgroundColor: '#f0f0f0',
    },
    recipeBubblePlaceholder: {
        width: '100%',
        height: 80,
        borderRadius: 12,
        marginBottom: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    recipeBubbleTitle: {
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default AiChefScreen;
