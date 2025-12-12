# 🚨 IMPORTANT: How to Run Food Dude

## The app is FULLY BUILT and ready to run! ✅

However, **SQLite does not work on web browsers**. You need to run this on a mobile device or simulator.

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

## ⚙️ Before Running: Configure API Key

Edit `.env` and add your Google Gemini API key:
```
EXPO_PUBLIC_GEMINI_API_KEY=your_actual_api_key_here
```

Get a free API key: https://makersuite.google.com/app/apikey

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

**"Gemini API not configured"**
→ Add your API key to the `.env` file

**Web bundling errors**
→ This is expected! The app needs native features (SQLite, Camera) that don't work on web. Use a phone or simulator instead.

---

**The app is complete and ready to use! Just run it on a mobile device.** 📱✨
