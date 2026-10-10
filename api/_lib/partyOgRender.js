import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1200;
const HEIGHT = 630;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let fontsPromise = null;

function loadFonts() {
    if (!fontsPromise) {
        fontsPromise = Promise.resolve([
            {
                name: 'Inter',
                data: readFileSync(
                    join(repoRoot, 'node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf')
                ),
                weight: 400,
                style: 'normal',
            },
            {
                name: 'Inter',
                data: readFileSync(
                    join(repoRoot, 'node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf')
                ),
                weight: 700,
                style: 'normal',
            },
        ]);
    }
    return fontsPromise;
}

/**
 * Render a 1200×630 party invite OG card as PNG bytes.
 * @param {{ title: string, backgroundImageUrl?: string | null }} options
 * @returns {Promise<Buffer>}
 */
export async function renderPartyOgPng({ title, backgroundImageUrl }) {
    const safeTitle = String(title || 'AmpliFood Party').slice(0, 120);
    const hasBg = Boolean(backgroundImageUrl);
    const fonts = await loadFonts();

    const element = React.createElement(
        'div',
        {
            style: {
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'flex-start',
                backgroundColor: '#042f2e',
                backgroundImage: hasBg
                    ? `linear-gradient(180deg, rgba(4,47,46,0.12) 0%, rgba(4,47,46,0.88) 72%), url(${backgroundImageUrl})`
                    : 'linear-gradient(135deg, #0f766e 0%, #134e4a 50%, #042f2e 100%)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                color: '#ffffff',
                fontFamily: 'Inter',
                padding: '56px',
            },
        },
        React.createElement(
            'div',
            {
                style: {
                    fontSize: 32,
                    fontWeight: 400,
                    marginBottom: 12,
                    opacity: 0.92,
                },
            },
            'AmpliFood'
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontSize: 72,
                    fontWeight: 700,
                    lineHeight: 1.05,
                    maxWidth: 1000,
                },
            },
            safeTitle
        ),
        React.createElement(
            'div',
            {
                style: {
                    fontSize: 30,
                    fontWeight: 400,
                    marginTop: 20,
                    opacity: 0.9,
                },
            },
            'Join the party'
        )
    );

    const svg = await satori(element, {
        width: WIDTH,
        height: HEIGHT,
        fonts,
    });
    const png = new Resvg(svg).render().asPng();
    const buffer = Buffer.from(png);
    if (!buffer.length) {
        throw new Error('OG render produced empty body');
    }
    return buffer;
}
