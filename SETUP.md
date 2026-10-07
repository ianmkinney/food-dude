# How to Run AmpliFood

AmpliFood runs on iOS and Android (Expo Go, simulators, or builds) and in a web browser (`npm run web`). Barcode camera scanning and the share sheet are phone-only. For hosting the web build, see [WEB_DEPLOY.md](./WEB_DEPLOY.md).

## ✅ Recommended: Use Your Phone (Easiest!)

1. **Install Expo Go** on your phone:
   - iOS: Download from App Store
   - Android: Download from Play Store

2. **Start the server** (if not already running):
   ```bash
   npx expo start
   ```

3. **Scan the QR code**:
   - iOS: Use your Camera app
   - Android: Use the Expo Go app

4. **The app will load on your phone!** 🎉

## Alternative: Use a Simulator

### iOS Simulator (Mac only)
```bash
# 1. Install Xcode from Mac App Store
# 2. Open Xcode, go to Preferences → Components → Install iOS Simulator
# 3. Run:
npx expo start
# 4. Press 'i' to open in iOS Simulator
```

### Android Emulator
```bash
# 1. Install Android Studio
# 2. Set up an Android Virtual Device (AVD)
# 3. Run:
npx expo start
# 4. Press 'a' to open in Android Emulator
```

## ⚙️ AI keys (optional)

Recipes, planner, pantry, and grocery work with no key. For AI Chef / import, open **Account** in the app and paste a Claude, OpenAI, Grok, or Gemini key. Keys stay on the device — do not put them in `.env`.

## 📱 What You'll See

Once running, you'll have access to:
- **Recipe Book**: Browse and search recipes
- **Meal Planner**: Weekly calendar for meal planning
- **Pantry**: Track your ingredients
- **Grocery List**: Smart shopping lists
- **AI Chef**: Chat with AI for cooking help

## 🐛 Troubleshooting

**"No iOS devices available"**
→ Install Xcode and iOS Simulator (Mac only)

**"Android SDK not found"**
→ Install Android Studio and set up an emulator

**"Add an API key in Account"**
→ Open Account, save a provider key on this device

**Web bundling errors**
→ Use a real browser at the Expo web URL (not a vscode-file preview). Metro treats `.wasm` as an asset for SQLite. No COOP/COEP headers are needed because the app only uses the async SQLite API. Camera/barcode degrade on web; use Expo Go for scanning.

**"AmpliFood is open in another tab" (web)**
→ The browser database can only be open in one tab. Close the other tab and press Try again.

---

**Run it on a phone, a simulator, or in the browser.**
