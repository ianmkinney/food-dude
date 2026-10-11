import React, { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import GroceryRow from '../../components/GroceryRow';
import { desktopListStyles } from '../../components/layout/desktopTheme';

/**
 * Desktop grocery layout: two columns of category groups (todo items only).
 * Mobile list rendering stays in GroceryListScreen.
 */
export default function GroceryListDesktopBody({
    items,
    theme,
    pendingChecked,
    toggleItem,
    deleteItem,
}) {
    const groups = useMemo(() => {
        const todo = items.filter((i) => !i.is_checked);
        const byCategory = new Map();
        const uncategorized = [];
        todo.forEach((item) => {
            if (item.category) {
                const key = item.category;
                if (!byCategory.has(key)) byCategory.set(key, []);
                byCategory.get(key).push(item);
            } else {
                uncategorized.push(item);
            }
        });
        const sorted = [...byCategory.entries()].sort(([a], [b]) =>
            String(a).localeCompare(String(b))
        );
        if (uncategorized.length) sorted.push(['Other', uncategorized]);
        return sorted;
    }, [items]);

    const columns = useMemo(() => {
        const left = [];
        const right = [];
        groups.forEach((group, index) => {
            (index % 2 === 0 ? left : right).push(group);
        });
        return { left, right };
    }, [groups]);

    const renderColumn = (colGroups, side) => (
        <View style={desktopListStyles.gridItem} key={side}>
            {colGroups.map(([category, list]) => (
                <View key={category} style={{ marginBottom: 16 }}>
                    <Text
                        style={{
                            color: theme.colors.text.secondary,
                            fontWeight: '700',
                            fontSize: 13,
                            textTransform: 'uppercase',
                            marginBottom: 8,
                        }}
                        accessibilityRole="header"
                    >
                        {category}
                    </Text>
                    {list.map((item, index) => (
                        <GroceryRow
                            key={item.id}
                            item={item}
                            theme={theme}
                            index={index}
                            enterFrom="below"
                            checked={pendingChecked[item.id] ?? !!item.is_checked}
                            onToggle={toggleItem}
                            onDelete={deleteItem}
                        />
                    ))}
                </View>
            ))}
        </View>
    );

    return (
        <ScrollView contentContainerStyle={[desktopListStyles.columnWrapper, { paddingBottom: 96 }]}>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
                {renderColumn(columns.left, 'l')}
                {renderColumn(columns.right, 'r')}
            </View>
        </ScrollView>
    );
}
