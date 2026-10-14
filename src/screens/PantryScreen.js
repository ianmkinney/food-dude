import React, { useCallback, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { pantryOperations } from '../database/operations';
import { useQuery } from '../data/queryCache';
import { pantryQuery } from '../data/queries';
import AnimatedPressable from '../components/AnimatedPressable';
import FabCluster from '../components/FabCluster';
import EmptyState from '../components/EmptyState';
import ScreenSkeleton from '../components/Skeleton';
import { useLayoutMode } from '../layout/useLayoutMode';
import { desktopListStyles, desktopPageStyles } from '../components/layout/desktopTheme';
import DesktopPageHeader from '../components/layout/DesktopPageHeader';
import PantryPhotoEstimateButton from '../components/PantryPhotoEstimateButton';
import PantryExpandableItemCard from '../components/PantryExpandableItemCard';
import PantryBulkEstimateModal from '../components/PantryBulkEstimateModal';
import { expirationBadge, sortPantryItemsByExpiration } from '../utils/pantryExpiration';
import { estimatePantryBulkFromPhoto } from '../services/pantryVisionEstimate';
import { useFloatingActionLayout } from '../layout/floatingActionLayout';

const PantryScreen = () => {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const { isDesktop } = useLayoutMode();
    const { data, showSkeleton, refresh } = useQuery(pantryQuery.key, pantryQuery.fetch);
    const pantryItems = useMemo(
        () => sortPantryItemsByExpiration(data || []),
        [data]
    );
    const [bulkEstimates, setBulkEstimates] = useState([]);
    const [bulkModalOpen, setBulkModalOpen] = useState(false);
    const [expandedItemId, setExpandedItemId] = useState(null);
    const [frame, setFrame] = useState({ width: 0, height: 0 });
    const { listInset } = useFloatingActionLayout(1, frame);

    const handleToggleExpand = useCallback((id) => {
        setExpandedItemId((prev) => (prev === id ? null : id));
    }, []);

    const expiringSoonCount = useMemo(
        () =>
            (data || []).filter((item) => {
                const badge = expirationBadge(item.expiration_date);
                return badge && (badge.tone === 'soon' || badge.tone === 'expired');
            }).length,
        [data]
    );

    const handleBulkPhoto = useCallback(
        async (image) => {
            const list = data || [];
            if (!list.length) {
                Alert.alert('Pantry', 'Add items before using bulk photo estimate.');
                return;
            }
            const estimates = await estimatePantryBulkFromPhoto(image, list);
            setBulkEstimates(estimates);
            setBulkModalOpen(true);
        },
        [data]
    );

    const loadPantryItems = useCallback(async () => {
        try {
            await refresh();
        } catch (error) {
            console.error('Error loading pantry items:', error);
            Alert.alert('Error', 'Failed to load pantry items');
        }
    }, [refresh]);

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
                            setExpandedItemId((id) => (id === item.id ? null : id));
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
        <PantryExpandableItemCard
            item={item}
            index={index}
            theme={theme}
            expanded={expandedItemId === item.id}
            onToggleExpand={handleToggleExpand}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSaved={loadPantryItems}
        />
    );

    const renderEmptyState = () => (
        <EmptyState
            title="Your pantry is empty"
            description="Add what you have on hand and recipes can work around it."
            actionLabel="Add pantry item"
            onAction={() => navigation.navigate('AddPantryItem')}
        />
    );

    return (
        <View
            style={[styles.container, { backgroundColor: theme.colors.background }]}
            onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
            }}
        >
            {isDesktop ? (
                <DesktopPageHeader
                    title="My Pantry"
                    subtitle={
                        expiringSoonCount
                            ? `${pantryItems.length} items · ${expiringSoonCount} expiring soon`
                            : `${pantryItems.length} items on hand`
                    }
                >
                    <AnimatedPressable
                        accessibilityRole="button"
                        accessibilityLabel="Add pantry item"
                        onPress={() => navigation.navigate('AddPantryItem')}
                        style={[desktopPageStyles.primaryBtn, { backgroundColor: theme.primary[500] }, theme.shadows.glow]}
                    >
                        <Ionicons name="add" size={20} color="#FFFFFF" />
                        <Text style={desktopPageStyles.primaryBtnText}>Add item</Text>
                    </AnimatedPressable>
                </DesktopPageHeader>
            ) : null}
            {data === undefined ? (
                showSkeleton ? <ScreenSkeleton /> : null
            ) : (
                <>
                {(data?.length || 0) > 0 ? (
                    <View style={styles.bulkPhotoWrap}>
                        <PantryPhotoEstimateButton
                            theme={theme}
                            label="Estimate all from photo"
                            onEstimate={handleBulkPhoto}
                        />
                    </View>
                ) : null}
                {expiringSoonCount > 0 && !isDesktop ? (
                    <View style={[styles.soonBanner, { backgroundColor: theme.accent.yellow + '18' }]}>
                        <Ionicons name="time-outline" size={18} color={theme.accent.yellow} />
                        <Text style={[styles.soonBannerText, { color: theme.colors.text.primary }]}>
                            {expiringSoonCount} item{expiringSoonCount === 1 ? '' : 's'} expiring within a week
                        </Text>
                    </View>
                ) : null}
                <FlatList
                    key={isDesktop ? 'pantry-grid' : 'pantry-list'}
                    data={pantryItems}
                    renderItem={renderPantryItem}
                    keyExtractor={(item) => item.id.toString()}
                    numColumns={isDesktop ? 2 : 1}
                    columnWrapperStyle={isDesktop ? desktopListStyles.columnWrapper : undefined}
                    contentContainerStyle={[
                        styles.listContent,
                        !isDesktop && {
                            paddingLeft: listInset.paddingLeft,
                            paddingRight: listInset.paddingRight,
                            paddingBottom: listInset.paddingBottom,
                        },
                    ]}
                    ListEmptyComponent={renderEmptyState}
                    refreshing={false}
                    onRefresh={loadPantryItems}
                />
                </>
            )}

            {!isDesktop ? (
                <FabCluster
                    frame={frame}
                    actions={[
                        {
                            key: 'add',
                            theme,
                            accessibilityLabel: 'Add pantry item',
                            testID: 'fab-add',
                            morphTo: 'af-sheet',
                            onPress: () => navigation.navigate('AddPantryItem'),
                            icon: <Ionicons name="add" size={28} color="#FFFFFF" />,
                        },
                    ]}
                />
            ) : null}
            <PantryBulkEstimateModal
                visible={bulkModalOpen}
                theme={theme}
                estimates={bulkEstimates}
                onClose={() => setBulkModalOpen(false)}
                onSaved={loadPantryItems}
            />
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
    bulkPhotoWrap: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    soonBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
    },
    soonBannerText: {
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
});

export default PantryScreen;
