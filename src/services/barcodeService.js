/**
 * Barcode scanning service using Open Food Facts API
 * Free, open database of food products worldwide
 */

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v0/product';
const USER_AGENT = process.env.EXPO_PUBLIC_FOOD_API_USER_AGENT || 'FoodDude/1.0';

/**
 * Look up product information by barcode
 */
export const lookupBarcode = async (barcode) => {
    try {
        const response = await fetch(`${OPEN_FOOD_FACTS_API}/${barcode}.json`, {
            headers: {
                'User-Agent': USER_AGENT,
            },
        });

        const data = await response.json();

        if (data.status === 1 && data.product) {
            const product = data.product;

            return {
                success: true,
                product: {
                    name: product.product_name || 'Unknown Product',
                    brand: product.brands || null,
                    category: product.categories_tags?.[0]?.replace('en:', '') || null,
                    imageUri: product.image_url || null,
                    quantity: product.quantity || null,
                    barcode: barcode,
                    ingredients: product.ingredients_text || null,
                    nutritionInfo: {
                        servingSize: product.serving_size || null,
                        calories: product.nutriments?.['energy-kcal'] || null,
                        protein: product.nutriments?.proteins || null,
                        carbs: product.nutriments?.carbohydrates || null,
                        fat: product.nutriments?.fat || null,
                    },
                },
            };
        } else {
            return {
                success: false,
                error: 'Product not found in database',
            };
        }
    } catch (error) {
        console.error('Error looking up barcode:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Search products by name
 */
export const searchProducts = async (query) => {
    try {
        const response = await fetch(
            `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=20`,
            {
                headers: {
                    'User-Agent': USER_AGENT,
                },
            }
        );

        const data = await response.json();

        if (data.products && data.products.length > 0) {
            return {
                success: true,
                products: data.products.map(product => ({
                    name: product.product_name || 'Unknown Product',
                    brand: product.brands || null,
                    category: product.categories_tags?.[0]?.replace('en:', '') || null,
                    imageUri: product.image_url || null,
                    barcode: product.code || null,
                })),
            };
        } else {
            return {
                success: false,
                error: 'No products found',
            };
        }
    } catch (error) {
        console.error('Error searching products:', error);
        return {
            success: false,
            error: error.message,
        };
    }
};
