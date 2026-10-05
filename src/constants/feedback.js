// Where in-app reports are handed off. The app never holds a GitHub or Cursor
// credential: it opens a prefilled "New issue" page in the user's own browser,
// where they are already signed in, and they press Submit themselves.
export const FEEDBACK_REPO = 'ianmkinney/food-dude';

// `user-feedback` is the label the repo workflow watches. Keep both in sync with
// .github/workflows/feedback-to-cloud-agent.yml.
export const FEEDBACK_LABELS = ['user-feedback', 'from-app'];

export const FEEDBACK_MARKER = 'food-dude-feedback:v1';

export const FEEDBACK_CATEGORIES = [
    { id: 'broken', label: 'Something broke', icon: 'bug-outline' },
    { id: 'wrong', label: 'Wrong result', icon: 'alert-circle-outline' },
    { id: 'confusing', label: 'Confusing UI', icon: 'help-circle-outline' },
    { id: 'slow', label: 'Too slow', icon: 'hourglass-outline' },
    { id: 'idea', label: 'Idea', icon: 'bulb-outline' },
];

export const FEEDBACK_LIMITS = {
    title: 80,
    problem: 2000,
    expected: 1000,
    steps: 1500,
    // GitHub rejects request lines past roughly 8k, so the generated issue body
    // is trimmed well under that before it ever becomes a URL.
    url: 6000,
};

export const FEEDBACK_MIN_PROBLEM_LENGTH = 12;

// Shown verbatim in the UI so the attached context is never a surprise.
export const FEEDBACK_CONTEXT_DISCLOSURE = [
    'App version, and the platform or browser you are on',
    'Which screen you were on when you opened this form',
    'Light or dark mode',
    'Which AI provider is selected, and whether a key is saved — never the key itself',
];

export const FEEDBACK_PRIVACY_NOTE =
    'Reports leave this device only when you press Submit on the GitHub page that opens. ' +
    'Your recipes, pantry, profile, and API keys are never attached.';
