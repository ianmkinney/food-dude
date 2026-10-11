// Screens opened from a link or after a reload have no history, so a bare
// goBack() would do nothing; fall back to the tab the screen belongs to.
export function goBackOr(navigation, tab) {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main', { screen: tab });
}
