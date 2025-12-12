# Quick Guide: Sharing Food Dude with Others 🚀

## 🎯 Choose Your Method

### ⚡ Fastest: Expo Go (5 minutes)
**Perfect for:** Quick demos, testing with friends, showing off features

```bash
# 1. Start your app
npm start

# 2. Share the QR code that appears
# Others scan it with Expo Go app (free download)
```

**What testers need:**
- Install "Expo Go" from App Store/Play Store
- Scan your QR code
- Done! ✨

---

### 📱 Best for Testing: Development Build
**Perfect for:** Real app experience, beta testing, sharing with multiple people

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login
eas login

# 3. Configure (first time only)
eas build:configure

# 4. Build for Android
eas build --platform android --profile development

# 5. Share the download link EAS provides
```

**What testers get:**
- A real installable app (like from the store)
- Full functionality
- No Expo Go needed

---

### 🧪 Beta Testing: TestFlight / Internal Testing
**Perfect for:** Limited beta before public launch (up to 100 iOS testers)

**Android:**
1. Build: `eas build --platform android --profile production`
2. Upload to Google Play Console → Internal Testing
3. Add tester emails

**iOS:**
1. Build: `eas build --platform ios --profile production`
2. Submit: `eas submit -p ios`
3. Add testers in App Store Connect → TestFlight

---

### 🏪 Full Release: App Stores
**Perfect for:** Public launch, making it available to everyone

See `DEPLOYMENT_README.md` for complete instructions.

**Requirements:**
- Apple Developer Account ($99/year) for iOS
- Google Play Console ($25 one-time) for Android

---

## 💡 Recommendation

**Start with Expo Go** → Quick and easy for initial testing
**Move to Development Build** → When you want real app experience
**Use TestFlight/Internal** → For organized beta testing
**Go to Stores** → When ready for public release

---

## 🆘 Need Help?

- **Expo Docs**: https://docs.expo.dev
- **EAS Build**: https://docs.expo.dev/build/introduction/
- **Troubleshooting**: Check the main `DEPLOYMENT_README.md`
