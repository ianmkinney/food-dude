import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appConfig from '../../app.json';
import { buildIssueUrl } from './feedbackReport';
import { getSelectedProvider, isAiConfigured } from './aiSettings';

export {
    buildIssueUrl,
    buildReport,
    categoryLabel,
    redactSecrets,
    sanitizeBlock,
    sanitizeLine,
    validateReport,
} from './feedbackReport';

const HISTORY_KEY = 'fooddude.feedback.history';
const HISTORY_LIMIT = 10;

export const APP_VERSION = appConfig?.expo?.version || '0.0.0';

export async function collectDeviceContext({ screen } = {}) {
    let provider = null;
    let hasKey = false;
    try {
        provider = await getSelectedProvider();
        hasKey = await isAiConfigured();
    } catch {
        // Settings are unreadable on this device; the report is still useful.
    }

    return {
        appVersion: APP_VERSION,
        platform: Platform.OS,
        platformVersion: String(Platform.Version ?? 'unknown'),
        screen: screen || 'unknown',
        aiProvider: provider || 'none',
        aiKeySaved: hasKey,
    };
}

export async function recordSubmission({ title, category, url }) {
    const entry = {
        id: `fb_${Date.now()}`,
        title,
        category,
        url,
        submittedAt: new Date().toISOString(),
    };
    try {
        const existing = await listSubmissions();
        const next = [entry, ...existing].slice(0, HISTORY_LIMIT);
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
        // History is a convenience; a failed write must not block the handoff.
    }
    return entry;
}

export async function listSubmissions() {
    try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function clearSubmissions() {
    try {
        await AsyncStorage.removeItem(HISTORY_KEY);
    } catch {
        // nothing saved
    }
}

/**
 * Hand the report off: open the prefilled issue page in the user's browser and
 * remember that we did. Nothing is sent in the background and no credential is
 * involved — the reporter reviews the page and presses Submit.
 */
export async function handOffReport(report) {
    const url = buildIssueUrl(report);
    const opened = await Linking.openURL(url).then(
        () => true,
        () => false
    );
    const entry = await recordSubmission({ title: report.title, category: report.category, url });
    return { opened, url, entry };
}
