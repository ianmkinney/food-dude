import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

const SimplifiedListModal = ({ visible, result, onApply, onClose }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    if (!visible || !result) {
        return null;
    }

    const { simplifiedItems, summary } = result;
    const totalEstimatedCost = simplifiedItems.reduce((sum, item) => sum + (item.estimatedPrice || 0), 0);

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
                            <Ionicons name="sparkles" size={28} color={theme.primary[500]} />
                            <Text style={[styles.headerTitle, { color: theme.colors.text.primary }]}>
                                Simplified Shopping List
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={28} color={theme.colors.text.secondary} />
                        </TouchableOpacity>
                    </View>

                    {/* Summary Banner */}
                    <View style={[styles.summaryBanner, { backgroundColor: theme.primary[100] }]}>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryItem}>
                                <Text style={[styles.summaryNumber, { color: theme.primary[500] }]}>
                                    {summary.originalCount}
                                </Text>
                                <Text style={[styles.summaryLabel, { color: theme.colors.text.secondary }]}>
                                    Original
                                </Text>
                            </View>
                            <Ionicons name="arrow-forward" size={24} color={theme.primary[500]} />
                            <View style={styles.summaryItem}>
                                <Text style={[styles.summaryNumber, { color: theme.accent.green }]}>
                                    {summary.simplifiedCount}
                                </Text>
                                <Text style={[styles.summaryLabel, { color: theme.colors.text.secondary }]}>
                                    Simplified
                                </Text>
                            </View>
                        </View>
                        {summary.estimatedTotalSavings > 0 && (
                            <Text style={[styles.savingsText, { color: theme.accent.green }]}>
                                💰 Est. ${summary.estimatedTotalSavings.toFixed(2)} saved
                            </Text>
                        )}
                    </View>

                    {/* Explanation */}
                    {summary.explanation && (
                        <View style={[styles.explanationBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                            <Text style={[styles.explanationText, { color: theme.colors.text.primary }]}>
                                {summary.explanation}
                            </Text>
                        </View>
                    )}

                    {/* Simplified Items List */}
                    <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
                        {simplifiedItems.map((item, index) => (
                            <View
                                key={index}
                                style={[styles.itemCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                            >
                                <View style={styles.itemHeader}>
                                    <Text style={[styles.itemName, { color: theme.colors.text.primary }]}>
                                        {item.name}
                                    </Text>
                                    <Text style={[styles.itemPrice, { color: theme.accent.green }]}>
                                        ${item.estimatedPrice?.toFixed(2) || '—'}
                                    </Text>
                                </View>

                                <View style={styles.itemDetails}>
                                    <View style={styles.detailRow}>
                                        <Ionicons name="cube-outline" size={16} color={theme.colors.text.secondary} />
                                        <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>
                                            {item.quantity} {item.unit}
                                        </Text>
                                    </View>

                                    {item.brandRecommendation && (
                                        <View style={styles.detailRow}>
                                            <Ionicons name="pricetag-outline" size={16} color={theme.colors.text.secondary} />
                                            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>
                                                {item.brandRecommendation}
                                            </Text>
                                        </View>
                                    )}

                                    {item.category && (
                                        <View style={[styles.categoryBadge, { backgroundColor: theme.primary[100] }]}>
                                            <Text style={[styles.categoryText, { color: theme.primary[500] }]}>
                                                {item.category}
                                            </Text>
                                        </View>
                                    )}

                                    {item.notes && (
                                        <Text style={[styles.itemNotes, { color: theme.colors.text.tertiary }]}>
                                            ℹ️ {item.notes}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))}

                        {/* Total */}
                        <View style={[styles.totalCard, { backgroundColor: theme.primary[500] }]}>
                            <Text style={styles.totalLabel}>Estimated Total</Text>
                            <Text style={styles.totalPrice}>${totalEstimatedCost.toFixed(2)}</Text>
                        </View>
                    </ScrollView>

                    {/* Action Buttons */}
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.cancelButton, { borderColor: theme.colors.border }]}
                            onPress={onClose}
                        >
                            <Text style={[styles.cancelButtonText, { color: theme.colors.text.secondary }]}>
                                Cancel
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.applyButton, { backgroundColor: theme.primary[500] }]}
                            onPress={onApply}
                        >
                            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                            <Text style={styles.applyButtonText}>Apply Changes</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
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
        maxHeight: '90%',
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
    summaryBanner: {
        padding: 16,
        marginHorizontal: 20,
        marginTop: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginBottom: 8,
    },
    summaryItem: {
        alignItems: 'center',
    },
    summaryNumber: {
        fontSize: 32,
        fontWeight: 'bold',
    },
    summaryLabel: {
        fontSize: 12,
        marginTop: 4,
    },
    savingsText: {
        fontSize: 16,
        fontWeight: '600',
    },
    explanationBox: {
        marginHorizontal: 20,
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    explanationText: {
        fontSize: 14,
        lineHeight: 20,
    },
    itemsList: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    itemCard: {
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
        marginRight: 8,
    },
    itemPrice: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    itemDetails: {
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
    categoryBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginTop: 4,
    },
    categoryText: {
        fontSize: 12,
        fontWeight: '600',
    },
    itemNotes: {
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 4,
    },
    totalCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        marginTop: 8,
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    totalPrice: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    actionButtons: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    applyButton: {
        flex: 2,
        flexDirection: 'row',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    applyButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default SimplifiedListModal;
