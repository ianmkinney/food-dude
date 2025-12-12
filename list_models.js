const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!API_KEY) {
    console.error('API Key not found in environment variables');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
    try {
        // For v1beta, we might need to use a different way or just try to list
        // The SDK doesn't always expose listModels directly on the main class in all versions
        // But let's try the standard way if available, or just try to generate with a few known models

        console.log('Attempting to list models...');
        // Note: The Node.js SDK might not have a direct listModels method exposed easily on the client 
        // in some versions, but let's try to access the model manager if it exists.
        // Actually, for the GoogleGenerativeAI class, there isn't a listModels method.
        // We have to use the model directly.

        // Instead of listing, let's just try to generate content with a few candidates to see which one works.
        const candidates = [
            'gemini-2.5-flash', // The one that gave 503
            'gemini-1.5-flash',
            'gemini-1.5-flash-001',
            'gemini-pro',
        ];

        for (const modelName of candidates) {
            console.log(`Testing model: ${modelName}`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent('Hello');
                const response = await result.response;
                console.log(`✅ SUCCESS: ${modelName} is available.`);
                // Removed the break here as per the provided snippet, which implies testing all in the new list.
            } catch (error) {
                console.log(`❌ FAILED: ${modelName}`);
                console.log(`   Error: ${error.message}`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

listModels();
