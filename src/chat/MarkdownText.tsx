import React, { useMemo } from 'react';
import { Linking, Platform, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { parseMarkdown, type Inline } from './markdown';

type Props = {
    text: string;
    color: string;
    mutedColor: string;
    linkColor: string;
    codeBackground: string;
    style?: StyleProp<TextStyle>;
};

const monospace = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });

function linkProps(href: string): object {
    if (Platform.OS === 'web') {
        // react-native-web renders this as <a href target rel>.
        return { href, hrefAttrs: { target: '_blank', rel: 'noopener noreferrer' } };
    }
    return { onPress: () => Linking.openURL(href).catch(() => undefined) };
}

function renderInline(nodes: Inline[], props: Props, keyPrefix = ''): React.ReactNode[] {
    return nodes.map((node, i) => {
        const key = `${keyPrefix}${i}`;
        switch (node.type) {
            case 'text':
                return node.text;
            case 'bold':
                return (
                    <Text key={key} style={styles.bold}>
                        {renderInline(node.children, props, `${key}.`)}
                    </Text>
                );
            case 'italic':
                return (
                    <Text key={key} style={styles.italic}>
                        {renderInline(node.children, props, `${key}.`)}
                    </Text>
                );
            case 'strike':
                return (
                    <Text key={key} style={styles.strike}>
                        {renderInline(node.children, props, `${key}.`)}
                    </Text>
                );
            case 'code':
                return (
                    <Text key={key} style={[styles.code, { backgroundColor: props.codeBackground }]}>
                        {node.text}
                    </Text>
                );
            case 'link':
                return (
                    <Text
                        key={key}
                        accessibilityRole="link"
                        style={[styles.link, { color: props.linkColor }]}
                        {...linkProps(node.href)}
                    >
                        {renderInline(node.children, props, `${key}.`)}
                    </Text>
                );
            default:
                return null;
        }
    });
}

/** Renders a chat reply's Markdown as native Text; no HTML is ever interpreted. */
export default function MarkdownText(props: Props) {
    const { text, color, mutedColor, codeBackground, style } = props;
    const blocks = useMemo(() => parseMarkdown(text), [text]);
    const base = [style, { color }];

    return (
        <View style={styles.root}>
            {blocks.map((block, i) => {
                switch (block.type) {
                    case 'paragraph':
                        return (
                            <Text key={i} style={base} selectable>
                                {renderInline(block.content, props)}
                            </Text>
                        );
                    case 'heading':
                        return (
                            <Text
                                key={i}
                                style={[base, styles.heading, block.level <= 2 && styles.headingLarge]}
                                accessibilityRole="header"
                                selectable
                            >
                                {renderInline(block.content, props)}
                            </Text>
                        );
                    case 'list':
                        return (
                            <View key={i} style={styles.list} accessibilityRole="list">
                                {block.items.map((item, j) => (
                                    <View key={j} style={styles.listItem}>
                                        <Text
                                            style={[base, styles.marker, block.ordered && styles.markerOrdered, { color: mutedColor }]}
                                            aria-hidden
                                        >
                                            {item.marker}
                                        </Text>
                                        <Text style={[base, styles.listText]} selectable>
                                            {renderInline(item.content, props)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        );
                    case 'quote':
                        return (
                            <View key={i} style={[styles.quote, { borderColor: mutedColor }]}>
                                <Text style={[base, { color: mutedColor }]} selectable>
                                    {renderInline(block.content, props)}
                                </Text>
                            </View>
                        );
                    case 'code':
                        return (
                            <View key={i} style={[styles.codeBlock, { backgroundColor: codeBackground }]}>
                                <Text style={[base, styles.codeBlockText]} selectable>
                                    {block.text}
                                </Text>
                            </View>
                        );
                    case 'rule':
                        return <View key={i} style={[styles.rule, { backgroundColor: mutedColor }]} />;
                    default:
                        return null;
                }
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 6 },
    bold: { fontWeight: '700' },
    italic: { fontStyle: 'italic' },
    strike: { textDecorationLine: 'line-through' },
    code: { fontFamily: monospace, fontSize: 14, borderRadius: 4, paddingHorizontal: 3 },
    link: { textDecorationLine: 'underline' },
    heading: { fontWeight: '800' },
    headingLarge: { fontSize: 18, lineHeight: 24 },
    list: { gap: 3 },
    listItem: { flexDirection: 'row', gap: 6 },
    marker: { minWidth: 10, textAlign: 'center' },
    markerOrdered: { minWidth: 18, textAlign: 'right', fontVariant: ['tabular-nums'] },
    listText: { flex: 1 },
    quote: { borderLeftWidth: 3, paddingLeft: 10 },
    codeBlock: { borderRadius: 8, padding: 10 },
    codeBlockText: { fontFamily: monospace, fontSize: 13, lineHeight: 18 },
    rule: { height: StyleSheet.hairlineWidth, opacity: 0.5, marginVertical: 4 },
});
