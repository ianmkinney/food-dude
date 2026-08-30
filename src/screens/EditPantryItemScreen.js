import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { CameraView, isCameraAvailable, useCameraPermissions } from '../platform/camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { pantryOperations } from '../database/operations';
import { lookupBarcode } from '../services/barcodeService';

const EditPantryItemScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { item } = route.params;
    const { isDark } = useTheme();
    const theme = getTheme(isDark);

    const [permission, requestPermission] = useCameraPermissions();
    const [isScanning, setIsScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [scanned, setScanned] = useState(false);

    // Form State
    const [name, setName] = useState(item.name || '');
    const [quantity, setQuantity] = useState(item.quantity ? item.quantity.toString() : '1');
    const [unit, setUnit] = useState(item.unit || '');
    const [category, setCategory] = useState(item.category || '');
    const [barcode, setBarcode] = useState(item.barcode || '');
    const [expirationDate, setExpirationDate] = useState(
        item.expiration_date ? new Date(item.expiration_date).toISOString().split('T')[0] : ''
    );
    const [location, setLocation] = useState(item.location || '');
    const [notes, setNotes] = useState(item.notes || '');
    const [imageUri, setImageUri] = useState(item.image_uri || null);

    useEffect(() => {
        // Initialize form with item data
        if (item) {
            setName(item.name || '');
            setQuantity(item.quantity ? item.quantity.toString() : '1');
            setUnit(item.unit || '');
            setCategory(item.category || '');
            setBarcode(item.barcode || '');
            setExpirationDate(
                item.expiration_date ? new Date(item.expiration_date).toISOString().split('T')[0] : ''
            );
            setLocation(item.location || '');
            setNotes(item.notes || '');
            setImageUri(item.image_uri || null);
        }
    }, [item]);

    const startScanning = async () => {
        if (!isCameraAvailable) {
            Alert.alert(
                'Camera on the phone app',
                'Barcode scanning needs the camera in Expo Go or a native build. Type the barcode below, or edit the item by name.'
            );
            return;
        }
        if (!permission) {
            await requestPermission();
        }
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert('Permission Required', 'Camera permission is needed to scan barcodes');
                return;
            }
        }
        setScanned(false);
        setIsScanning(true);
    };

    const handleBarCodeScanned = async ({ type, data }) => {
        setScanned(true);
        setIsScanning(false);
        setBarcode(data);
        setLoading(true);

        try {
            const result = await lookupBarcode(data);
            if (result.success) {
                const product = result.product;
                setName(product.name);
                setCategory(product.category || category);
                setImageUri(product.imageUri);
                // Try to parse quantity if available
                if (product.quantity) {
                    const match = product.quantity.match(/^(\d+(\.\d+)?)\s*([a-zA-Z]+)?$/);
                    if (match) {
                        setQuantity(match[1]);
                        setUnit(match[3] || unit);
                    }
                }
            } else {
                Alert.alert('Product Not Found', 'Could not find product details. Please enter manually.');
            }
        } catch (error) {
            console.error('Error looking up barcode:', error);
            Alert.alert('Error', 'Failed to lookup product details');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter a product name');
            return;
        }

        setLoading(true);
        try {
            await pantryOperations.update(item.id, {
                name,
                quantity: parseFloat(quantity) || null,
                unit,
                category,
                barcode,
                imageUri,
                expirationDate: expirationDate ? new Date(expirationDate).toISOString() : null,
                location,
                notes,
            });
            Alert.alert('Success', 'Item updated successfully', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            console.error('Error updating pantry item:', error);
            Alert.alert('Error', 'Failed to update item');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <ScrollView style={styles.container}>
                <View style={styles.content}>
                    {/* Scan Button */}
                    <TouchableOpacity
                        style={[styles.scanButton, { borderColor: theme.primary[500] }]}
                        onPress={startScanning}
                    >
                        <Ionicons name="barcode-outline" size={24} color={theme.primary[500]} />
                        <Text style={[styles.scanButtonText, { color: theme.primary[500] }]}>
                            Scan Barcode
                        </Text>
                    </TouchableOpacity>

                    {loading && <ActivityIndicator size="large" color={theme.primary[500]} style={styles.loader} />}

                    {/* Form Fields */}
                    <View style={styles.form}>
                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Name</Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={name}
                            onChangeText={setName}
                            placeholder="Item Name"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />

                        <View style={styles.row}>
                            <View style={[styles.col, { flex: 1 }]}>
                                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Quantity</Text>
                                <TextInput
                                    style={[styles.input, {
                                        backgroundColor: theme.colors.surface,
                                        color: theme.colors.text.primary,
                                        borderColor: theme.colors.border
                                    }]}
                                    value={quantity}
                                    onChangeText={setQuantity}
                                    keyboardType="numeric"
                                    placeholder="1"
                                    placeholderTextColor={theme.colors.text.tertiary}
                                />
                            </View>
                            <View style={[styles.col, { flex: 1, marginLeft: 10 }]}>
                                <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Unit</Text>
                                <TextInput
                                    style={[styles.input, {
                                        backgroundColor: theme.colors.surface,
                                        color: theme.colors.text.primary,
                                        borderColor: theme.colors.border
                                    }]}
                                    value={unit}
                                    onChangeText={setUnit}
                                    placeholder="e.g. kg, pcs"
                                    placeholderTextColor={theme.colors.text.tertiary}
                                />
                            </View>
                        </View>

                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Category</Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={category}
                            onChangeText={setCategory}
                            placeholder="e.g. Dairy, Produce"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />

                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Barcode</Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={barcode}
                            onChangeText={setBarcode}
                            placeholder="Optional"
                            placeholderTextColor={theme.colors.text.tertiary}
                            keyboardType="numeric"
                        />

                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Expiration Date</Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={expirationDate}
                            onChangeText={setExpirationDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />

                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Location</Text>
                        <TextInput
                            style={[styles.input, {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="e.g. Fridge, Pantry, Freezer"
                            placeholderTextColor={theme.colors.text.tertiary}
                        />

                        <Text style={[styles.label, { color: theme.colors.text.secondary }]}>Notes</Text>
                        <TextInput
                            style={[styles.textArea, {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border
                            }]}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Optional notes"
                            placeholderTextColor={theme.colors.text.tertiary}
                            multiline
                            numberOfLines={3}
                        />

                        <TouchableOpacity
                            style={[styles.saveButton, { backgroundColor: theme.primary[500] }]}
                            onPress={handleSave}
                            disabled={loading}
                        >
                            <Text style={styles.saveButtonText}>Update Item</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {/* Camera Modal */}
            <Modal
                visible={isScanning}
                animationType="slide"
                onRequestClose={() => setIsScanning(false)}
            >
                <View style={styles.container}>
                    <CameraView
                        style={styles.camera}
                        facing="back"
                        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                    >
                        <View style={styles.overlay}>
                            <View style={styles.scanArea} />
                            <TouchableOpacity
                                style={[styles.cancelButton, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                                onPress={() => {
                                    setIsScanning(false);
                                    setScanned(false);
                                }}
                            >
                                <Text style={styles.cancelText}>Cancel Scan</Text>
                            </TouchableOpacity>
                        </View>
                    </CameraView>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: 20,
    },
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanArea: {
        width: 250,
        height: 250,
        borderWidth: 2,
        borderColor: '#FFFFFF',
        backgroundColor: 'transparent',
    },
    cancelButton: {
        marginTop: 40,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    cancelText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderWidth: 2,
        borderRadius: 12,
        borderStyle: 'dashed',
        marginBottom: 24,
    },
    scanButtonText: {
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    form: {
        gap: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    input: {
        height: 48,
        borderRadius: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        fontSize: 16,
    },
    textArea: {
        minHeight: 80,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        fontSize: 16,
        textAlignVertical: 'top',
    },
    row: {
        flexDirection: 'row',
    },
    col: {
        flex: 1,
    },
    saveButton: {
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    loader: {
        marginBottom: 20,
    },
});

export default EditPantryItemScreen;

