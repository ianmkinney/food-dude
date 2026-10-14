/**
 * Add Recipe surfaces. Light mode keeps the cream link card.
 * Dark mode must not use primary[50]/[100]: those ramps stay cream in both schemes,
 * and dark-mode hint text on that cream is unreadable.
 *
 * @param {{ isDark?: boolean, colors: { surface: string, background: string, border: string, text: { primary: string, secondary: string, tertiary: string } }, primary: Record<number, string> }} theme
 */
export function addRecipeSurfaces(theme) {
    const dark = !!theme.isDark;
    return {
        linkCard: {
            backgroundColor: dark ? theme.colors.surface : theme.primary[50],
            borderColor: dark ? theme.colors.border : theme.primary[200],
        },
        linkTitle: dark ? theme.colors.text.primary : theme.primary[800],
        linkHint: theme.colors.text.secondary,
        linkIcon: dark ? theme.primary[300] : theme.primary[600],
        paste: dark ? theme.primary[300] : theme.primary[700],
        inputRow: {
            backgroundColor: dark ? theme.colors.background : theme.colors.surface,
            borderColor: theme.colors.border,
        },
        inputText: theme.colors.text.primary,
        inputPlaceholder: theme.colors.text.tertiary,
        modeSelected: dark ? theme.primary[900] : theme.primary[100],
        modeSelectedText: dark ? theme.primary[300] : theme.primary[600],
        imagePicker: {
            backgroundColor: dark ? theme.colors.surface : theme.primary[50],
            borderColor: dark ? theme.primary[400] : theme.primary[500],
        },
        imagePickerText: dark ? theme.primary[300] : theme.primary[700],
    };
}
