import Constants from 'expo-constants';
import changelog from '../generated/changelog.json';

export type BundledRelease = {
    version: string;
    date: string;
    body: string;
};

export type BuildMetadata = {
    gitCommit: string;
    buildDate: string;
};

function readBuildMetadata(): BuildMetadata {
    const extra = Constants.expoConfig?.extra as { buildMetadata?: BuildMetadata } | undefined;
    const meta = extra?.buildMetadata;
    return {
        gitCommit: meta?.gitCommit || 'dev',
        buildDate: meta?.buildDate || '',
    };
}

export function getAppVersionLabel(): string {
    return Constants.expoConfig?.version || '0.0.0';
}

export function getBuildMetadata(): BuildMetadata {
    return readBuildMetadata();
}

export function formatBuildDate(iso: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getVersionLine(): string {
    const version = getAppVersionLabel();
    const { gitCommit, buildDate } = getBuildMetadata();
    const built = formatBuildDate(buildDate);
    const parts = [`Version ${version}`, gitCommit];
    if (built) parts.push(`built ${built}`);
    return parts.join(' · ');
}

export function getBundledReleases(): BundledRelease[] {
    return changelog.releases ?? [];
}
