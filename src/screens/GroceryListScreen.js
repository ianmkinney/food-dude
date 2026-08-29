import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Alert,
    Modal,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { groceryOperations } from '../database/operations';
import { simplifyGroceryList } from '../services/intelligentGroceryService';
import SimplifiedListModal from '../components/SimplifiedListModal';
import ElevatedCard from '../components/ElevatedCard';
import AnimatedPressable from '../components/AnimatedPressable';
import FloatingActionButton from '../components/FloatingActionButton';

const GroceryListScreen = () => {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [groceryItems, setGroceryItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, checked, unchecked
    const [showStoreModal, setShowStoreModal] = useState(false);
    const [showSimplifiedModal, setShowSimplifiedModal] = useState(false);
    const [simplifying, setSimplifying] = useState(false);
    const [simplifiedResult, setSimplifiedResult] = useState(null);
    const [storeName, setStoreName] = useState('');
    const [storeLocation, setStoreLocation] = useState('');
    const [simplifyingStatus, setSimplifyingStatus] = useState('');

    useEffect(() => {
        loadGroceryItems();
    }, []);

    const loadGroceryItems = async () => {
        try {
            const items = await groceryOperations.getAll();
            setGroceryItems(items || []);
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

    const toggleItemChecked = async (id) => {
        try {
            await groceryOperations.toggleChecked(id);
            loadGroceryItems();
        } catch (error) {
            console.error('Error toggling item:', error);
        }
    };

    const clearList = () => {
        Alert.alert(
            'Clear List',
            'Are you sure you want to clear all items from your grocery list?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await groceryOperations.clearAll();
                            loadGroceryItems();
                        } catch (error) {
                            console.error('Error clearing list:', error);
                            Alert.alert('Error', 'Failed to clear grocery list');
                        }
                    },
                },
            ]
        );
    };

    const exportListToClipboard = async () => {
        try {
            // Filter to only unchecked items (items still needed)
            const uncheckedItems = groceryItems.filter(item => !item.is_checked);
            
            if (uncheckedItems.length === 0) {
                Alert.alert('Empty List', 'There are no items to export. Add items to your grocery list first.');
                return;
            }

            // Format the list as text
            let listText = 'Grocery List\n';
            listText += '='.repeat(20) + '\n\n';
            
            // Group by category if available
            const itemsByCategory = {};
            const itemsWithoutCategory = [];
            
            uncheckedItems.forEach(item => {
                if (item.category) {
                    if (!itemsByCategory[item.category]) {
                        itemsByCategory[item.category] = [];
                    }
                    itemsByCategory[item.category].push(item);
                } else {
                    itemsWithoutCategory.push(item);
                }
            });
            
            // Add categorized items
            Object.keys(itemsByCategory).sort().forEach(category => {
                listText += `${category.toUpperCase()}\n`;
                itemsByCategory[category].forEach(item => {
                    const quantity = item.quantity ? `${item.quantity} ${item.unit || ''}`.trim() : '';
                    listText += `  • ${item.name}${quantity ? ` (${quantity})` : ''}\n`;
                });
                listText += '\n';
            });
            
            // Add uncategorized items
            if (itemsWithoutCategory.length > 0) {
                if (Object.keys(itemsByCategory).length > 0) {
                    listText += 'OTHER\n';
                }
                itemsWithoutCategory.forEach(item => {
                    const quantity = item.quantity ? `${item.quantity} ${item.unit || ''}`.trim() : '';
                    listText += `  • ${item.name}${quantity ? ` (${quantity})` : ''}\n`;
                });
            }
            
            // Copy to clipboard
            await Clipboard.setStringAsync(listText.trim());
            
            // Show success notification
            Alert.alert(
                '✅ Copied to Clipboard!',
                `Your grocery list (${uncheckedItems.length} items) has been copied to your clipboard.`,
                [{ text: 'OK' }]
            );
        } catch (error) {
            console.error('Error exporting list:', error);
            Alert.alert('Error', 'Failed to copy list to clipboard');
        }
    };

    const renderGroceryItem = ({ item, index }) => (
        <ElevatedCard
            theme={theme}
            index={index}
            style={[styles.itemCard, item.is_checked && { opacity: 0.7 }]}
            onPress={() => toggleItemChecked(item.id)}
        >
            <View style={styles.itemContent}>
                <Ionicons
                    name={item.is_checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={28}
                    color={item.is_checked ? theme.accent.green : theme.colors.text.tertiary}
                />
                <View style={styles.itemInfo}>
                    <Text
                        style={[
                            styles.itemName,
                            { color: theme.colors.text.primary },
                            item.is_checked && styles.checkedText,
                        ]}
                    >
                        {item.name}
                    </Text>
                    {item.quantity && (
                        <Text style={[styles.itemQuantity, { color: theme.colors.text.secondary }]}>
                            {item.quantity} {item.unit || ''}
                        </Text>
                    )}
                    {item.recipe_name && (
                        <Text style={[styles.recipeTag, { color: theme.primary[500] }]}>
                            For: {item.recipe_name}
                        </Text>
                    )}
                </View>
            </View>
        </ElevatedCard>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={80} color={theme.colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text.primary }]}>
                Grocery List is Empty
            </Text>
            <Text style={[styles.emptyDescription, { color: theme.colors.text.secondary }]}>
                Add items from recipes or create a list from your meal plan
            </Text>
        </View>
    );

    const handleSimplifyWithAI = () => {
        if (groceryItems.filter(item => !item.is_checked).length === 0) {
            Alert.alert('Empty List', 'Please add items to your grocery list before simplifying.');
            return;
        }
        setShowStoreModal(true);
    };

    const handleStoreSubmit = async () => {
        if (!storeName.trim()) {
            Alert.alert('Error', 'Please enter a grocery store name');
            return;
        }
        setShowStoreModal(false);
        setSimplifying(true);
        setSimplifyingStatus('Analyzing list...');

        try {
            setSimplifyingStatus('Simplifying with AI...');
            const result = await simplifyGroceryList(groceryItems, storeName, storeLocation);
            if (result.success) {
                setSimplifyingStatus('Finalizing...');
                setSimplifiedResult(result.data);
                setShowSimplifiedModal(true);
            } else {
                Alert.alert('Error', result.error || 'Failed to simplify grocery list');
            }
        } catch (error) {
            console.error('Error simplifying list:', error);
            Alert.alert('Error', 'Failed to simplify grocery list');
        } finally {
            setSimplifying(false);
            setSimplifyingStatus('');
        }
    };

    const handleApplySimplified = async () => {
        if (!simplifiedResult) return;

        try {
            // Clear current unchecked items
            const uncheckedItems = groceryItems.filter(item => !item.is_checked);
            for (const item of uncheckedItems) {
                await groceryOperations.delete(item.id);
            }

            // Add simplified items
            for (const item of simplifiedResult.simplifiedItems) {
                await groceryOperations.add({
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    category: item.category,
                    notes: item.brandRecommendation ? `Brand: ${item.brandRecommendation}${item.notes ? ` - ${item.notes}` : ''}` : item.notes,
                });
            }

            setShowSimplifiedModal(false);
            setSimplifiedResult(null);
            loadGroceryItems();
            Alert.alert('Success', 'Grocery list simplified and updated!');
        } catch (error) {
            console.error('Error applying simplified list:', error);
            Alert.alert('Error', 'Failed to apply simplified list');
        }
    };

    const uncheckedCount = groceryItems.filter(item => !item.is_checked).length;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {/* Header Stats */}
            {groceryItems.length > 0 && (
                <View style={[styles.header, { backgroundColor: theme.colors.surfaceGlass, borderBottomColor: theme.colors.borderSoft }]}>
                    <View style={styles.statItem}>
                        <Text style={[styles.statNumber, { color: theme.primary[500] }]}>
                            {uncheckedCount}
                        </Text>
                        <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>
                            Items Left
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        <AnimatedPressable
                            style={[styles.exportButton, { backgroundColor: theme.accent.green + '20' }]}
                            onPress={exportListToClipboard}
                        >
                            <Ionicons name="copy-outline" size={18} color={theme.accent.green} />
                            <Text style={[styles.exportText, { color: theme.accent.green }]}>
                                Export
                            </Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            style={[styles.estimateButton, { backgroundColor: theme.primary[100] }]}
                            onPress={() => navigation.navigate('EstimateCost')}
                        >
                            <Ionicons name="calculator-outline" size={20} color={theme.primary[500]} />
                            <Text style={[styles.estimateText, { color: theme.primary[500] }]}>
                                Estimate Cost
                            </Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            style={[styles.clearButton, { borderColor: theme.colors.error }]}
                            onPress={clearList}
                        >
                            <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                            <Text style={[styles.clearText, { color: theme.colors.error }]}>
                                Clear
                            </Text>
                        </AnimatedPressable>
                    </View>
                </View>
            )}

            <FlatList
                data={groceryItems}
                renderItem={renderGroceryItem}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={!loading && renderEmptyState()}
                refreshing={loading}
                onRefresh={loadGroceryItems}
            />

            {/* Floating Action Buttons */}
            <View style={styles.fabContainer}>
                <FloatingActionButton
                    theme={theme}
                    color={theme.accent.purple}
                    style={styles.fabLeft}
                    accessibilityLabel="Simplify grocery list with AI"
                    onPress={handleSimplifyWithAI}
                    disabled={simplifying || groceryItems.filter(item => !item.is_checked).length === 0}
                >
                    {simplifying ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <Ionicons name="sparkles" size={24} color="#FFFFFF" />
                    )}
                </FloatingActionButton>
                <FloatingActionButton
                    theme={theme}
                    accessibilityLabel="Add grocery item"
                    onPress={() => navigation.navigate('AddGroceryItem')}
                >
                    <Ionicons name="add" size={28} color="#FFFFFF" />
                </FloatingActionButton>
            </View>

            {/* Store Info Modal */}
            <Modal
                visible={showStoreModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowStoreModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
                            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>
                                Store Information
                            </Text>
                            <TouchableOpacity onPress={() => setShowStoreModal(false)}>
                                <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>
                            <Text style={[styles.modalLabel, { color: theme.colors.text.secondary }]}>
                                Grocery Store Name *
                            </Text>
                            <TextInput
                                style={[styles.modalInput, {
                                    backgroundColor: theme.colors.surface,
                                    color: theme.colors.text.primary,
                                    borderColor: theme.colors.border
                                }]}
                                value={storeName}
                                onChangeText={setStoreName}
                                placeholder="e.g. Walmart, Whole Foods, Kroger"
                                placeholderTextColor={theme.colors.text.tertiary}
                            />

                            <Text style={[styles.modalLabel, { color: theme.colors.text.secondary, marginTop: 16 }]}>
                                Location (Optional)
                            </Text>
                            <TextInput
                                style={[styles.modalInput, {
                                    backgroundColor: theme.colors.surface,
                                    color: theme.colors.text.primary,
                                    borderColor: theme.colors.border
                                }]}
                                value={storeLocation}
                                onChangeText={setStoreLocation}
                                placeholder="e.g. New York, NY or Store Address"
                                placeholderTextColor={theme.colors.text.tertiary}
                            />

                            <Text style={[styles.modalHint, { color: theme.colors.text.tertiary }]}>
                                This helps AI recommend specific brands and products available at your store
                            </Text>
                        </View>

                        <View style={[styles.modalActions, { borderTopColor: theme.colors.border }]}>
                            <TouchableOpacity
                                style={[styles.modalCancelButton, { borderColor: theme.colors.border }]}
                                onPress={() => setShowStoreModal(false)}
                            >
                                <Text style={[styles.modalCancelText, { color: theme.colors.text.secondary }]}>
                                    Cancel
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalSubmitButton, { backgroundColor: theme.primary[500] }]}
                                onPress={handleStoreSubmit}
                                disabled={simplifying}
                            >
                                {simplifying ? (
                                    <>
                                        <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
                                        <Text style={styles.modalSubmitText}>
                                            {simplifyingStatus || 'Simplifying...'}
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                        <Text style={styles.modalSubmitText}>Simplify List</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Simplified List Modal */}
            <SimplifiedListModal
                visible={showSimplifiedModal}
                result={simplifiedResult}
                onApply={handleApplySimplified}
                onClose={() => {
                    setShowSimplifiedModal(false);
                    setSimplifiedResult(null);
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 32,
        fontWeight: 'bold',
    },
    statLabel: {
        fontSize: 14,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    exportText: {
        fontSize: 13,
        fontWeight: '600',
    },
    estimateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    estimateText: {
        fontSize: 13,
        fontWeight: '600',
    },
    clearButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        gap: 6,
    },
    clearText: {
        fontSize: 13,
        fontWeight: '600',
    },
    listContent: {
        padding: 16,
    },
    itemCard: {
        padding: 16,
        marginBottom: 14,
    },
    itemContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
        marginLeft: 16,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    checkedText: {
        textDecorationLine: 'line-through',
        opacity: 0.5,
    },
    itemQuantity: {
        fontSize: 14,
        marginBottom: 2,
    },
    recipeTag: {
        fontSize: 12,
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 80,
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
        paddingHorizontal: 32,
    },
    fabContainer: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    fabLeft: {},
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        maxWidth: 400,
        borderRadius: 16,
        padding: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    modalBody: {
        padding: 20,
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    modalInput: {
        height: 48,
        borderRadius: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        fontSize: 16,
    },
    modalHint: {
        fontSize: 12,
        marginTop: 8,
        fontStyle: 'italic',
    },
    modalActions: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
        borderTopWidth: 1,
    },
    modalCancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
    },
    modalCancelText: {
        fontSize: 16,
        fontWeight: '600',
    },
    modalSubmitButton: {
        flex: 2,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalSubmitText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default GroceryListScreen;
