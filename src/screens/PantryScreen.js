import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Alert,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { pantryOperations } from '../database/operations';
import ElevatedCard from '../components/ElevatedCard';
import AnimatedPressable from '../components/AnimatedPressable';
import FloatingActionButton from '../components/FloatingActionButton';

const PantryScreen = () => {
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const [pantryItems, setPantryItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isFocused) {
            loadPantryItems();
        }
    }, [isFocused]);

    const loadPantryItems = async () => {
        try {
            const items = await pantryOperations.getAll();
            setPantryItems(items);
        } catch (error) {
            console.error('Error loading pantry items:', error);
            Alert.alert('Error', 'Failed to load pantry items');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (item) => {
        Alert.alert(
            'Delete Item',
            `Are you sure you want to delete "${item.name}" from your pantry?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await pantryOperations.delete(item.id);
                            loadPantryItems();
                        } catch (error) {
                            console.error('Error deleting item:', error);
                            Alert.alert('Error', 'Failed to delete item');
                        }
                    },
                },
            ]
        );
    };

    const handleEdit = (item) => {
        navigation.navigate('EditPantryItem', { item });
    };

    const renderPantryItem = ({ item, index }) => (
        <ElevatedCard theme={theme} index={index} style={styles.itemCard}>
            <View style={styles.itemContent}>
                <Ionicons name="cube" size={32} color={theme.primary[500]} />
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: theme.colors.text.primary }]}>
                        {item.name}
                    </Text>
                    {item.quantity && (
                        <Text style={[styles.itemQuantity, { color: theme.colors.text.secondary }]}>
                            {item.quantity} {item.unit || ''}
                        </Text>
                    )}
                    {item.category && (
                        <Text style={[styles.itemCategory, { color: theme.colors.text.tertiary }]}>
                            {item.category}
                        </Text>
                    )}
                </View>
            </View>
            <View style={styles.itemActions}>
                {item.expiration_date && (
                    <View style={[styles.expirationBadge, { backgroundColor: theme.accent.yellow + '20' }]}>
                        <Ionicons name="time-outline" size={14} color={theme.accent.yellow} />
                        <Text style={[styles.expirationText, { color: theme.accent.yellow }]}>
                            Exp: {new Date(item.expiration_date).toLocaleDateString()}
                        </Text>
                    </View>
                )}
                <View style={styles.actionButtons}>
                    <AnimatedPressable
                        style={[styles.actionButton, { backgroundColor: theme.primary[100] }]}
                        onPress={() => handleEdit(item)}
                    >
                        <Ionicons name="pencil" size={18} color={theme.primary[500]} />
                    </AnimatedPressable>
                    <AnimatedPressable
                        style={[styles.actionButton, { backgroundColor: theme.colors.error + '20' }]}
                        onPress={() => handleDelete(item)}
                    >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                    </AnimatedPressable>
                </View>
            </View>
        </ElevatedCard>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={80} color={theme.colors.text.tertiary} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text.primary }]}>
                Pantry is Empty
            </Text>
            <Text style={[styles.emptyDescription, { color: theme.colors.text.secondary }]}>
                Add items by scanning barcodes or manually entering them
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <FlatList
                data={pantryItems}
                renderItem={renderPantryItem}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={!loading && renderEmptyState()}
                refreshing={loading}
                onRefresh={loadPantryItems}
            />

            <FloatingActionButton
                theme={theme}
                style={styles.fab}
                accessibilityLabel="Add pantry item"
                onPress={() => navigation.navigate('AddPantryItem')}
            >
                <Ionicons name="add" size={28} color="#FFFFFF" />
            </FloatingActionButton>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 4,
    },
    itemQuantity: {
        fontSize: 14,
        marginBottom: 2,
    },
    itemCategory: {
        fontSize: 12,
        textTransform: 'capitalize',
    },
    expirationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginTop: 8,
        gap: 4,
    },
    expirationText: {
        fontSize: 12,
        fontWeight: '600',
    },
    itemActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
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
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 20,
    },
});

export default PantryScreen;
