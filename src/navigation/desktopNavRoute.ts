import { Platform } from 'react-native';
import { ASSISTANT_NAME } from '../config/assistant';

export type DesktopNavSnapshot = {
    activeKey: string;
    title: string;
};

type NavState = { routes: { name: string; state?: unknown; params?: object }[]; index: number } | undefined;

function titleForKey(key: string) {
    const map: Record<string, string> = {
        [ASSISTANT_NAME]: ASSISTANT_NAME,
        Recipes: 'Recipe Book',
        Planner: 'Meal Planner',
        Pantry: 'My Pantry',
        Grocery: 'Grocery List',
        Party: 'Parties',
        Account: 'Account',
    };
    return map[key] ?? key;
}

/** Web URL is authoritative for tab highlighting when linking hydrates before tab state. */
export function desktopNavFromWebPath(): DesktopNavSnapshot | null {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    const raw = window.location.pathname.replace(/\/+$/, '') || '';

    if (raw === '' || raw === '/') return { activeKey: ASSISTANT_NAME, title: titleForKey(ASSISTANT_NAME) };
    if (raw === '/recipes' || raw.startsWith('/recipe/') || raw === '/add-recipe' || raw === '/import') {
        return { activeKey: 'Recipes', title: titleForKey('Recipes') };
    }
    if (raw === '/planner') return { activeKey: 'Planner', title: titleForKey('Planner') };
    if (raw === '/pantry' || raw.startsWith('/pantry/')) return { activeKey: 'Pantry', title: titleForKey('Pantry') };
    if (raw === '/grocery' || raw.startsWith('/grocery/')) return { activeKey: 'Grocery', title: titleForKey('Grocery') };
    if (raw === '/party' || raw.startsWith('/party')) return { activeKey: 'Party', title: titleForKey('Party') };
    if (raw === '/account' || raw === '/plus') return { activeKey: 'Account', title: titleForKey('Account') };
    if (raw === '/chef') return { activeKey: ASSISTANT_NAME, title: titleForKey(ASSISTANT_NAME) };

    return null;
}

function desktopNavFromStateTree(state: NavState): DesktopNavSnapshot | null {
    if (!state) return null;
    const route = state.routes[state.index];
    if (!route) return null;

    if (route.name === 'Main') {
        if (route.state && typeof route.state === 'object' && 'routes' in route.state) {
            const tabState = route.state as { routes: { name: string }[]; index: number };
            const tab = tabState.routes[tabState.index ?? 0];
            const key = tab?.name ?? ASSISTANT_NAME;
            return { activeKey: key, title: titleForKey(key) };
        }
        const params = route.params as { screen?: string } | undefined;
        if (params?.screen) {
            return { activeKey: params.screen, title: titleForKey(params.screen) };
        }
        return null;
    }
    if (route.name === 'Party') return { activeKey: 'Party', title: titleForKey('Party') };
    if (route.name === 'Account') return { activeKey: 'Account', title: titleForKey('Account') };
    if (route.name === 'RecipeDetail') return { activeKey: 'Recipes', title: titleForKey('Recipes') };
    return { activeKey: route.name, title: titleForKey(route.name) };
}

export function desktopNavFromState(state: NavState): DesktopNavSnapshot {
    const fromPath = desktopNavFromWebPath();
    const fromTree = desktopNavFromStateTree(state);
    if (fromPath && fromTree && fromPath.activeKey !== fromTree.activeKey) {
        // Linking often paints the tab screen before the tab navigator state catches up.
        const mainRoute = state?.routes[state?.index ?? 0];
        if (mainRoute?.name === 'Main' || fromPath.activeKey !== ASSISTANT_NAME) {
            return fromPath;
        }
    }
    return fromTree ?? fromPath ?? { activeKey: ASSISTANT_NAME, title: titleForKey(ASSISTANT_NAME) };
}
