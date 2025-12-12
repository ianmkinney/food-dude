import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    Alert,
    Modal,
    ScrollView,
    Linking,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { partyOperations, partyMealOperations, partyMemberOperations, recipeOperations, userOperations, partyMealIngredientClaimOperations, pantryOperations } from '../database/operations';
import aiChefService from '../services/aiChefService';

const PartyScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [parties, setParties] = useState([]);
    const [selectedParty, setSelectedParty] = useState(null);
    const [meals, setMeals] = useState([]);
    const [showCreatePartyModal, setShowCreatePartyModal] = useState(false);
    const [showCreateMealModal, setShowCreateMealModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [newPartyName, setNewPartyName] = useState('');
    const [newPartyDescription, setNewPartyDescription] = useState('');
    const [newMealName, setNewMealName] = useState('');
    const [newMealDescription, setNewMealDescription] = useState('');
    const [selectedRecipes, setSelectedRecipes] = useState([]);
    const [availableRecipes, setAvailableRecipes] = useState([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [showMealDetailModal, setShowMealDetailModal] = useState(false);
    const [selectedMeal, setSelectedMeal] = useState(null);
    const [editingMealName, setEditingMealName] = useState('');
    const [editingMealDescription, setEditingMealDescription] = useState('');
    const [editingMealRecipes, setEditingMealRecipes] = useState([]);
    const [mealRecipeDetails, setMealRecipeDetails] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [showIngredientClaiming, setShowIngredientClaiming] = useState(false);
    const [allMealIngredients, setAllMealIngredients] = useState([]);
    const [pantryMatches, setPantryMatches] = useState({});
    const [ingredientClaims, setIngredientClaims] = useState([]);
    const [partyMembers, setPartyMembers] = useState([]);
    const [userColors, setUserColors] = useState({});
    const [estimatingCosts, setEstimatingCosts] = useState(false);
    const [matchingIngredients, setMatchingIngredients] = useState(false);
    const [matchingStatus, setMatchingStatus] = useState('');
    const [estimatingStatus, setEstimatingStatus] = useState('');

    useFocusEffect(
        useCallback(() => {
            loadCurrentUser();
            loadParties();
        }, [])
    );

    const loadCurrentUser = async () => {
        try {
            const user = await userOperations.getCurrent();
            setCurrentUser(user);
        } catch (error) {
            console.error('Error loading current user:', error);
        }
    };

    useEffect(() => {
        if (selectedParty) {
            loadMeals(selectedParty.id);
            loadPartyMembers(selectedParty.id);
        }
    }, [selectedParty]);

    const loadPartyMembers = async (partyId) => {
        try {
            const members = await partyMemberOperations.getByPartyId(partyId);
            setPartyMembers(members);
            
            // Assign random colors to users
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
            const colorMap = {};
            members.forEach((member, index) => {
                colorMap[member.user_id] = colors[index % colors.length];
            });
            setUserColors(colorMap);
        } catch (error) {
            console.error('Error loading party members:', error);
        }
    };

    const loadParties = async () => {
        try {
            const allParties = await partyOperations.getAll();
            setParties(allParties);
            if (allParties.length > 0 && !selectedParty) {
                setSelectedParty(allParties[0]);
            }
        } catch (error) {
            console.error('Error loading parties:', error);
        }
    };

    const loadMeals = async (partyId) => {
        try {
            const partyMeals = await partyMealOperations.getByPartyId(partyId);
            setMeals(partyMeals);
        } catch (error) {
            console.error('Error loading meals:', error);
        }
    };

    const handleCreateParty = async () => {
        if (!newPartyName.trim()) {
            Alert.alert('Error', 'Please enter a party name');
            return;
        }

        try {
            const user = currentUser || await userOperations.getCurrent();
            if (!user) {
                Alert.alert('Error', 'User not found. Please set up your account first.');
                return;
            }

            const partyId = await partyOperations.create({
                name: newPartyName.trim(),
                description: newPartyDescription.trim() || null,
                createdBy: user.user_id,
            });
            
            // Add creator as owner member
            await partyMemberOperations.add({
                partyId: partyId,
                userId: user.user_id,
                userName: user.name || user.username || 'You',
                role: 'owner',
            });
            
            setNewPartyName('');
            setNewPartyDescription('');
            setShowCreatePartyModal(false);
            await loadParties();
            Alert.alert('Success', 'Party created!');
        } catch (error) {
            console.error('Error creating party:', error);
            Alert.alert('Error', 'Failed to create party');
        }
    };

    const handleDisbandParty = async () => {
        if (!selectedParty) {
            Alert.alert('Error', 'No party selected');
            return;
        }

        // TODO: Re-enable ownership check when ready
        // Currently allowing anyone to disband for testing purposes
        // 
        // OWNERSHIP CHECK CODE (COMMENTED OUT - TO RE-ENABLE LATER):
        // 
        // // Ensure we have the current user
        // let user = currentUser;
        // if (!user) {
        //     try {
        //         user = await userOperations.getCurrent();
        //         if (user) {
        //             setCurrentUser(user);
        //         }
        //     } catch (error) {
        //         console.error('Error loading user:', error);
        //     }
        // }
        // 
        // if (!user) {
        //     Alert.alert('Error', 'User not found. Please set up your account first.');
        //     return;
        // }
        // 
        // // Check ownership - try multiple methods
        // const partyCreatedBy = selectedParty.created_by;
        // const userId = user.user_id;
        // 
        // // Method 1: Check created_by field
        // let isOwner = false;
        // if (partyCreatedBy && userId) {
        //     isOwner = String(partyCreatedBy).trim() === String(userId).trim();
        // }
        // 
        // // Method 2: Check if user is owner in party_members table (fallback)
        // if (!isOwner) {
        //     try {
        //         const members = await partyMemberOperations.getByPartyId(selectedParty.id);
        //         const ownerMember = members.find(m => 
        //             String(m.user_id).trim() === String(userId).trim() && m.role === 'owner'
        //         );
        //         isOwner = !!ownerMember;
        //     } catch (error) {
        //         console.error('Error checking party membership:', error);
        //     }
        // }
        // 
        // // If still not owner and created_by is null/empty, allow if user is the only member
        // if (!isOwner && (!partyCreatedBy || partyCreatedBy === '' || partyCreatedBy === null)) {
        //     try {
        //         const members = await partyMemberOperations.getByPartyId(selectedParty.id);
        //         if (members.length === 1 && String(members[0].user_id).trim() === String(userId).trim()) {
        //             isOwner = true;
        //         }
        //     } catch (error) {
        //         console.error('Error checking party membership:', error);
        //     }
        // }
        // 
        // if (!isOwner) {
        //     Alert.alert(
        //         'Permission Denied',
        //         'Only the party owner can disband the party.\n\n' +
        //         `Party created by: ${partyCreatedBy || 'Unknown'}\n` +
        //         `Your user ID: ${userId}`
        //     );
        //     return;
        // }

        Alert.alert(
            'Disband Party',
            `Are you sure you want to disband "${selectedParty.name}"? This will delete the party and all its meals. This action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disband',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await partyOperations.delete(selectedParty.id);
                            setSelectedParty(null);
                            await loadParties();
                            Alert.alert('Success', 'Party disbanded');
                        } catch (error) {
                            console.error('Error disbanding party:', error);
                            Alert.alert('Error', `Failed to disband party: ${error.message || 'Unknown error'}`);
                        }
                    },
                },
            ]
        );
    };

    const handleCreateMeal = async () => {
        if (!selectedParty) {
            Alert.alert('Error', 'Please select a party first');
            return;
        }

        if (!newMealName.trim()) {
            Alert.alert('Error', 'Please enter a meal name');
            return;
        }

        if (selectedRecipes.length === 0) {
            Alert.alert('Error', 'Please select at least one recipe');
            return;
        }

        try {
            await partyMealOperations.create({
                partyId: selectedParty.id,
                name: newMealName.trim(),
                description: newMealDescription.trim() || null,
                recipeIds: selectedRecipes,
                createdBy: 'current_user',
            });
            setNewMealName('');
            setNewMealDescription('');
            setSelectedRecipes([]);
            setShowCreateMealModal(false);
            await loadMeals(selectedParty.id);
            Alert.alert('Success', 'Meal created!');
        } catch (error) {
            console.error('Error creating meal:', error);
            Alert.alert('Error', 'Failed to create meal');
        }
    };

    const handleInviteFriend = async () => {
        if (!inviteEmail.trim()) {
            Alert.alert('Error', 'Please enter an email address');
            return;
        }

        if (!selectedParty) {
            Alert.alert('Error', 'Please select a party first');
            return;
        }

        try {
            // Get current user for the invite message
            const currentUser = await userOperations.getCurrent();
            const userName = currentUser?.name || currentUser?.username || 'A friend';
            const appName = 'Food Dude';
            
            // Create email subject and body
            const subject = `Join my party "${selectedParty.name}" on ${appName}!`;
            const body = `Hi there!

${userName} has invited you to join their party "${selectedParty.name}" on ${appName}!

${selectedParty.description ? `About this party:\n${selectedParty.description}\n\n` : ''}To join this party:
1. Download the ${appName} app
2. Open the app and go to the Party section
3. Look for the party "${selectedParty.name}"

We're planning some amazing meals together and would love to have you join us!

Happy cooking!
${userName}`;

            // Create mailto link
            const emailUrl = `mailto:${inviteEmail.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            
            // Check if we can open the email client
            const canOpen = await Linking.canOpenURL(emailUrl);
            
            if (canOpen) {
                await Linking.openURL(emailUrl);
                Alert.alert(
                    'Invitation Ready',
                    `An email invitation has been prepared for ${inviteEmail}. Please send it from your email app.`,
                    [{ text: 'OK' }]
                );
            } else {
                // Fallback: show the email content so user can copy it
                Alert.alert(
                    'Email Invitation',
                    `To invite ${inviteEmail}:\n\nSubject: ${subject}\n\nBody:\n${body}\n\nPlease copy this and send it manually.`,
                    [{ text: 'OK' }]
                );
            }
            
            setInviteEmail('');
            setShowInviteModal(false);
        } catch (error) {
            console.error('Error sending invite:', error);
            Alert.alert('Error', 'Failed to prepare invitation email');
        }
    };

    const loadRecipesForMeal = async () => {
        try {
            const recipes = await recipeOperations.getAll();
            setAvailableRecipes(recipes);
        } catch (error) {
            console.error('Error loading recipes:', error);
        }
    };

    const toggleRecipeSelection = (recipeId) => {
        setSelectedRecipes(prev =>
            prev.includes(recipeId)
                ? prev.filter(id => id !== recipeId)
                : [...prev, recipeId]
        );
    };

    const handleMealPress = async (meal) => {
        setSelectedMeal(meal);
        setEditingMealName(meal.name);
        setEditingMealDescription(meal.description || '');
        setEditingMealRecipes(meal.recipeIds || []);
        
        // Load available recipes
        await loadRecipesForMeal();
        
        // Load recipe details for display
        try {
            const recipeDetails = await Promise.all(
                (meal.recipeIds || []).map(async (recipeId) => {
                    try {
                        const recipe = await recipeOperations.getById(recipeId);
                        return recipe;
                    } catch (error) {
                        console.error(`Error loading recipe ${recipeId}:`, error);
                        return null;
                    }
                })
            );
            setMealRecipeDetails(recipeDetails.filter(r => r !== null));
            
            // Extract all ingredients from all recipes
            const allIngredients = [];
            recipeDetails.forEach(recipe => {
                if (recipe && recipe.ingredients) {
                    recipe.ingredients.forEach(ing => {
                        allIngredients.push({
                            ...ing,
                            recipeId: recipe.id,
                            recipeTitle: recipe.title,
                        });
                    });
                }
            });
            setAllMealIngredients(allIngredients);
            
            // Load existing claims
            const claims = await partyMealIngredientClaimOperations.getClaimsByPartyMeal(meal.id);
            setIngredientClaims(claims);
        } catch (error) {
            console.error('Error loading recipe details:', error);
            setMealRecipeDetails([]);
        }
        
        setShowMealDetailModal(true);
    };

    const handleSeeWhatIHave = async () => {
        try {
            // Load user's pantry
            const pantryItems = await pantryOperations.getAll();
            
            if (pantryItems.length === 0) {
                Alert.alert('Empty Pantry', 'Your pantry is empty. Add items to your pantry first.');
                return;
            }
            
            setMatchingIngredients(true);
            setMatchingStatus('Analyzing ingredients...');
            
            // Use AI for intelligent matching
            const matches = {};
            
            // Prepare ingredient list for AI
            const ingredientList = allMealIngredients.map(ing => 
                `${ing.quantity || ''} ${ing.unit || ''} ${ing.ingredient}`.trim()
            ).join(', ');
            
            const pantryList = pantryItems.map(item => item.name).join(', ');
            
            try {
                setMatchingStatus('Matching with AI...');
                // Use AI to intelligently match ingredients
                const matchResult = await aiChefService.matchIngredientsWithPantry(
                    ingredientList,
                    pantryList
                );
                
                setMatchingStatus('Processing results...');
                
                if (matchResult.success && matchResult.matches) {
                    // Process AI results - create a map for quick lookup
                    const matchMap = {};
                    matchResult.matches.forEach(match => {
                        matchMap[match.ingredient.toLowerCase().trim()] = match.hasMatch;
                    });
                    
                    // Apply matches to ingredients
                    allMealIngredients.forEach(ing => {
                        const ingredientName = ing.ingredient.toLowerCase().trim();
                        // Try exact match first
                        let hasMatch = matchMap[ingredientName];
                        
                        // If no exact match, try partial matching
                        if (hasMatch === undefined) {
                            for (const [matchedIng, matchValue] of Object.entries(matchMap)) {
                                if (ingredientName.includes(matchedIng) || matchedIng.includes(ingredientName)) {
                                    hasMatch = matchValue;
                                    break;
                                }
                            }
                        }
                        
                        matches[ing.ingredient] = hasMatch === true;
                    });
                } else {
                    throw new Error('AI matching failed');
                }
            } catch (aiError) {
                console.error('AI matching error, falling back to simple matching:', aiError);
                setMatchingStatus('Using fallback matching...');
                // Fallback to simple matching if AI fails
                allMealIngredients.forEach(ing => {
                    const ingredientName = ing.ingredient.toLowerCase().trim();
                    const match = pantryItems.find(item => 
                        item.name.toLowerCase().includes(ingredientName) || 
                        ingredientName.includes(item.name.toLowerCase())
                    );
                    matches[ing.ingredient] = match ? true : false;
                });
            }
            
            setPantryMatches(matches);
            setShowIngredientClaiming(true);
            setMatchingStatus('');
        } catch (error) {
            console.error('Error matching pantry:', error);
            Alert.alert('Error', 'Failed to match pantry items');
            setMatchingStatus('');
        } finally {
            setMatchingIngredients(false);
        }
    };

    const handleClaimIngredient = async (ingredientName, recipeId) => {
        if (!currentUser) {
            Alert.alert('Error', 'User not found');
            return;
        }

        try {
            // Check if already claimed
            const existingClaim = ingredientClaims.find(
                c => c.ingredient_name === ingredientName && c.recipe_id === recipeId
            );
            
            if (existingClaim) {
                // Remove claim
                await partyMealIngredientClaimOperations.removeClaim(existingClaim.id);
                setIngredientClaims(prev => prev.filter(c => c.id !== existingClaim.id));
            } else {
                // Add claim
                const claimId = await partyMealIngredientClaimOperations.claimIngredient({
                    partyMealId: selectedMeal.id,
                    recipeId: recipeId,
                    ingredientName: ingredientName,
                    claimedByUserId: currentUser.user_id,
                    claimedByUserName: currentUser.name || currentUser.username || 'You',
                });
                
                const newClaim = {
                    id: claimId,
                    party_meal_id: selectedMeal.id,
                    recipe_id: recipeId,
                    ingredient_name: ingredientName,
                    claimed_by_user_id: currentUser.user_id,
                    claimed_by_user_name: currentUser.name || currentUser.username || 'You',
                };
                setIngredientClaims(prev => [...prev, newClaim]);
            }
            
            // Reload claims to ensure we have latest data
            const updatedClaims = await partyMealIngredientClaimOperations.getClaimsByPartyMeal(selectedMeal.id);
            setIngredientClaims(updatedClaims);
        } catch (error) {
            console.error('Error claiming ingredient:', error);
            Alert.alert('Error', 'Failed to claim ingredient');
        }
    };

    const handleEstimateCosts = async () => {
        if (!selectedMeal) return;
        
        setEstimatingCosts(true);
        setEstimatingStatus('Preparing estimates...');
        try {
            // Group ingredients by user
            const userIngredientLists = {};
            ingredientClaims.forEach(claim => {
                if (!userIngredientLists[claim.claimed_by_user_id]) {
                    userIngredientLists[claim.claimed_by_user_id] = [];
                }
                userIngredientLists[claim.claimed_by_user_id].push({
                    name: claim.ingredient_name,
                    quantity: '1', // Default quantity
                    unit: '',
                });
            });
            
            // Get unclaimed ingredients
            const unclaimedIngredients = allMealIngredients.filter(ing => {
                return !ingredientClaims.some(claim => 
                    claim.ingredient_name === ing.ingredient && claim.recipe_id === ing.recipeId
                );
            });
            
            if (unclaimedIngredients.length > 0) {
                userIngredientLists['unclaimed'] = unclaimedIngredients.map(ing => ({
                    name: ing.ingredient,
                    quantity: ing.quantity || '1',
                    unit: ing.unit || '',
                }));
            }
            
            // Estimate costs for each user
            const costEstimates = {};
            const userCount = Object.keys(userIngredientLists).length;
            let currentUser = 0;
            
            for (const [userId, items] of Object.entries(userIngredientLists)) {
                if (items.length === 0) continue;
                
                currentUser++;
                const userName = userId === 'unclaimed' 
                    ? 'Unclaimed Items' 
                    : partyMembers.find(m => m.user_id === userId)?.user_name || 'Unknown';
                setEstimatingStatus(`Estimating for ${userName} (${currentUser}/${userCount})...`);
                
                try {
                    const estimate = await aiChefService.estimateGroceryCost(items);
                    if (estimate.success) {
                        costEstimates[userId] = estimate.estimate;
                    }
                } catch (error) {
                    console.error(`Error estimating cost for user ${userId}:`, error);
                }
            }
            
            setEstimatingStatus('Finalizing...');
            
            // Display results
            let message = 'Cost Estimates:\n\n';
            Object.entries(costEstimates).forEach(([userId, estimate]) => {
                const userName = userId === 'unclaimed' 
                    ? 'Unclaimed Items' 
                    : partyMembers.find(m => m.user_id === userId)?.user_name || 'Unknown';
                message += `${userName}: $${estimate.total.toFixed(2)}\n`;
            });
            
            Alert.alert('Cost Estimates', message);
            setEstimatingStatus('');
        } catch (error) {
            console.error('Error estimating costs:', error);
            Alert.alert('Error', 'Failed to estimate costs');
            setEstimatingStatus('');
        } finally {
            setEstimatingCosts(false);
        }
    };

    const getIngredientClaimStatus = (ingredientName, recipeId) => {
        const claim = ingredientClaims.find(
            c => c.ingredient_name === ingredientName && c.recipe_id === recipeId
        );
        return claim;
    };

    const getUserIngredientCount = (userId) => {
        return ingredientClaims.filter(c => c.claimed_by_user_id === userId).length;
    };

    const handleSaveMeal = async () => {
        if (!editingMealName.trim()) {
            Alert.alert('Error', 'Please enter a meal name');
            return;
        }

        if (!selectedMeal) return;

        try {
            await partyMealOperations.update(selectedMeal.id, {
                name: editingMealName.trim(),
                description: editingMealDescription.trim() || null,
                recipeIds: editingMealRecipes,
            });
            setShowMealDetailModal(false);
            await loadMeals(selectedParty.id);
            Alert.alert('Success', 'Meal updated!');
        } catch (error) {
            console.error('Error updating meal:', error);
            Alert.alert('Error', 'Failed to update meal');
        }
    };

    const handleDeleteMeal = async () => {
        if (!selectedMeal) return;

        Alert.alert(
            'Delete Meal',
            `Are you sure you want to delete "${selectedMeal.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await partyMealOperations.delete(selectedMeal.id);
                            setShowMealDetailModal(false);
                            await loadMeals(selectedParty.id);
                            Alert.alert('Success', 'Meal deleted!');
                        } catch (error) {
                            console.error('Error deleting meal:', error);
                            Alert.alert('Error', 'Failed to delete meal');
                        }
                    },
                },
            ]
        );
    };

    const toggleEditingMealRecipe = (recipeId) => {
        setEditingMealRecipes(prev =>
            prev.includes(recipeId)
                ? prev.filter(id => id !== recipeId)
                : [...prev, recipeId]
        );
        // Also remove from mealRecipeDetails
        setMealRecipeDetails(prev => prev.filter(r => r.id !== recipeId));
    };


    const renderPartyItem = ({ item }) => (
        <TouchableOpacity
            style={[
                styles.partyItem,
                {
                    backgroundColor: selectedParty?.id === item.id ? theme.primary[500] : theme.colors.surface,
                    borderColor: theme.colors.border,
                },
            ]}
            onPress={() => setSelectedParty(item)}
        >
            <Ionicons
                name="people"
                size={24}
                color={selectedParty?.id === item.id ? '#FFFFFF' : theme.primary[500]}
            />
            <Text
                style={[
                    styles.partyName,
                    { color: selectedParty?.id === item.id ? '#FFFFFF' : theme.colors.text.primary },
                ]}
            >
                {item.name}
            </Text>
        </TouchableOpacity>
    );

    const renderMealItem = ({ item }) => (
        <TouchableOpacity
            style={[styles.mealItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            onPress={() => handleMealPress(item)}
        >
            <View style={styles.mealContent}>
                <Text style={[styles.mealName, { color: theme.colors.text.primary }]}>{item.name}</Text>
                {item.description && (
                    <Text style={[styles.mealDescription, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                        {item.description}
                    </Text>
                )}
                <Text style={[styles.mealRecipes, { color: theme.colors.text.tertiary }]}>
                    {item.recipeIds.length} recipe{item.recipeIds.length !== 1 ? 's' : ''}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text.tertiary} />
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Party List */}
            <View style={[styles.partyListContainer, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                <FlatList
                    data={parties}
                    renderItem={renderPartyItem}
                    keyExtractor={(item) => item.id.toString()}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.partyList}
                    ListEmptyComponent={
                        <View style={styles.emptyPartyList}>
                            <Text style={[styles.emptyText, { color: theme.colors.text.secondary }]}>
                                No parties yet. Create one!
                            </Text>
                        </View>
                    }
                />
                <TouchableOpacity
                    style={[styles.addPartyButton, { backgroundColor: theme.primary[500] }]}
                    onPress={() => setShowCreatePartyModal(true)}
                >
                    <Ionicons name="add" size={24} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            {/* Meals List */}
            {selectedParty ? (
                <View style={styles.mealsContainer}>
                    <View style={styles.mealsHeader}>
                        <Text style={[styles.mealsTitle, { color: theme.colors.text.primary }]}>
                            Meals for {selectedParty.name}
                        </Text>
                        <View style={styles.mealsHeaderButtons}>
                            <TouchableOpacity
                                style={[styles.disbandButton, { backgroundColor: theme.accent.red }]}
                                onPress={handleDisbandParty}
                            >
                                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                                <Text style={styles.disbandButtonText}>Disband</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.inviteButton, { backgroundColor: theme.accent.green }]}
                                onPress={() => setShowInviteModal(true)}
                            >
                                <Ionicons name="person-add" size={18} color="#FFFFFF" />
                                <Text style={styles.inviteButtonText}>Invite</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.addMealButton, { backgroundColor: theme.primary[500] }]}
                                onPress={() => {
                                    loadRecipesForMeal();
                                    setShowCreateMealModal(true);
                                }}
                            >
                                <Ionicons name="add" size={20} color="#FFFFFF" />
                                <Text style={styles.addMealButtonText}>Add Meal</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <FlatList
                        data={meals}
                        renderItem={renderMealItem}
                        keyExtractor={(item) => item.id.toString()}
                        contentContainerStyle={styles.mealsList}
                        ListEmptyComponent={
                            <View style={styles.emptyMeals}>
                                <Ionicons name="restaurant-outline" size={64} color={theme.colors.text.tertiary} />
                                <Text style={[styles.emptyText, { color: theme.colors.text.secondary }]}>
                                    No meals yet. Create one from your recipes!
                                </Text>
                            </View>
                        }
                    />
                </View>
            ) : (
                <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={80} color={theme.colors.text.tertiary} />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text.primary }]}>
                        No Party Selected
                    </Text>
                    <Text style={[styles.emptyDescription, { color: theme.colors.text.secondary }]}>
                        Create a party to start planning meals with friends!
                    </Text>
                </View>
            )}

            {/* Create Party Modal */}
            <Modal
                visible={showCreatePartyModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowCreatePartyModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Create Party</Text>
                        <TextInput
                            style={[styles.modalInput, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Party Name"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={newPartyName}
                            onChangeText={setNewPartyName}
                        />
                        <TextInput
                            style={[styles.modalInput, styles.modalTextArea, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Description (optional)"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={newPartyDescription}
                            onChangeText={setNewPartyDescription}
                            multiline
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.colors.border }]}
                                onPress={() => setShowCreatePartyModal(false)}
                            >
                                <Text style={[styles.modalButtonText, { color: theme.colors.text.primary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.primary[500] }]}
                                onPress={handleCreateParty}
                            >
                                <Text style={styles.modalButtonText}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Create Meal Modal */}
            <Modal
                visible={showCreateMealModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowCreateMealModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Create Meal</Text>
                        <TextInput
                            style={[styles.modalInput, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Meal Name"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={newMealName}
                            onChangeText={setNewMealName}
                        />
                        <TextInput
                            style={[styles.modalInput, styles.modalTextArea, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Description (optional)"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={newMealDescription}
                            onChangeText={setNewMealDescription}
                            multiline
                        />
                        <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Select Recipes:</Text>
                        <FlatList
                            data={availableRecipes}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.recipeSelectItem,
                                        {
                                            backgroundColor: selectedRecipes.includes(item.id) ? theme.primary[100] : theme.colors.background,
                                            borderColor: theme.colors.border,
                                        },
                                    ]}
                                    onPress={() => toggleRecipeSelection(item.id)}
                                >
                                    <Ionicons
                                        name={selectedRecipes.includes(item.id) ? 'checkbox' : 'checkbox-outline'}
                                        size={24}
                                        color={selectedRecipes.includes(item.id) ? theme.primary[500] : theme.colors.text.tertiary}
                                    />
                                    <Text style={[styles.recipeSelectText, { color: theme.colors.text.primary }]}>
                                        {item.title}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            style={styles.recipeSelectList}
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.colors.border }]}
                                onPress={() => setShowCreateMealModal(false)}
                            >
                                <Text style={[styles.modalButtonText, { color: theme.colors.text.primary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.primary[500] }]}
                                onPress={handleCreateMeal}
                            >
                                <Text style={styles.modalButtonText}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Invite Friend Modal */}
            <Modal
                visible={showInviteModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowInviteModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Invite Friend</Text>
                        <TextInput
                            style={[styles.modalInput, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Email Address"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={inviteEmail}
                            onChangeText={setInviteEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.colors.border }]}
                                onPress={() => setShowInviteModal(false)}
                            >
                                <Text style={[styles.modalButtonText, { color: theme.colors.text.primary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: theme.accent.green }]}
                                onPress={handleInviteFriend}
                            >
                                <Text style={styles.modalButtonText}>Send Invite</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Meal Detail/Edit Modal */}
            <Modal
                visible={showMealDetailModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowMealDetailModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, styles.mealDetailModal, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>Meal Details</Text>
                            <TouchableOpacity onPress={() => setShowMealDetailModal(false)}>
                                <Ionicons name="close" size={24} color={theme.colors.text.primary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.mealDetailScroll} showsVerticalScrollIndicator={false}>
                            {/* Meal Name */}
                            <View style={styles.detailSection}>
                                <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>Name</Text>
                                <TextInput
                                    style={[styles.modalInput, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                                    placeholder="Meal Name"
                                    placeholderTextColor={theme.colors.text.tertiary}
                                    value={editingMealName}
                                    onChangeText={setEditingMealName}
                                />
                            </View>

                            {/* Meal Description */}
                            <View style={styles.detailSection}>
                                <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>Description</Text>
                                <TextInput
                                    style={[styles.modalInput, styles.modalTextArea, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                                    placeholder="Description (optional)"
                                    placeholderTextColor={theme.colors.text.tertiary}
                                    value={editingMealDescription}
                                    onChangeText={setEditingMealDescription}
                                    multiline
                                />
                            </View>

                            {/* Ingredient Claiming Section - Always show if there are recipes */}
                            {mealRecipeDetails.length > 0 && (
                                <View style={styles.detailSection}>
                                    <View style={styles.ingredientClaimingHeader}>
                                        <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>
                                            Ingredients
                                        </Text>
                                        <View style={styles.ingredientClaimingButtons}>
                                            <TouchableOpacity
                                                style={[styles.seeWhatIHaveButton, { backgroundColor: theme.primary[500] }]}
                                                onPress={handleSeeWhatIHave}
                                                disabled={matchingIngredients}
                                            >
                                                {matchingIngredients ? (
                                                    <>
                                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                                        <Text style={styles.seeWhatIHaveButtonText}>
                                                            {matchingStatus || 'Matching...'}
                                                        </Text>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                                                        <Text style={styles.seeWhatIHaveButtonText}>See What I Have</Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                            {ingredientClaims.length > 0 && (
                                                <TouchableOpacity
                                                    style={[styles.estimateCostButton, { backgroundColor: theme.accent.purple }]}
                                                    onPress={handleEstimateCosts}
                                                    disabled={estimatingCosts}
                                                >
                                                    {estimatingCosts ? (
                                                        <>
                                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                                            <Text style={styles.estimateCostButtonText}>
                                                                {estimatingStatus || 'Estimating...'}
                                                            </Text>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                                                            <Text style={styles.estimateCostButtonText}>Estimate Costs</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                    
                                    {/* Always show ingredients list if recipes exist, even with one person */}
                                    {allMealIngredients.length > 0 && (
                                        <View style={styles.ingredientsList}>
                                            {allMealIngredients.map((ing, index) => {
                                                const hasInPantry = pantryMatches[ing.ingredient] === true;
                                                const claim = getIngredientClaimStatus(ing.ingredient, ing.recipeId);
                                                const isClaimedByMe = claim && claim.claimed_by_user_id === currentUser?.user_id;
                                                const isClaimedByOther = claim && claim.claimed_by_user_id !== currentUser?.user_id;
                                                const claimerColor = claim ? (userColors[claim.claimed_by_user_id] || theme.primary[500]) : null;
                                                
                                                return (
                                                    <View
                                                        key={`${ing.recipeId}-${ing.ingredient}-${index}`}
                                                        style={[
                                                            styles.ingredientClaimItem,
                                                            {
                                                                backgroundColor: theme.colors.background,
                                                                borderColor: showIngredientClaiming && !hasInPantry 
                                                                    ? '#F44336' 
                                                                    : theme.colors.border,
                                                                borderWidth: showIngredientClaiming && !hasInPantry ? 2 : 1,
                                                            }
                                                        ]}
                                                    >
                                                        <View style={styles.ingredientClaimContent}>
                                                            <View style={styles.ingredientClaimInfo}>
                                                                <Text style={[styles.ingredientClaimName, { color: theme.colors.text.primary }]}>
                                                                    {ing.quantity || ''} {ing.unit || ''} {ing.ingredient}
                                                                </Text>
                                                                <Text style={[styles.ingredientClaimRecipe, { color: theme.colors.text.secondary }]}>
                                                                    from {ing.recipeTitle}
                                                                </Text>
                                                            </View>
                                                            {isClaimedByOther && claimerColor && (
                                                                <View style={[styles.claimedByBadge, { backgroundColor: claimerColor }]}>
                                                                    <Ionicons name="person" size={12} color="#FFFFFF" />
                                                                    <Text style={styles.claimedByText}>{claim.claimed_by_user_name}</Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.claimButton,
                                                                {
                                                                    backgroundColor: isClaimedByMe 
                                                                        ? theme.accent.green 
                                                                        : isClaimedByOther 
                                                                        ? theme.colors.border 
                                                                        : theme.primary[500]
                                                                }
                                                            ]}
                                                            onPress={() => handleClaimIngredient(ing.ingredient, ing.recipeId)}
                                                            disabled={isClaimedByOther}
                                                        >
                                                            {isClaimedByMe ? (
                                                                <>
                                                                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                                                                    <Text style={styles.claimButtonText}>Claimed</Text>
                                                                </>
                                                            ) : isClaimedByOther ? (
                                                                <Text style={[styles.claimButtonText, { color: theme.colors.text.secondary }]}>Taken</Text>
                                                            ) : (
                                                                <>
                                                                    <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                                                                    <Text style={styles.claimButtonText}>Claim</Text>
                                                                </>
                                                            )}
                                                        </TouchableOpacity>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}

                                    {/* User Summary - Show even with one person if they have claims */}
                                    {ingredientClaims.length > 0 && (() => {
                                        const usersWithClaims = [];
                                        
                                        // Add party members with claims
                                        partyMembers.forEach(member => {
                                            const count = getUserIngredientCount(member.user_id);
                                            if (count > 0) {
                                                usersWithClaims.push({
                                                    id: member.id,
                                                    userId: member.user_id,
                                                    name: member.user_name || 'Unknown',
                                                    count: count,
                                                    color: userColors[member.user_id] || theme.primary[500],
                                                });
                                            }
                                        });
                                        
                                        // Add current user if not in party members but has claims
                                        if (currentUser) {
                                            const currentUserInMembers = partyMembers.some(m => m.user_id === currentUser.user_id);
                                            if (!currentUserInMembers) {
                                                const count = getUserIngredientCount(currentUser.user_id);
                                                if (count > 0) {
                                                    usersWithClaims.push({
                                                        id: 'current',
                                                        userId: currentUser.user_id,
                                                        name: currentUser.name || currentUser.username || 'You',
                                                        count: count,
                                                        color: userColors[currentUser.user_id] || theme.primary[500],
                                                    });
                                                }
                                            }
                                        }
                                        
                                        if (usersWithClaims.length === 0) return null;
                                        
                                        return (
                                            <View style={[styles.userSummaryContainer, { backgroundColor: theme.colors.background }]}>
                                                {usersWithClaims.map(user => (
                                                    <View key={user.id} style={[styles.userSummaryItem, { borderColor: user.color }]}>
                                                        <View style={[styles.userAvatar, { backgroundColor: user.color }]}>
                                                            <Ionicons name="person" size={16} color="#FFFFFF" />
                                                        </View>
                                                        <Text style={[styles.userSummaryText, { color: theme.colors.text.primary }]}>
                                                            {user.name}
                                                        </Text>
                                                        <View style={[styles.userCountBadge, { backgroundColor: user.color }]}>
                                                            <Text style={styles.userCountText}>{user.count}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        );
                                    })()}
                                </View>
                            )}

                            {/* Recipes Section */}
                            <View style={styles.detailSection}>
                                <View style={styles.recipesHeader}>
                                    <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>
                                        Recipes ({editingMealRecipes.length})
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.addRecipeButton, { backgroundColor: theme.primary[500] }]}
                                        onPress={async () => {
                                            await loadRecipesForMeal();
                                        }}
                                    >
                                        <Ionicons name="add" size={18} color="#FFFFFF" />
                                        <Text style={styles.addRecipeButtonText}>Add</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Current Recipes */}
                                {mealRecipeDetails.length > 0 ? (
                                    <View style={styles.recipesList}>
                                        {mealRecipeDetails.map((recipe) => (
                                            <View
                                                key={recipe.id}
                                                style={[styles.recipeDetailItem, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                                            >
                                                <View style={styles.recipeDetailContent}>
                                                    <Text style={[styles.recipeDetailName, { color: theme.colors.text.primary }]}>
                                                        {recipe.title}
                                                    </Text>
                                                    {recipe.description && (
                                                        <Text style={[styles.recipeDetailDesc, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                                                            {recipe.description}
                                                        </Text>
                                                    )}
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => toggleEditingMealRecipe(recipe.id)}
                                                    style={styles.removeRecipeButton}
                                                >
                                                    <Ionicons
                                                        name="close-circle"
                                                        size={24}
                                                        color={theme.accent.red}
                                                    />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <Text style={[styles.emptyRecipesText, { color: theme.colors.text.tertiary }]}>
                                        No recipes in this meal
                                    </Text>
                                )}

                                {/* Available Recipes to Add */}
                                {availableRecipes.length > 0 && (
                                    <View style={styles.detailSection}>
                                        <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>
                                            Available Recipes ({availableRecipes.filter(r => !editingMealRecipes.includes(r.id)).length})
                                        </Text>
                                        <FlatList
                                            data={availableRecipes.filter(r => !editingMealRecipes.includes(r.id))}
                                            keyExtractor={(item) => item.id.toString()}
                                            renderItem={({ item }) => (
                                                <TouchableOpacity
                                                    style={[styles.recipeSelectItem, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
                                                    onPress={async () => {
                                                        if (!editingMealRecipes.includes(item.id)) {
                                                            setEditingMealRecipes([...editingMealRecipes, item.id]);
                                                            // Load recipe details
                                                            try {
                                                                const recipe = await recipeOperations.getById(item.id);
                                                                if (recipe) {
                                                                    setMealRecipeDetails(prev => [...prev, recipe]);
                                                                    
                                                                    // Update ingredients list
                                                                    if (recipe.ingredients) {
                                                                        const newIngredients = recipe.ingredients.map(ing => ({
                                                                            ...ing,
                                                                            recipeId: recipe.id,
                                                                            recipeTitle: recipe.title,
                                                                        }));
                                                                        setAllMealIngredients(prev => [...prev, ...newIngredients]);
                                                                    }
                                                                }
                                                            } catch (error) {
                                                                console.error('Error loading recipe:', error);
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <Ionicons name="add-circle-outline" size={24} color={theme.primary[500]} />
                                                    <Text style={[styles.recipeSelectText, { color: theme.colors.text.primary }]}>
                                                        {item.title}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                            style={styles.recipeSelectList}
                                            ListEmptyComponent={
                                                <Text style={[styles.emptyRecipesText, { color: theme.colors.text.tertiary }]}>
                                                    All available recipes are already in this meal
                                                </Text>
                                            }
                                        />
                                    </View>
                                )}
                            </View>
                        </ScrollView>

                        {/* Action Buttons */}
                        <View style={[styles.mealDetailActions, { borderTopColor: theme.colors.border }]}>
                            <TouchableOpacity
                                style={[styles.deleteButton, { backgroundColor: theme.accent.red }]}
                                onPress={handleDeleteMeal}
                            >
                                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                                <Text style={styles.deleteButtonText}>Delete</Text>
                            </TouchableOpacity>
                            <View style={styles.saveCancelButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, { backgroundColor: theme.colors.border }]}
                                    onPress={() => {
                                        // Reset to original values
                                        if (selectedMeal) {
                                            setEditingMealName(selectedMeal.name);
                                            setEditingMealDescription(selectedMeal.description || '');
                                            setEditingMealRecipes(selectedMeal.recipeIds || []);
                                        }
                                        setShowMealDetailModal(false);
                                    }}
                                >
                                    <Text style={[styles.modalButtonText, { color: theme.colors.text.primary }]}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, { backgroundColor: theme.primary[500] }]}
                                    onPress={handleSaveMeal}
                                >
                                    <Text style={styles.modalButtonText}>Save</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    partyListContainer: {
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        alignItems: 'center',
    },
    partyList: {
        paddingRight: 12,
    },
    partyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        marginRight: 8,
        gap: 8,
    },
    partyName: {
        fontSize: 16,
        fontWeight: '600',
    },
    addPartyButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyPartyList: {
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    mealsContainer: {
        flex: 1,
    },
    mealsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    mealsTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        flex: 1,
    },
    mealsHeaderButtons: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    inviteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    inviteButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    disbandButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    disbandButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    addMealButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    addMealButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    mealsList: {
        padding: 16,
    },
    mealItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
    },
    mealContent: {
        flex: 1,
    },
    mealName: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4,
    },
    mealDescription: {
        fontSize: 14,
        marginBottom: 4,
    },
    mealRecipes: {
        fontSize: 12,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyMeals: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
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
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
        maxHeight: '90%',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    modalInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 16,
    },
    modalTextArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    recipeSelectList: {
        maxHeight: 200,
        marginBottom: 16,
    },
    recipeSelectItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 8,
        gap: 12,
    },
    recipeSelectText: {
        fontSize: 16,
        flex: 1,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    mealDetailModal: {
        maxHeight: '95%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    mealDetailScroll: {
        maxHeight: 500,
    },
    detailSection: {
        marginBottom: 24,
    },
    detailLabel: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    recipesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    addRecipeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4,
    },
    addRecipeButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    recipesList: {
        marginBottom: 16,
    },
    recipeDetailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 8,
    },
    recipeDetailContent: {
        flex: 1,
    },
    recipeDetailName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    recipeDetailDesc: {
        fontSize: 14,
    },
    removeRecipeButton: {
        padding: 4,
    },
    emptyRecipesText: {
        fontSize: 14,
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 16,
    },
    mealDetailActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    deleteButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    saveCancelButtons: {
        flexDirection: 'row',
        gap: 12,
        flex: 1,
        justifyContent: 'flex-end',
    },
    ingredientClaimingHeader: {
        marginBottom: 12,
    },
    ingredientClaimingButtons: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    seeWhatIHaveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    seeWhatIHaveButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    estimateCostButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    estimateCostButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    userSummaryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
        padding: 12,
        borderRadius: 8,
    },
    userSummaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 2,
        gap: 6,
    },
    userAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    userSummaryText: {
        fontSize: 12,
        fontWeight: '600',
    },
    userCountBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    userCountText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    ingredientsList: {
        marginTop: 12,
    },
    ingredientClaimItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 8,
        borderWidth: 2,
        marginBottom: 8,
    },
    ingredientClaimContent: {
        flex: 1,
        marginRight: 12,
    },
    ingredientClaimInfo: {
        marginBottom: 4,
    },
    ingredientClaimName: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    ingredientClaimRecipe: {
        fontSize: 12,
    },
    claimedByBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
        alignSelf: 'flex-start',
        marginTop: 4,
    },
    claimedByText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '600',
    },
    claimButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 4,
    },
    claimButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
});

export default PartyScreen;
