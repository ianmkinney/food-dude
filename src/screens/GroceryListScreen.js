import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { useQuery } from '../data/queryCache';
import { groceryQuery } from '../data/queries';
import { simplifyGroceryList } from '../services/intelligentGroceryService';
import SimplifiedListModal from '../components/SimplifiedListModal';
import GroceryRow from '../components/GroceryRow';
import EmptyState from '../components/EmptyState';
import ScreenSkeleton from '../components/Skeleton';
import AnimatedPressable from '../components/AnimatedPressable';
import FloatingActionButton from '../components/FloatingActionButton';

const GroceryListScreen = () => {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const {
        data: cachedItems,
        showSkeleton,
        refresh: refreshGroceryItems,
        setData: setGroceryItems,
    } = useQuery(groceryQuery.key, groceryQuery.fetch);
    const groceryItems = cachedItems || [];
    const [filter, setFilter] = useState('all'); // all, checked, unchecked
    const [showStoreModal, setShowStoreModal] = useState(false);
    const [showSimplifiedModal, setShowSimplifiedModal] = useState(false);
    const [simplifying, setSimplifying] = useState(false);
    const [simplifiedResult, setSimplifiedResult] = useState(null);
    const [storeName, setStoreName] = useState('');
    const [storeLocation, setStoreLocation] = useState('');
    const [simplifyingStatus, setSimplifyingStatus] = useState('');
    const [pendingChecked, setPendingChecked] = useState({});
    const settleTimer = useRef(null);

    useEffect(() => () => clearTimeout(settleTimer.current), []);

    const loadGroceryItems = useCallback(async () => {
        try {
            await refreshGroceryItems();
        } catch (error) {
            console.error('Error loading grocery items:', error);
            Alert.alert('Error', `Failed to load grocery list: ${error.message || 'Unknown error'}`);
        }
    }, [refreshGroceryItems]);

    // Flip the checkbox immediately, let the strike and pop play, then reload so
    // the row moves into (or out of) the Done group.
    const toggleItem = useCallback(async (item) => {
        const next = !(pendingChecked[item.id] ?? !!item.is_checked);
        setPendingChecked((prev) => ({ ...prev, [item.id]: next }));
        try {
            await groceryOperations.toggleChecked(item.id);
        } catch (error) {
            console.error('Error toggling item:', error);
        }
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(async () => {
            await loadGroceryItems();
            setPendingChecked({});
        }, 320);
    }, [pendingChecked, loadGroceryItems]);

    const deleteItem = useCallback(async (item) => {
        setGroceryItems((prev) => (prev || []).filter((i) => i.id !== item.id));
        try {
            await groceryOperations.delete(item.id);
        } catch (error) {
            console.error('Error deleting item:', error);
            loadGroceryItems();
        }
    }, [setGroceryItems, loadGroceryItems]);

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

    const rows = useMemo(() => {
        const todo = groceryItems.filter((i) => !i.is_checked);
        const done = groceryItems.filter((i) => i.is_checked);
        const list = todo.map((item, i) => ({ key: `todo-${item.id}`, item, index: i, done: false }));
        if (done.length) {
            list.push({ key: 'done-header', header: true, count: done.length });
            done.forEach((item, i) => list.push({ key: `done-${item.id}`, item, index: i, done: true }));
        }
        return list;
    }, [groceryItems]);

    const renderRow = ({ item: row }) => {
        if (row.header) {
            return (
                <Text style={[styles.groupLabel, { color: theme.colors.text.secondary }]} accessibilityRole="header">
                    Done · {row.count}
                </Text>
            );
        }
        const { item } = row;
        return (
            <GroceryRow
                item={item}
                theme={theme}
                index={row.index}
                enterFrom={row.done ? 'above' : 'below'}
                checked={pendingChecked[item.id] ?? !!item.is_checked}
                onToggle={toggleItem}
                onDelete={deleteItem}
            />
        );
    };

    const renderEmptyState = () => (
        <EmptyState
            title="Your list is clear"
            description="Add items yourself, or send a recipe's ingredients here from its page."
            actionLabel="Add an item"
            onAction={() => navigation.navigate('AddGroceryItem')}
        />
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
                            style={[styles.exportButton, { borderColor: theme.colors.border }]}
                            onPress={exportListToClipboard}
                            accessibilityRole="button"
                            accessibilityLabel="Copy list"
                        >
                            <Ionicons name="copy-outline" size={20} color={theme.colors.text.secondary} />
                        </AnimatedPressable>
                        <AnimatedPressable
                            style={[styles.estimateButton, { backgroundColor: theme.primary[100] }]}
                            onPress={() => navigation.navigate('EstimateCost')}
                            accessibilityRole="button"
                        >
                            <Ionicons name="calculator-outline" size={20} color={theme.primary[500]} />
                            <Text style={[styles.estimateText, { color: theme.primary[500] }]}>
                                Estimate
                            </Text>
                        </AnimatedPressable>
                        <AnimatedPressable
                            style={[styles.clearButton, { borderColor: theme.colors.border }]}
                            onPress={clearList}
                            accessibilityRole="button"
                            accessibilityLabel="Clear list"
                        >
                            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                        </AnimatedPressable>
                    </View>
                </View>
            )}

            {cachedItems === undefined ? (
                showSkeleton ? <ScreenSkeleton /> : null
            ) : (
                <FlatList
                    data={rows}
                    renderItem={renderRow}
                    keyExtractor={(row) => row.key}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={renderEmptyState}
                    refreshing={false}
                    onRefresh={loadGroceryItems}
                />
            )}

            {/* Floating Action Buttons */}
            <View style={styles.fabContainer}>
                {groceryItems.length > 0 && (
                <FloatingActionButton
                    theme={theme}
                    color={theme.colors.surfaceElevated}
                    style={[styles.fabLeft, { borderColor: theme.colors.border }]}
                    accessibilityLabel="Simplify grocery list with AI"
                    onPress={handleSimplifyWithAI}
                    disabled={simplifying || groceryItems.filter(item => !item.is_checked).length === 0}
                >
                    {simplifying ? (
                        <ActivityIndicator color={theme.primary[500]} size="small" />
                    ) : (
                        <Ionicons name="sparkles" size={24} color={theme.primary[500]} />
                    )}
                </FloatingActionButton>
                )}
                <FloatingActionButton
                    theme={theme}
                    accessibilityLabel="Add grocery item"
                    onPress={() => navigation.navigate('AddGroceryItem')}
                    morphTo="af-sheet"
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
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close" onPress={() => setShowStoreModal(false)}>
                                <Ionicons name="close" size={24} color={theme.colors.text.secondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>
                            <Text style={[styles.modalLabel, { color: theme.colors.text.secondary }]}>
                                Grocery Store Name *
                            </Text>
                            <TextInput accessibilityLabel="Store name"
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
                            <TextInput accessibilityLabel="Location (Optional)"
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
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 8,
        marginLeft: 16,
    },
    exportButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    estimateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        minHeight: 44,
        borderRadius: 12,
        gap: 6,
    },
    estimateText: {
        fontSize: 13,
        fontWeight: '600',
    },
    clearButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 104,
    },
    groupLabel: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginTop: 16,
        marginBottom: 8,
        marginLeft: 4,
    },
    fabContainer: {
        position: 'absolute',
        right: 20,
        bottom: 20,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    fabLeft: {
        borderWidth: 1,
    },
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
