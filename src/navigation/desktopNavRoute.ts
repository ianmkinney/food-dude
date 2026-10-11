import { ASSISTANT_NAME } from '../config/assistant';

export type DesktopNavSnapshot = {
    activeKey: string;
    title: string;
};

export function desktopNavFromState(state: { routes: { name: string; state?: unknown; params?: object }[]; index: number } | undefined): DesktopNavSnapshot {
    if (!state) return { activeKey: ASSISTANT_NAME, title: ASSISTANT_NAME };
    const route = state.routes[state.index];
    if (route.name === 'Main' && route.state && typeof route.state === 'object' && 'routes' in route.state) {
        const tabState = route.state as { routes: { name: string }[]; index: number };
        const tab = tabState.routes[tabState.index ?? 0];
        const key = tab?.name ?? ASSISTANT_NAME;
        return { activeKey: key, title: titleForKey(key) };
    }
    if (route.name === 'Party') return { activeKey: 'Party', title: 'Parties' };
    if (route.name === 'Account') return { activeKey: 'Account', title: 'Account' };
    return { activeKey: route.name, title: titleForKey(route.name) };
}

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
