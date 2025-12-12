import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

const PantryMatchModal = ({ visible, matches, onClose, onRemoveFromGroceryList }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    if (!visible || matches.length === 0) {
        return null;
    }

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
                        <View style={styles.headerLeft}>
                            <Ionicons name="checkmark-circle" size={28} color={theme.accent.green} />
                            <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>
                                Items Found in Pantry
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={28} color={theme.colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Info Banner */}
                    <View style={[styles.infoBanner, { backgroundColor: theme.accent.yellow + '20' }]}>
                        <Ionicons name="information-circle" size={20} color={theme.accent.yellow} />
                        <Text style={[styles.infoBannerText, { color: theme.colors.text.primary }]}>
                            The following items were found in your pantry
                        </Text>
                    </View>

                    {/* Matches List */}
                    <ScrollView style={styles.matchesList} showsVerticalScrollIndicator={false}>
                        {matches.map((match, index) => (
                            <View
                                key={index}
                                style={[styles.matchCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                            >
                                <View style={styles.matchHeader}>
                                    <Text style={[styles.groceryItemName, { color: theme.colors.text.primary }]}>
                                        {match.groceryItem}
                                    </Text>
                                    <View style={[styles.matchBadge, { backgroundColor: getMatchColor(match.matchType, theme) + '20' }]}>
                                        <Text style={[styles.matchBadgeText, { color: getMatchColor(match.matchType, theme) }]}>
                                            {match.matchType}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.pantryItemDetails}>
                                    <View style={styles.detailRow}>
                                        <Ionicons name="cube-outline" size={16} color={theme.colors.text.secondary} />
                                        <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>
                                            Pantry: {match.pantryItem.name}
                                        </Text>
                                    </View>

                                    {match.pantryItem.quantity && (
                                        <View style={styles.detailRow}>
                                            <Ionicons name="layers-outline" size={16} color={theme.colors.text.secondary} />
                                            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>
                                                Quantity: {match.pantryItem.quantity} {match.pantryItem.unit || ''}
                                            </Text>
                                        </View>
                                    )}

                                    {match.pantryItem.expiration_date && (
                                        <View style={styles.detailRow}>
                                            <Ionicons name="calendar-outline" size={16} color={theme.colors.text.secondary} />
                                            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>
                                                Expires: {new Date(match.pantryItem.expiration_date).toLocaleDateString()}
                                            </Text>
                                        </View>
                                    )}

                                    {match.pantryItem.location && (
                                        <View style={styles.detailRow}>
                                            <Ionicons name="location-outline" size={16} color={theme.colors.text.secondary} />
                                            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>
                                                Location: {match.pantryItem.location}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        ))}
                    </ScrollView>

                    {/* Action Button */}
                    <TouchableOpacity
                        style={[styles.closeButton, { backgroundColor: theme.primary[500] }]}
                        onPress={onClose}
                    >
                        <Text style={styles.closeButtonText}>Got It</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const getMatchColor = (matchType, theme) => {
    switch (matchType) {
        case 'exact':
            return theme.accent.green;
        case 'partial':
            return theme.accent.yellow;
        case 'singular':
            return theme.primary[500];
        default:
            return theme.colors.text.secondary;
    }
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 20,
        maxHeight: '80%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        marginHorizontal: 20,
        marginTop: 16,
        borderRadius: 8,
    },
    infoBannerText: {
        fontSize: 14,
        flex: 1,
    },
    matchesList: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    matchCard: {
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    matchHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    groceryItemName: {
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
    },
    matchBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    matchBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    pantryItemDetails: {
        gap: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        fontSize: 14,
    },
    closeButton: {
        marginHorizontal: 20,
        marginVertical: 20,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default PantryMatchModal;
