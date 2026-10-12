const appJson = require('./app.json');
const pkg = require('./package.json');

/** @type {import('expo/config').ExpoConfig} */
let buildMetadata = { gitCommit: 'dev', buildDate: '' };
try {
    buildMetadata = require('./src/generated/buildMetadata.json');
} catch {
    // Local dev before first metadata script run.
}

module.exports = {
    expo: {
        ...appJson.expo,
        version: pkg.version,
        extra: {
            ...appJson.expo.extra,
            buildMetadata,
        },
    },
};
