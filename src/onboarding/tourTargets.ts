import { useCallback } from 'react';

// Real UI elements register here so the tour can spotlight them where they
// actually are on screen (tab buttons, the Sous composer, …).

export type Rect = { x: number; y: number; width: number; height: number };

type Measurable = { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void };

const targets = new Map<string, Measurable>();

export function useTourTarget(id: string) {
    return useCallback(
        (node: unknown) => {
            if (node && typeof (node as Measurable).measureInWindow === 'function') {
                targets.set(id, node as Measurable);
            } else if (!node) {
                targets.delete(id);
            }
        },
        [id]
    );
}

export function measureTarget(id: string): Promise<Rect | null> {
    const node = targets.get(id);
    if (!node) return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            node.measureInWindow((x, y, width, height) =>
                resolve(width > 0 && height > 0 ? { x, y, width, height } : null)
            );
        } catch {
            resolve(null);
        }
    });
}
