import { createContext } from 'react';

/**
 * `scale` multiplies every font size and line height in app code.
 * `explicit` is true once the user picks a size in Account; native then stops
 * stacking the OS font scale on top of ours.
 */
export const TextScaleContext = createContext({ scale: 1, explicit: false });
