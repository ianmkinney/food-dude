import { Platform } from 'react-native';

const WEB_UI_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Web loads one variable Inter file (public/fonts); native registers one family per weight.
export const UI_FONTS =
    Platform.OS === 'web'
        ? { regular: WEB_UI_STACK, medium: WEB_UI_STACK, semibold: WEB_UI_STACK, bold: WEB_UI_STACK, extrabold: WEB_UI_STACK }
        : {
              regular: 'Inter_400Regular',
              medium: 'Inter_500Medium',
              semibold: 'Inter_600SemiBold',
              bold: 'Inter_700Bold',
              extrabold: 'Inter_800ExtraBold',
          };
