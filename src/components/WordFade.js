import React from 'react';
import { Platform, Text } from 'react-native';

const MAX_BUCKET = 40;

/**
 * Fades a fresh reply in word by word on web. Each word gets a delay bucket
 * (`data-afw`), styled in public/index.html, so it is pure CSS opacity. Native
 * shows the text at once; the bubble itself springs in.
 */
export default function WordFade({ text, animate, style, ...rest }) {
    if (!animate || Platform.OS !== 'web' || !text) {
        return (
            <Text style={style} {...rest}>
                {text}
            </Text>
        );
    }
    let word = 0;
    const parts = text.split(/(\s+)/);
    return (
        <Text style={style} {...rest}>
            {parts.map((part, i) =>
                !part || /^\s+$/.test(part) ? (
                    part
                ) : (
                    <Text key={i} dataSet={{ afw: String(Math.min(word++, MAX_BUCKET)) }}>
                        {part}
                    </Text>
                )
            )}
        </Text>
    );
}
