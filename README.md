# Food Dude 🍳

A comprehensive cross-platform mobile recipe management app built with React Native and Expo. Import recipes from social media, plan your meals, manage your pantry, create smart grocery lists, and get AI-powered cooking assistance.

## ✨ Features

### 📚 Recipe Management
- **Recipe Book**: Browse and search your entire recipe collection
- **AI-Powered Import**: Parse recipes from text, URLs, or social media posts
- **Smart Search**: Find recipes by name, ingredients, or tags
- **Personal Notes**: Add your own modifications and cooking notes

### 📅 Meal Planning
- **Weekly Calendar**: Plan breakfast, lunch, and dinner for the entire week
- **Visual Planning**: Easy-to-use grid interface showing your meal schedule
- **Quick Navigation**: Move between weeks effortlessly

### 🥫 Pantry Management
- **Barcode Scanning**: Scan product barcodes to add items instantly
- **Manual Entry**: Add items manually with quantity and expiration dates
- **Categorization**: Organize items by category
- **Expiration Tracking**: Keep track of what needs to be used soon

### 🛒 Smart Grocery Lists
- **Auto-Generation**: Create grocery lists from your meal plan with one tap
- **Recipe Attribution**: See which recipe each ingredient is for
- **Check-Off**: Mark items as you shop
- **AI Price Estimator**: Get cost estimates for your grocery haul
- **Store Sections**: Filter items by grocery store section

### 🤖 AI Chef Assistant
- **Multi-Modal Chat**: Ask cooking questions via text, images, or video
- **Pantry Recipes**: Generate recipes based on what you have
- **Detailed Instructions**: Get step-by-step cooking guidance
- **Cooking Tips**: Expert advice on techniques and substitutions

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo Go app on your phone (iOS or Android)
- OR iOS Simulator (Mac only) / Android Emulator

### Installation

1. **Clone or navigate to the project directory**
   ```bash
   cd /Users/macbaby/Desktop/food_dude
   ```

2. **Install dependencies** (already done)
   ```bash
   npm install
   ```

3. **Configure API Keys**
   
   Edit the `.env` file and add your Google Gemini API key:
   ```
   EXPO_PUBLIC_GEMINI_API_KEY=your_actual_api_key_here
   ```
   
   Get your free API key from: https://makersuite.google.com/app/apikey

4. **Start the development server**
   ```bash
   npx expo start
   ```

### Running the App

Once the Expo server is running, you have several options:

#### Option 1: Physical Device (Recommended)
1. Install **Expo Go** from the App Store (iOS) or Play Store (Android)
2. Scan the QR code shown in the terminal with your phone's camera (iOS) or Expo Go app (Android)
3. The app will load on your device

#### Option 2: iOS Simulator (Mac only)
1. Install Xcode from the Mac App Store
2. Open Xcode and install iOS Simulator
3. In the Expo terminal, press `i` to open in iOS Simulator

#### Option 3: Android Emulator
1. Install Android Studio
2. Set up an Android Virtual Device (AVD)
3. In the Expo terminal, press `a` to open in Android Emulator

#### Option 4: Web Browser (Limited functionality)
1. Install web dependencies:
   ```bash
   npx expo install react-dom react-native-web
   ```
2. Press `w` in the Expo terminal
3. Note: Camera and some native features won't work on web

## 📱 App Structure

```
food_dude/
├── App.js                          # Main app entry point
├── app.json                        # Expo configuration
├── src/
│   ├── navigation/
│   │   └── AppNavigator.js         # Bottom tab navigation
│   ├── screens/
│   │   ├── RecipeBookScreen.js     # Recipe library
│   │   ├── MealPlannerScreen.js    # Weekly meal planner
│   │   ├── PantryScreen.js         # Pantry inventory
│   │   ├── GroceryListScreen.js    # Shopping list
│   │   └── AiChefScreen.js         # AI cooking assistant
│   ├── database/
│   │   ├── schema.js               # SQLite database schema
│   │   └── operations.js           # CRUD operations
│   ├── services/
│   │   ├── recipeParser.js         # AI recipe parsing
│   │   ├── aiChefService.js        # Multi-modal AI chef
│   │   ├── barcodeService.js       # Barcode lookup
│   │   └── groceryService.js       # Grocery list generation
│   ├── theme/
│   │   └── index.js                # Design system & colors
│   └── utils/
│       └── dateHelpers.js          # Date utilities
```

## 🎨 Design System

Food Dude features a modern, vibrant design with:
- **Primary Color**: Orange (#FF6B35) - warm and appetizing
- **Dark Mode Support**: Automatic theme switching
- **Smooth Animations**: Polished user experience
- **Consistent Spacing**: 8px grid system
- **Accessible Colors**: WCAG compliant contrast ratios

## 🔧 Technologies Used

- **React Native** - Cross-platform mobile framework
- **Expo** - Development platform and tooling
- **SQLite** - Local database for offline-first experience
- **Google Gemini AI** - Multi-modal AI for recipe parsing and assistance
- **React Navigation** - Navigation library
- **Expo Camera** - Barcode scanning
- **Open Food Facts API** - Product information database

## 📝 Usage Guide

### Adding Your First Recipe

1. Tap the **Recipes** tab
2. Tap the **+** button
3. Paste a recipe URL or text from Instagram, TikTok, YouTube, etc.
4. The AI will automatically parse ingredients and instructions
5. Review and save

### Planning Your Week

1. Go to the **Planner** tab
2. Navigate to your desired week
3. Tap any meal slot (breakfast, lunch, dinner)
4. Select a recipe from your collection
5. The meal is added to your plan

### Creating a Grocery List

1. Plan your meals for the week
2. Go to the **Grocery** tab
3. Tap "Generate from Meal Plan"
4. AI consolidates all ingredients
5. Check off items as you shop

### Using the AI Chef

1. Go to the **AI Chef** tab
2. Tap "Recipe from Pantry" to generate recipes from your ingredients
3. Or ask any cooking question in the chat
4. Upload images of ingredients for identification
5. Get detailed cooking instructions and tips

## 🔐 Privacy & Data

- **Local Storage**: All data is stored locally on your device using SQLite
- **No Account Required**: Use the app without signing up
- **API Keys**: Your Gemini API key is stored locally in `.env`
- **No Tracking**: We don't collect any usage data

## 🐛 Troubleshooting

### "Gemini API not configured" error
- Make sure you've added your API key to the `.env` file
- Restart the Expo server after adding the key

### Barcode scanner not working
- Grant camera permissions when prompted
- Ensure you're running on a physical device (simulators don't have cameras)

### Database errors
- Clear app data and restart
- On iOS: Delete and reinstall the app
- On Android: Clear app storage in settings

## 🚧 Future Enhancements

- [ ] Cloud sync and backup
- [ ] Recipe sharing with friends
- [ ] Nutrition information tracking
- [ ] Shopping list sharing with household
- [ ] Recipe collections and folders
- [ ] Cooking mode with voice commands
- [ ] Integration with grocery delivery services

## 📄 License

This project is for personal use. Built with ❤️ using React Native and Expo.

## 🙏 Acknowledgments

- **Deglaze App** - Inspiration for features and UX
- **Open Food Facts** - Free product database
- **Google Gemini** - AI capabilities
- **Expo Team** - Amazing development platform

---

**Enjoy cooking with Food Dude! 🍳👨‍🍳**
