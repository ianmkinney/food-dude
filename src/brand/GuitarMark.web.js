import React from 'react';
import { View } from 'react-native';
import {
    BODY,
    BODY_LEAVES,
    COLORS,
    GUITAR_ROTATION,
    HEAD_LEAVES,
    NECK,
    STRINGS,
    VIEWBOX,
    WAVES_LEFT,
    WAVES_RIGHT,
} from './guitarPaths';

const WAVE_CLASS = { idle: 'af-m-idle', thinking: 'af-m-thinking', once: 'af-m-once', static: '' };

/**
 * The guitar mascot as inline SVG. Animation is CSS (keyframes live in
 * public/index.html), so it runs on the compositor and the
 * prefers-reduced-motion media query switches it off.
 */
export default function GuitarMark(props) {
    const { size = 96, waves = 'idle', sway = false, style } = props;
    const className = ['af-mark', WAVE_CLASS[waves] || '', sway ? 'af-m-sway' : ''].join(' ').trim();
    return (
        <View style={[{ width: size, height: size }, style]} accessible={false} importantForAccessibility="no-hide-descendants">
            <svg className={className} viewBox={VIEWBOX} width={size} height={size} aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
                <g fill="none" stroke={COLORS.wave} strokeWidth={6} strokeLinecap="round">
                    {WAVES_LEFT.map((d) => (
                        <path key={d} className="af-wave af-wave-l" d={d} />
                    ))}
                    {WAVES_RIGHT.map((d) => (
                        <path key={d} className="af-wave af-wave-r" d={d} />
                    ))}
                </g>
                <g className="af-body">
                    <g transform={GUITAR_ROTATION} stroke={COLORS.ink} strokeWidth={3.5} strokeLinejoin="round">
                        <path fill={COLORS.tomato} d={BODY} />
                        <path fill={COLORS.leaf} d={BODY_LEAVES} />
                        <path fill={COLORS.orange} d={NECK} />
                        <path fill={COLORS.leaf} d={HEAD_LEAVES} />
                        <rect x={60} y={101} width={20} height={5} rx={2} fill={COLORS.cream} stroke="none" />
                        <rect x={61} y={116} width={18} height={5} rx={2} fill={COLORS.ink} stroke="none" />
                        <path d={STRINGS} stroke={COLORS.cream} strokeWidth={1.2} />
                    </g>
                </g>
            </svg>
        </View>
    );
}
