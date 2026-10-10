import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    Alert,
    Image,
    Linking,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { userOperations, partyStatsOperations, recipeCookingHistoryOperations } from '../database/operations';
import AiProviderSettings from '../components/AiProviderSettings';
import VoicePreferences from '../components/VoicePreferences';
import TextSizeSettings from '../components/TextSizeSettings';
import DataSharingSettings from '../components/DataSharingSettings';
import OwnerSignInSettings from '../components/OwnerSignInSettings';
import { isOwnerSignInConfigured } from '../platform/ownerSignInConfig';
import AccountAboutSheet from '../components/AccountAboutSheet';
import ElevatedCard from '../components/ElevatedCard';
import { PRIVACY_URL } from '../consent/consentStore';
import AnimatedPressable from '../components/AnimatedPressable';
import { BrandMark } from '../components/Brand';
import { useMonetization } from '../monetization/MonetizationContext';
import { USER_SAFETY_SUMMARY, USER_SAFETY_TITLE } from '../constants/userSafety';

const DEFAULT_USER_NAME = 'AmpliFood Cook';
// Untouched placeholder from before the rebrand; real names are left alone.
const LEGACY_DEFAULT_USER_NAME = 'Food Dude User';

const AccountScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const monetization = useMonetization();
    const [user, setUser] = useState(null);
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [flavorPreferences, setFlavorPreferences] = useState('');
    const [allergies, setAllergies] = useState('');
    const [diet, setDiet] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [recipesCooked, setRecipesCooked] = useState(0);
    const [partyMembersJoined, setPartyMembersJoined] = useState(0);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [aiPrivacySectionY, setAiPrivacySectionY] = useState(0);
    const scrollRef = useRef(null);

    const openPrivacy = useCallback(() => {
        Linking.openURL(PRIVACY_URL);
        if (aiPrivacySectionY > 0 && scrollRef.current) {
            scrollRef.current.scrollTo({ y: Math.max(0, aiPrivacySectionY - 12), animated: true });
        }
    }, [aiPrivacySectionY]);

    useFocusEffect(
        useCallback(() => {
            if (Platform.OS === 'web' && typeof document !== 'undefined') {
                const active = document.activeElement;
                if (active instanceof HTMLElement && active !== document.body) {
                    active.blur();
                }
            }
        }, [])
    );

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
            if (currentUser?.name === LEGACY_DEFAULT_USER_NAME) {
                await userOperations.upsert({
                    userId: currentUser.user_id,
                    name: DEFAULT_USER_NAME,
                    username: currentUser.username,
                    email: currentUser.email,
                    avatarUri: currentUser.avatar_uri,
                    recipesCooked: currentUser.recipes_cooked,
                    flavorPreferences: currentUser.flavor_preferences,
                });
                currentUser = await userOperations.getByUserId(currentUser.user_id);
            }
            if (!currentUser) {
                // Create default user
                const userId = 'user_' + Date.now();
                await userOperations.upsert({
                    userId,
                    name: DEFAULT_USER_NAME,
                    email: null,
                });
                currentUser = await userOperations.getByUserId(userId);
            }
            setUser(currentUser);
            setName(currentUser.name || '');
            setUsername(currentUser.username || '');
            setEmail(currentUser.email || '');
            setFlavorPreferences(currentUser.flavor_preferences || '');
            setAllergies(currentUser.allergies || '');
            setDiet(currentUser.diet || '');
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
                allergies: allergies.trim() || null,
                diet: diet.trim() || null,
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
        setAllergies(user?.allergies || '');
        setDiet(user?.diet || '');
        setIsEditing(false);
    };

    return (
        <ScrollView
            ref={scrollRef}
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
        >
            <ElevatedCard theme={theme} variant="glass" style={styles.profileHeader}>
                <View style={[styles.avatarContainer, { backgroundColor: theme.primary[100] }, theme.shadows.md]}>
                    {user?.avatar_uri ? (
                        <Image source={{ uri: user.avatar_uri }} style={styles.avatar} />
                    ) : (
                        <Ionicons name="person" size={64} color={theme.primary[500]} />
                    )}
                </View>
                {!isEditing && (
                    <AnimatedPressable
                        style={[styles.editButton, { backgroundColor: theme.primary[500] }, theme.shadows.glow]}
                        onPress={() => setIsEditing(true)}
                    >
                        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.editButtonText}>Edit Profile</Text>
                    </AnimatedPressable>
                )}
            </ElevatedCard>

            <ElevatedCard theme={theme} variant="elevated" style={styles.statsContainer}>
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
            </ElevatedCard>

            {/* Profile Form */}
            <View style={styles.formContainer}>
                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Name</Text>
                    {isEditing ? (
                        <TextInput accessibilityLabel="Name"
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
                        <TextInput accessibilityLabel="Username"
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
                        <TextInput accessibilityLabel="Email"
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
                        <TextInput accessibilityLabel="Flavor Preferences"
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

                <View style={styles.section}>
                    <Text style={[styles.label, { color: theme.colors.text.secondary }]} nativeID="allergiesLabel" accessibilityRole="header">Allergies & diet</Text>
                    <Text style={[styles.subLabel, { color: theme.colors.text.secondary }]}>Allergies</Text>
                    {isEditing ? (
                        <TextInput
                            style={[styles.input, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="e.g., peanuts, shellfish, sesame"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={allergies}
                            onChangeText={setAllergies}
                            accessibilityLabel="Allergies"
                            accessibilityHint="Separate allergens with commas"
                            accessibilityLabelledBy="allergiesLabel"
                        />
                    ) : (
                        <Text style={[styles.value, { color: theme.colors.text.primary }]}>
                            {user?.allergies || 'None set'}
                        </Text>
                    )}
                    <Text style={[styles.subLabel, { color: theme.colors.text.secondary }]}>Diet needs</Text>
                    {isEditing ? (
                        <TextInput
                            style={[styles.input, { color: theme.colors.text.primary, borderColor: theme.colors.border }]}
                            placeholder="e.g., vegetarian, low sodium, halal"
                            placeholderTextColor={theme.colors.text.tertiary}
                            value={diet}
                            onChangeText={setDiet}
                            accessibilityLabel="Diet needs"
                        />
                    ) : (
                        <Text style={[styles.value, { color: theme.colors.text.primary }]}>
                            {user?.diet || 'None set'}
                        </Text>
                    )}
                    <Text style={[styles.helper, { color: theme.colors.text.tertiary }]}>
                        Used only to steer AI suggestions and flag possible matches. It's stored on this device and sent to your AI provider with recipe requests, with your permission. It can't guarantee a recipe is allergen-free.
                    </Text>
                </View>

                {isEditing && (
                    <View style={styles.buttonContainer}>
                        <AnimatedPressable
                            style={[styles.button, styles.cancelButton, { backgroundColor: theme.colors.border }]}
                            onPress={handleCancel}
                        >
                            <Text style={[styles.buttonText, { color: theme.colors.text.primary }]}>Cancel</Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            style={[styles.button, styles.saveButton, { backgroundColor: theme.primary[500] }, theme.shadows.glow]}
                            onPress={handleSave}
                        >
                            <Text style={styles.buttonText}>Save</Text>
                        </AnimatedPressable>
                    </View>
                )}
            </View>

            <ElevatedCard theme={theme} variant="card" style={styles.safetyCard}>
                <View style={styles.safetyHeader}>
                    <Ionicons name="shield-checkmark-outline" size={22} color={theme.primary[500]} />
                    <Text style={[styles.safetyTitle, { color: theme.colors.text.primary }]}>
                        {USER_SAFETY_TITLE}
                    </Text>
                </View>
                <Text style={[styles.safetyBody, { color: theme.colors.text.secondary }]}>
                    {USER_SAFETY_SUMMARY}
                </Text>
                <Text style={[styles.safetyBody, { color: theme.colors.text.secondary }]}>
                    Your API keys never go to AmpliFood. Profile and flavor preferences stay in the
                    on-device database. AI calls go to the provider you pick in Account, unless you
                    use owner sign-in below (owner only).
                </Text>
            </ElevatedCard>

            {isOwnerSignInConfigured() ? (
                <ElevatedCard theme={theme} variant="card" style={styles.settingsCard}>
                    <OwnerSignInSettings theme={theme} />
                </ElevatedCard>
            ) : null}

            <ElevatedCard theme={theme} variant="card" style={styles.settingsCard}>
                <AiProviderSettings theme={theme} />
            </ElevatedCard>

            <ElevatedCard theme={theme} variant="card" style={styles.settingsCard}>
                <TextSizeSettings theme={theme} />
            </ElevatedCard>

            <ElevatedCard theme={theme} variant="card" style={styles.settingsCard}>
                <VoicePreferences theme={theme} />
            </ElevatedCard>

            <View onLayout={(e) => setAiPrivacySectionY(e.nativeEvent.layout.y)}>
                <ElevatedCard theme={theme} variant="card" style={styles.settingsCard}>
                    <DataSharingSettings theme={theme} />
                </ElevatedCard>
            </View>

            {/* Settings Section */}
            <View style={styles.settingsContainer}>
                <Text style={[styles.settingsTitle, { color: theme.colors.text.primary }]}>Settings</Text>

                <ElevatedCard
                    theme={theme}
                    style={styles.settingItem}
                    tilt={false}
                    onPress={() => navigation.navigate('Paywall')}
                >
                    <Ionicons name="flash-outline" size={24} color={theme.primary[500]} />
                    <Text style={[styles.settingText, { color: theme.colors.text.primary }]}>
                        AmpliFood Plus · {monetization.isPlus ? 'Active' : 'Free plan'}
                        {monetization.balance
                            ? ` · ${monetization.balance.monthlyRemaining + monetization.balance.purchasedRemaining} credits`
                            : ''}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.text.tertiary} />
                </ElevatedCard>
                
                <ElevatedCard
                    theme={theme}
                    style={styles.settingItem}
                    tilt={false}
                    onPress={openPrivacy}
                >
                    <Ionicons name="shield-outline" size={24} color={theme.colors.text.primary} />
                    <Text style={[styles.settingText, { color: theme.colors.text.primary }]}>Privacy</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.text.tertiary} />
                </ElevatedCard>

                <ElevatedCard
                    theme={theme}
                    style={styles.settingItem}
                    tilt={false}
                    onPress={() => setAboutOpen(true)}
                >
                    <Ionicons name="information-circle-outline" size={24} color={theme.colors.text.primary} />
                    <Text style={[styles.settingText, { color: theme.colors.text.primary }]}>About</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.text.tertiary} />
                </ElevatedCard>
            </View>

            <AccountAboutSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} theme={theme} />

            <View style={styles.stamp}>
                <BrandMark variant="ink" size={56} />
                <Text style={[styles.stampText, { color: theme.colors.text.tertiary }]}>
                    AmpliFood v1.0.0 · cooking, turned up
                </Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    subLabel: {
        fontSize: 13,
        fontWeight: '700',
        marginTop: 8,
        marginBottom: 4,
    },
    helper: {
        fontSize: 12,
        lineHeight: 17,
        marginTop: 6,
    },
    stamp: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 40,
        opacity: 0.85,
    },
    stampText: {
        marginTop: 10,
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.4,
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Platform.OS === 'web' ? 48 : 32,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center',
    },
    profileHeader: {
        alignItems: 'center',
        paddingTop: 40,
        paddingBottom: 24,
        paddingHorizontal: 24,
        marginHorizontal: 16,
        marginTop: 16,
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
        borderRadius: 14,
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
    settingsCard: {
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 20,
    },
    safetyCard: {
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 20,
    },
    safetyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    safetyTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '700',
    },
    safetyBody: {
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 8,
    },
    settingsContainer: {
        padding: 24,
        paddingTop: 8,
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
        marginBottom: 12,
        gap: 12,
    },
    settingText: {
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
        fontSize: 16,
    },
    statsContainer: {
        flexDirection: 'row',
        padding: 24,
        marginHorizontal: 16,
        marginTop: 16,
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
