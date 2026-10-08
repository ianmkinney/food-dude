# Sous onboarding audio

`script.json` is the source of truth for every scripted onboarding line (the same text is shown as the caption). `manifest.json` says whether the `.wav` files are real audio or silent placeholders; while `placeholder` is `true` the app reads the lines with the device's voice (`expo-speech`).

To render the real AI voice (developer machine only; the key never enters the app):

```bash
ELEVENLABS_API_KEY=... SOUS_VOICE_ID=... node scripts/generate-sous-audio.mjs
```

Pending Ian's spend approval: use an ElevenLabs **Starter-or-higher** plan (commercial rights), a **Voice Design** voice (not a clone of a real person), and turn **off** training on your data. Re-run after editing `script.json`.
