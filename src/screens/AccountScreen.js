import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { userOperations, partyStatsOperations, recipeCookingHistoryOperations } from '../database/operations';

const AccountScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [user, setUser] = useState(null);
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [flavorPreferences, setFlavorPreferences] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [recipesCooked, setRecipesCooked] = useState(0);
    const [partyMembersJoined, setPartyMembersJoined] = useState(0);

    useEffect(() => {
        loadUser();
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const currentUser = await userOperations.getCurrent();
            if (currentUser) {
                // Get recipes cooked count
                const cookedCount = await recipeCookingHistoryOperations.getTotalCookedCount();
                setRecipesCooked(cookedCount);
                
                // Get party members joined count
                const membersCount = await partyStatsOperations.getTotalMembersJoined(currentUser.user_id);
                setPartyMembersJoined(membersCount);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const loadUser = async () => {
        try {
            let currentUser = await userOperations.getCurrent();
            if (!currentUser) {
                // Create default user
                const userId = 'user_' + Date.now();
                await userOperations.upsert({
                    userId,
                    name: 'Food Dude User',
                    email: null,
                });
                currentUser = await userOperations.getByUserId(userId);
            }
            setUser(currentUser);
            setName(currentUser.name || '');
            setUsername(currentUser.username || '');
            setEmail(currentUser.email || '');
            setFlavorPreferences(currentUser.flavor_preferences || '');
        } catch (error) {
            console.error('Error loading user:', error);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter your name');
            return;
        }

        try {
            await userOperations.upsert({
                userId: user.user_id,
                name: name.trim(),
                username: username.trim() || null,
                email: email.trim() || null,
                flavorPreferences: flavorPreferences.trim() || null,
            });
            setIsEditing(false);
            await loadUser();
            await loadStats();
            Alert.alert('Success', 'Profile updated!');
        } catch (error) {
            console.error('Error saving user:', error);
            Alert.alert('Error', 'Failed to update profile');
        }
    };

    const handleCancel = () => {
        setName(user?.name || '');
        setUsername(user?.username || '');
        setEmail(user?.email || '');
        setFlavorPreferences(user?.flavor_preferences || '');
        setIsEditing(false);
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Profile Header */}
            <View style={[styles.profileHeader, { backgroundColor: theme.colors.surface }]}>
                <View style={[styles.avatarContainer, { backgroundColor: theme.primary[100] }]}>
                    {user?.avatar_uri ? (
                        <Image source={{ uri: user.avatar_uri }} style={styles.avatar} />
                    ) : (
                        <Ionicons name="person" size={64} color={theme.primary[500]} />
                    )}
                </View>
                {!isEditing && (
                    <TouchableOpacity
                        style={[styles.editButton, { backgroundColor: theme.primary[500] }]}
                        onPress={() => setIsEditing(true)}
                    >
                        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.editButtonText}>Edit Profile</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Stats Section */}
            <View style={[styles.statsContainer, { backgroundColor: theme.colors.surface }]}>
                <View style={styles.statItem}>
                    <Ionicons name="restaurant" size={32} color={theme.primary[500]} />
                    <Text style={[styles.statValue, { color: theme.colors.text.primary }]}>{recipesCooked}</Text>
                    <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>Recipes Cooked</Text>
                </View>
                <View style={styles.statItem}>
                    <Ionicons name="people" size={32} color={theme.primary[500]} />
                    <Text style={[styles.statValue, { color: theme.colors.text.primary }]}>{partyMembersJoined}</Text>
                    <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>Party Members</Text>
                </View>
            </View>

            {/* Profile Form */}
            <View style={styles.formContainer}>
                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Name</Text>
                    {isEditing ? (
                        <TextInput
                            style={[styles.input, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Enter your name"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={name}
                            onChangeText={setName}
                        />
                    ) : (
                        <Text style={[styles.value, { color: theme.colors.text.primary }]}>
                            {user?.name || 'Not set'}
                        </Text>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Username</Text>
                    {isEditing ? (
                        <TextInput
                            style={[styles.input, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Enter your username"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                        />
                    ) : (
                        <Text style={[styles.value, { color: theme.colors.text.primary }]}>
                            {user?.username || 'Not set'}
                        </Text>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Email</Text>
                    {isEditing ? (
                        <TextInput
                            style={[styles.input, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="Enter your email"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    ) : (
                        <Text style={[styles.value, { color: theme.colors.text.primary }]}>
                            {user?.email || 'Not set'}
                        </Text>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Flavor Preferences</Text>
                    {isEditing ? (
                        <TextInput
                            style={[styles.input, styles.textArea, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="e.g., Spicy, Sweet, Savory, Vegetarian, etc."
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={flavorPreferences}
                            onChangeText={setFlavorPreferences}
                            multiline
                            numberOfLines={3}
                        />
                    ) : (
                        <Text style={[styles.value, { color: theme.colors.text.primary }]}>
                            {user?.flavor_preferences || 'Not set'}
                        </Text>
                    )}
                </View>

                {isEditing && (
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton, { backgroundColor: theme.colors.border }]}
                            onPress={handleCancel}
                        >
                            <Text style={[styles.buttonText, { color: theme.colors.text.primary }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, styles.saveButton, { backgroundColor: theme.primary[500] }]}
                            onPress={handleSave}
                        >
                            <Text style={styles.buttonText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Settings Section */}
            <View style={styles.settingsContainer}>
                <Text style={[styles.settingsTitle, { color: theme.colors.text.primary }]}>Settings</Text>
                
                <TouchableOpacity
                    style={[styles.settingItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPress={() => Alert.alert('Coming Soon', 'This feature will be available soon')}
                >
                    <Ionicons name="notifications-outline" size={24} color={theme.colors.text.primary} />
                    <Text style={[styles.settingText, { color: theme.colors.text.primary }]}>Notifications</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.text.tertiary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.settingItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPress={() => Alert.alert('Coming Soon', 'This feature will be available soon')}
                >
                    <Ionicons name="shield-outline" size={24} color={theme.colors.text.primary} />
                    <Text style={[styles.settingText, { color: theme.colors.text.primary }]}>Privacy</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.text.tertiary} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.settingItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPress={() => Alert.alert('About', 'Food Dude v1.0.0\n\nYour personal cooking assistant!')}
                >
                    <Ionicons name="information-circle-outline" size={24} color={theme.colors.text.primary} />
                    <Text style={[styles.settingText, { color: theme.colors.text.primary }]}>About</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.text.tertiary} />
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    profileHeader: {
        alignItems: 'center',
        paddingTop: 40,
        paddingBottom: 24,
        paddingHorizontal: 24,
    },
    avatarContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    editButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    formContainer: {
        padding: 24,
    },
    section: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    value: {
        fontSize: 16,
        paddingVertical: 4,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    button: {
        flex: 1,
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        // Styled via backgroundColor
    },
    saveButton: {
        // Styled via backgroundColor
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    settingsContainer: {
        padding: 24,
        paddingTop: 0,
    },
    settingsTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 12,
        gap: 12,
    },
    settingText: {
        flex: 1,
        fontSize: 16,
    },
    statsContainer: {
        flexDirection: 'row',
        padding: 24,
        marginHorizontal: 24,
        marginTop: 16,
        borderRadius: 16,
        gap: 24,
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 32,
        fontWeight: 'bold',
        marginTop: 8,
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 14,
        textAlign: 'center',
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
});

export default AccountScreen;
