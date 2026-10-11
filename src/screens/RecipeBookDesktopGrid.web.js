import React from 'react';

const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
    gap: 16,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
};

const itemStyle = {
    minWidth: 0,
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
};

/** CSS grid wrapper for recipe cards (web desktop only). */
export default function RecipeBookDesktopGrid({ children }) {
    return (
        <div style={gridStyle}>
            {React.Children.map(children, (child, index) => (
                <div key={child?.key ?? index} style={itemStyle}>
                    {child}
                </div>
            ))}
        </div>
    );
}
