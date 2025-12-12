import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';

/**
 * Renders styled text with markdown-like formatting
 * Supports: **bold**, *italic*, # headers, - lists, numbered lists, code blocks
 */
const StyledMessage = ({ message, isUser = false }) => {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const textColor = isUser ? '#FFFFFF' : theme.colors.text.primary;

    // Parse message into styled components
    const parseMessage = (text) => {
        // Split by lines first to handle headers and lists better
        const lines = text.split('\n');
        const parts = [];

        lines.forEach((line, lineIndex) => {
            const trimmedLine = line.trim();

            // Check for code blocks (multi-line)
            if (trimmedLine.startsWith('```')) {
                const codeContent = trimmedLine.replace(/```/g, '');
                if (codeContent) {
                    parts.push({ type: 'code', content: codeContent });
                }
                return;
            }

            // Check for headers
            const headerMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);
            if (headerMatch) {
                parts.push({
                    type: 'header',
                    content: headerMatch[2],
                    fullMatch: trimmedLine,
                });
                return;
            }

            // Check for list items
            const listMatch = trimmedLine.match(/^[-•]\s+(.+)$/);
            if (listMatch) {
                parts.push({ type: 'list', content: listMatch[1] });
                return;
            }

            // Check for numbered list
            const numberedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
            if (numberedMatch) {
                parts.push({ type: 'numbered', content: numberedMatch[1] });
                return;
            }

            // Process inline formatting (bold, italic) in the line
            if (trimmedLine) {
                // Process bold and italic
                let processedLine = trimmedLine;
                const inlineParts = [];
                let lastIndex = 0;

                // Match bold first (to avoid conflicts with italic)
                const boldRegex = /\*\*(.+?)\*\*/g;
                let match;
                const boldMatches = [];
                while ((match = boldRegex.exec(trimmedLine)) !== null) {
                    boldMatches.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        content: match[1],
                    });
                }

                // Match italic (avoiding bold)
                const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
                const italicMatches = [];
                while ((match = italicRegex.exec(trimmedLine)) !== null) {
                    // Check if it's not part of a bold match
                    const isInBold = boldMatches.some(
                        bm => match.index >= bm.start && match.index < bm.end
                    );
                    if (!isInBold) {
                        italicMatches.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            content: match[1],
                        });
                    }
                }

                // Combine and sort all inline matches
                const allMatches = [
                    ...boldMatches.map(m => ({ ...m, type: 'bold' })),
                    ...italicMatches.map(m => ({ ...m, type: 'italic' })),
                ].sort((a, b) => a.start - b.start);

                // Build inline parts
                allMatches.forEach((match) => {
                    if (match.start > lastIndex) {
                        const beforeText = trimmedLine.substring(lastIndex, match.start);
                        if (beforeText) {
                            inlineParts.push({ type: 'text', content: beforeText });
                        }
                    }
                    inlineParts.push({ type: match.type, content: match.content });
                    lastIndex = match.end;
                });

                if (lastIndex < trimmedLine.length) {
                    const remainingText = trimmedLine.substring(lastIndex);
                    if (remainingText) {
                        inlineParts.push({ type: 'text', content: remainingText });
                    }
                }

                if (inlineParts.length > 0) {
                    parts.push(...inlineParts);
                } else {
                    parts.push({ type: 'text', content: trimmedLine });
                }
            } else if (lineIndex < lines.length - 1) {
                // Empty line - add newline
                parts.push({ type: 'text', content: '\n' });
            }
        });

        // If no parts, return as plain text
        if (parts.length === 0) {
            return [{ type: 'text', content: text }];
        }

        return parts;
    };

    const renderPart = (part, index) => {
        switch (part.type) {
            case 'code':
                return (
                    <View key={index} style={[styles.codeBlock, { backgroundColor: theme.colors.surface }]}>
                        <Text style={[styles.codeText, { color: theme.colors.text.primary }]}>
                            {part.content}
                        </Text>
                    </View>
                );
            case 'header':
                const headerLevel = part.fullMatch ? part.fullMatch.match(/^#+/)?.[0]?.length || 1 : 1;
                return (
                    <Text
                        key={index}
                        style={[
                            styles.header,
                            headerLevel === 1 && styles.header1,
                            headerLevel === 2 && styles.header2,
                            headerLevel === 3 && styles.header3,
                            { color: textColor },
                        ]}
                    >
                        {part.content}
                        {'\n'}
                    </Text>
                );
            case 'bold':
                return (
                    <Text key={index} style={[styles.bold, { color: textColor }]}>
                        {part.content}
                    </Text>
                );
            case 'italic':
                return (
                    <Text key={index} style={[styles.italic, { color: textColor }]}>
                        {part.content}
                    </Text>
                );
            case 'list':
                return (
                    <View key={index} style={styles.listItem}>
                        <Text style={[styles.listBullet, { color: textColor }]}>• </Text>
                        <Text style={[styles.listText, { color: textColor }]}>{part.content}</Text>
                    </View>
                );
            case 'numbered':
                return (
                    <View key={index} style={styles.listItem}>
                        <Text style={[styles.listText, { color: textColor }]}>{part.content}</Text>
                    </View>
                );
            default:
                return (
                    <Text key={index} style={[styles.text, { color: textColor }]}>
                        {part.content}
                    </Text>
                );
        }
    };

    const parts = parseMessage(message);

    return (
        <View style={styles.container}>
            {parts.map((part, index) => renderPart(part, index))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'column',
    },
    text: {
        fontSize: 15,
        lineHeight: 22,
    },
    header: {
        fontWeight: 'bold',
        marginTop: 8,
        marginBottom: 4,
    },
    header1: {
        fontSize: 22,
        lineHeight: 28,
    },
    header2: {
        fontSize: 20,
        lineHeight: 26,
    },
    header3: {
        fontSize: 18,
        lineHeight: 24,
    },
    bold: {
        fontWeight: 'bold',
        fontSize: 15,
        lineHeight: 22,
    },
    italic: {
        fontStyle: 'italic',
        fontSize: 15,
        lineHeight: 22,
    },
    listItem: {
        flexDirection: 'row',
        marginTop: 4,
        marginBottom: 2,
    },
    listBullet: {
        fontSize: 15,
        lineHeight: 22,
        marginRight: 4,
    },
    listText: {
        fontSize: 15,
        lineHeight: 22,
        flex: 1,
    },
    codeBlock: {
        padding: 12,
        borderRadius: 8,
        marginVertical: 8,
        fontFamily: 'monospace',
    },
    codeText: {
        fontSize: 13,
        fontFamily: 'monospace',
        lineHeight: 18,
    },
});

export default StyledMessage;

