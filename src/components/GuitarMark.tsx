import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Pulse, Sway } from '../motion';
import guitar from '../brand/guitarPaths';

const { COLORS: C } = guitar;
const ASPECT = 136 / 150;

type Props = {
    size?: number;
    /** How the sound waves move: a beat or two, a steady loop, or not at all. */
    waves?: 'static' | 'once' | 'twice' | 'loop' | 'none';
    waveDelay?: number;
    sway?: boolean;
    style?: StyleProp<ViewStyle>;
};

function Guitar() {
    return (
        <G transform={guitar.GUITAR_TILT} strokeLinejoin="round" strokeLinecap="round">
            <Path d={guitar.leaves} fill={C.leaf} stroke={C.ink} strokeWidth={2.5} />
            <Path d={guitar.body} fill={C.tomato} stroke={C.ink} strokeWidth={3} />
            <Path d={guitar.neck} fill={C.crust} stroke={C.ink} strokeWidth={3} />
            <Path d={guitar.neckScores} stroke={C.crumb} strokeWidth={2} />
            {guitar.pegs.map(([cx, cy]: number[]) => (
                <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.8} fill={C.tomato} stroke={C.ink} strokeWidth={1.5} />
            ))}
            {guitar.pickups.map(([x, y, w, h]: number[]) => (
                <Rect key={y} x={x} y={y} width={w} height={h} rx={2} fill={C.cream} stroke={C.ink} strokeWidth={1.5} />
            ))}
            <Rect x={guitar.bridge[0]} y={guitar.bridge[1]} width={guitar.bridge[2]} height={guitar.bridge[3]} rx={1.5} fill={C.ink} />
            {guitar.strings.map((d: string) => (
                <Path key={d} d={d} stroke={C.cream} strokeWidth={1.2} />
            ))}
            <Circle cx={guitar.knob[0]} cy={guitar.knob[1]} r={guitar.knob[2]} fill={C.tomato} stroke={C.ink} strokeWidth={2} />
        </G>
    );
}

function Waves({ side }: { side: 'left' | 'right' }) {
    const paths: string[] = side === 'left' ? guitar.wavesLeft : guitar.wavesRight;
    return (
        <Svg viewBox={guitar.VIEW_BOX} style={StyleSheet.absoluteFill}>
            {paths.map((d) => (
                <Path key={d} d={d} stroke={C.wave} strokeWidth={5} strokeLinecap="round" fill="none" />
            ))}
        </Svg>
    );
}

/** The AmpliFood food-guitar drawn as vectors, so parts can move on their own. */
export default function GuitarMark({ size = 96, waves = 'static', waveDelay = 0, sway = false, style }: Props) {
    const box = { width: size * ASPECT, height: size };
    const body = (
        <Svg viewBox={guitar.VIEW_BOX} style={StyleSheet.absoluteFill}>
            <Guitar />
        </Svg>
    );
    const waveLayer = (side: 'left' | 'right', delay: number) =>
        waves === 'static' ? (
            <View style={StyleSheet.absoluteFill}>
                <Waves side={side} />
            </View>
        ) : (
            <Pulse times={waves === 'loop' ? 'infinite' : waves === 'twice' ? 2 : 1} delay={waveDelay + delay} style={StyleSheet.absoluteFill}>
                <Waves side={side} />
            </Pulse>
        );

    return (
        <View style={[box, style]} accessible={false} importantForAccessibility="no-hide-descendants">
            {waves !== 'none' && waveLayer('left', 0)}
            {waves !== 'none' && waveLayer('right', 80)}
            {sway ? <Sway style={StyleSheet.absoluteFill}>{body}</Sway> : body}
        </View>
    );
}
