import { StyleSheet } from 'react-native';
import { borderRadius, minTapTarget, spacing } from '../../theme';

export const DESKTOP_MAX_CONTENT = 1280;
export const DESKTOP_SIDEBAR_WIDTH = 248;
export const DESKTOP_CHAT_COLUMN_MAX = 760;
export const DESKTOP_CHAT_PANEL_WIDTH = 360;

export const desktopShellStyles = StyleSheet.create({
    root: {
        flex: 1,
        width: '100%',
        flexDirection: 'row',
    },
    sidebar: {
        width: DESKTOP_SIDEBAR_WIDTH,
        borderRightWidth: StyleSheet.hairlineWidth,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.sm,
    },
    main: {
        flex: 1,
        minWidth: 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        minHeight: minTapTarget + spacing.sm,
    },
    headerTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: '700',
    },
    content: {
        flex: 1,
        minHeight: 0,
    },
    contentInner: {
        flex: 1,
        width: '100%',
        maxWidth: DESKTOP_MAX_CONTENT,
        alignSelf: 'center',
        paddingHorizontal: spacing.lg,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        minHeight: minTapTarget,
    },
    navItemActive: {
        borderWidth: StyleSheet.hairlineWidth,
    },
    navLabel: {
        fontSize: 15,
        fontWeight: '600',
        flex: 1,
    },
    logoWrap: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.lg,
        paddingTop: spacing.xs,
    },
});

export const desktopAmpiStyles = StyleSheet.create({
    shell: {
        flex: 1,
        flexDirection: 'row',
        minHeight: 0,
    },
    chatColumn: {
        flex: 1,
        maxWidth: DESKTOP_CHAT_COLUMN_MAX,
        alignSelf: 'center',
        width: '100%',
        minWidth: 0,
    },
    sidePanel: {
        width: DESKTOP_CHAT_PANEL_WIDTH,
        borderLeftWidth: StyleSheet.hairlineWidth,
        padding: spacing.md,
    },
});

export const desktopRecipeStyles = StyleSheet.create({
    columnWrapper: {
        gap: spacing.md,
        paddingHorizontal: spacing.md,
    },
    gridCard: {
        flex: 1,
        marginBottom: spacing.md,
        minWidth: 0,
    },
});

export const desktopListStyles = StyleSheet.create({
    columnWrapper: {
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
    },
    gridItem: {
        width: '48%',
        flexGrow: 1,
    },
});

export const desktopPageStyles = StyleSheet.create({
    pageHeader: {
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
        gap: spacing.sm,
    },
    pageHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.md,
        flexWrap: 'wrap',
    },
    pageHeaderText: {
        flex: 1,
        minWidth: 200,
        gap: spacing.xs,
    },
    pageTitle: {
        fontSize: 28,
        fontWeight: '700',
        lineHeight: 34,
    },
    pageSubtitle: {
        fontSize: 15,
        lineHeight: 22,
    },
    pageHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        flexWrap: 'wrap',
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minWidth: 280,
        flex: 1,
        maxWidth: 420,
    },
    searchField: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        minHeight: minTapTarget,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.pill,
        minHeight: minTapTarget,
    },
    primaryBtnText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 15,
    },
});

export const desktopAccountStyles = StyleSheet.create({
    shell: {
        flex: 1,
        flexDirection: 'row',
        minHeight: 0,
    },
    subNav: {
        width: 220,
        borderRightWidth: StyleSheet.hairlineWidth,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
    },
    subNavItem: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        minHeight: minTapTarget,
        justifyContent: 'center',
    },
    main: {
        flex: 1,
        minWidth: 0,
    },
});
