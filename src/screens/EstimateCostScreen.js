import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { groceryOperations } from '../database/operations';
import aiChefService from '../services/aiChefService';

const EstimateCostScreen = ({ navigation }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    const [storeName, setStoreName] = useState('');
    const [location, setLocation] = useState('');
    const [groceryItems, setGroceryItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [estimating, setEstimating] = useState(false);
    const [estimation, setEstimation] = useState(null);
    const [estimatingStatus, setEstimatingStatus] = useState('');

    useEffect(() => {
        loadGroceryItems();
    }, []);

    const loadGroceryItems = async () => {
        try {
            const items = await groceryOperations.getAll();
            const uncheckedItems = (items || []).filter(item => !item.is_checked);
            setGroceryItems(uncheckedItems);
        } catch (error) {
            console.error('Error loading grocery items:', error);
            // Set empty array instead of showing alert repeatedly
            setGroceryItems([]);
            // Only show alert once, not repeatedly
            if (loading) {
                Alert.alert('Error', `Failed to load grocery list: ${error.message || 'Unknown error'}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEstimate = async () => {
        if (groceryItems.length === 0) {
            Alert.alert('No Items', 'Your grocery list is empty!');
            return;
        }

        setEstimating(true);
        setEstimatingStatus('Analyzing items...');
        try {
            setEstimatingStatus('Estimating costs with AI...');
            const result = await aiChefService.estimateGroceryCost(
                groceryItems,
                storeName.trim() || null,
                location.trim() || null
            );

            setEstimatingStatus('Finalizing estimates...');
            if (result.success) {
                setEstimation(result.estimate);
            } else {
                Alert.alert('Error', result.error || 'Failed to estimate costs');
            }
        } catch (error) {
            console.error('Error estimating costs:', error);
            Alert.alert('Error', 'Failed to estimate costs');
        } finally {
            setEstimating(false);
            setEstimatingStatus('');
        }
    };

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
                <ActivityIndicator size="large" color={theme.primary[500]} />
            </View>
        );
    }

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <View style={styles.content}>
                {/* Header */}
                <View style={styles.header}>
                    <Ionicons name="calculator" size={40} color={theme.primary[500]} />
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>
                        Estimate Grocery Cost
                    </Text>
                    <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
                        Get AI-powered price estimates for your grocery list
                    </Text>
                </View>

                {/* Optional Form Fields */}
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                        Store Details (Optional)
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: theme.colors.text.secondary }]}>
                        Providing store and location helps improve estimate accuracy
                    </Text>

                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
                            Store Name
                        </Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: theme.colors.background,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={storeName}
                            onChangeText={setStoreName}
                            placeholder="e.g., Walmart, Whole Foods, Trader Joe's"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
                            Location
                        </Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: theme.colors.background,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="e.g., New York, NY or San Francisco, CA"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />
                    </View>
                </View>

                {/* Grocery Items Preview */}
                <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                        Items to Estimate ({groceryItems.length})
                    </Text>
                    {groceryItems.slice(0, 5).map((item, index) => (
                        <View key={item.id} style={styles.itemPreview}>
                            <Text style={[styles.itemName, { color: theme.colors.text.primary }]}>
                                • {item.name}
                            </Text>
                            {item.quantity && (
                                <Text style={[styles.itemQuantity, { color: theme.colors.text.secondary }]}>
                                    {item.quantity} {item.unit || ''}
                                </Text>
                            )}
                        </View>
                    ))}
                    {groceryItems.length > 5 && (
                        <Text style={[styles.moreItems, { color: theme.colors.text.tertiary }]}>
                            ... and {groceryItems.length - 5} more items
                        </Text>
                    )}
                </View>

                {/* Estimate Button */}
                <TouchableOpacity
                    style={[styles.estimateButton, { backgroundColor: theme.primary[500] }]}
                    onPress={handleEstimate}
                    disabled={estimating || groceryItems.length === 0}
                >
                    {estimating ? (
                        <>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text style={styles.estimateButtonText}>
                                {estimatingStatus || 'Estimating...'}
                            </Text>
                        </>
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                            <Text style={styles.estimateButtonText}>
                                Get AI Estimate
                            </Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Results */}
                {estimation && (
                    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                        <View style={styles.resultsHeader}>
                            <Ionicons name="receipt" size={24} color={theme.primary[500]} />
                            <Text style={[styles.cardTitle, { color: theme.colors.text.primary }]}>
                                Estimated Costs
                            </Text>
                        </View>

                        {estimation.items.map((item, index) => (
                            <View key={index} style={[styles.resultItem, { borderBottomColor: theme.colors.border }]}>
                                <View style={styles.resultItemLeft}>
                                    <Text style={[styles.resultItemName, { color: theme.colors.text.primary }]}>
                                        {item.name}
                                    </Text>
                                    {item.quantity && (
                                        <Text style={[styles.resultItemQty, { color: theme.colors.text.secondary }]}>
                                            {item.quantity}
                                        </Text>
                                    )}
                                    {item.priceNote && (
                                        <Text style={[styles.resultItemNote, { color: theme.colors.text.tertiary }]}>
                                            {item.priceNote}
                                        </Text>
                                    )}
                                </View>
                                <Text style={[styles.resultItemPrice, { color: theme.primary[500] }]}>
                                    ${item.estimatedPrice.toFixed(2)}
                                </Text>
                            </View>
                        ))}

                        <View style={[styles.totalContainer, { borderTopColor: theme.colors.border }]}>
                            <Text style={[styles.totalLabel, { color: theme.colors.text.primary }]}>
                                Estimated Total
                            </Text>
                            <Text style={[styles.totalAmount, { color: theme.primary[500] }]}>
                                ${estimation.total.toFixed(2)}
                            </Text>
                        </View>

                        {estimation.disclaimer && (
                            <View style={[styles.disclaimer, { backgroundColor: theme.primary[50] }]}>
                                <Ionicons name="information-circle" size={16} color={theme.primary[500]} />
                                <Text style={[styles.disclaimerText, { color: theme.primary[700] }]}>
                                    {estimation.disclaimer}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginTop: 12,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    card: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    cardSubtitle: {
        fontSize: 14,
        marginBottom: 16,
    },
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        fontSize: 16,
    },
    itemPreview: {
        paddingVertical: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemName: {
        fontSize: 15,
        flex: 1,
    },
    itemQuantity: {
        fontSize: 14,
        marginLeft: 8,
    },
    moreItems: {
        fontSize: 14,
        fontStyle: 'italic',
        marginTop: 8,
    },
    estimateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        gap: 8,
    },
    estimateButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    resultsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    resultItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    resultItemLeft: {
        flex: 1,
        marginRight: 12,
    },
    resultItemName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    resultItemQty: {
        fontSize: 14,
        marginBottom: 2,
    },
    resultItemNote: {
        fontSize: 12,
        fontStyle: 'italic',
    },
    resultItemPrice: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    totalContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 16,
        borderTopWidth: 2,
        marginTop: 8,
    },
    totalLabel: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    totalAmount: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    disclaimer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 12,
        borderRadius: 8,
        marginTop: 16,
        gap: 8,
    },
    disclaimerText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
    },
});

export default EstimateCostScreen;
