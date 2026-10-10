/**
 * Static first-run shell for the web build: the onboarding intro screen as
 * plain HTML, so first-time visitors see it as soon as the splash finishes
 * instead of waiting for the bundle and the SQLite wasm. Copy comes from the
 * same JSON the app uses, and the layout mirrors OnboardingFlow's intro step;
 * public/index.html holds its CSS and removes it when the app is ready.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const SPARKLE =
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 2l2.2 6.3L18.5 10.5l-6.3 2.2L10 19l-2.2-6.3L1.5 10.5l6.3-2.2z"/><path d="M19 13l1 2.8 2.8 1-2.8 1L19 21l-1-2.8-2.8-1 2.8-1z"/></svg>';
const SPEAKER =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';

function buildShell({ fontFaces = '' } = {}) {
    const assistant = readJson('src/config/assistant.json');
    const script = readJson('assets/audio/sous/script.json');
    const name = escapeHtml(assistant.name);
    const caption = escapeHtml(script.lines.intro);
    const lead = `<b>Hi, I'm ${name}, ${escapeHtml(assistant.tagline)}.</b> I'm an AI assistant, not a person. My voice is generated on your device, and AI can make mistakes, so always check ingredients and labels yourself.`;
    return [
        fontFaces && `<style>${fontFaces}</style>`,
        '<div id="af-shell" aria-busy="true">',
        '<div class="afs-screen">',
        '<div class="afs-top">',
        '<div class="afs-mark"></div>',
        '<div class="afs-name-col">',
        `<div class="afs-name">AmpliFood · ${name}</div>`,
        `<div class="afs-name-row"><span class="afs-small">${escapeHtml(assistant.pronunciation)}</span><span class="afs-badge">${SPARKLE}AI-generated</span></div>`,
        '</div>',
        `<div class="afs-mute">${SPEAKER}</div>`,
        '</div>',
        '<div class="afs-content">',
        `<div class="afs-caption"><div class="afs-caption-tag">CAPTION</div><div class="afs-caption-text">${caption}</div></div>`,
        `<p class="afs-lead">${lead}</p>`,
        '<div class="afs-row"><button class="afs-button afs-primary" disabled>Let\'s go</button><button class="afs-button" disabled>Skip setup</button></div>',
        '</div>',
        '</div>',
        '</div>',
    ]
        .filter(Boolean)
        .join('');
}

module.exports = { buildShell };
