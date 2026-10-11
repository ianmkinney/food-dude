/**
 * Native apps use KeyboardAvoidingView; only the web needs to follow the
 * visual viewport. Same shape as useKeyboardViewport.web.ts.
 */
export function useKeyboardViewport(_active: boolean, _onChange?: () => void): { keyboardOpen: boolean } {
    return { keyboardOpen: false };
}
