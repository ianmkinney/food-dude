import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { BrandMark, CheckerStrip } from '../components/Brand';
import { useMonetization } from '../monetization/MonetizationContext';
import { platformAi } from '../monetization/platformAi';
import { CREDIT_COSTS, CREDIT_PACKS, PLUS_MONTHLY_CREDITS, PLUS_PLANS } from '../monetization/products';

const PRIVACY_URL = 'https://amplifood.vercel.app/privacy';
const TERMS_URL = 'https://amplifood.vercel.app/terms';

// Selling credits before AmpliFood AI exists would take money for nothing, so
// release builds keep the buy buttons off until the platform client is live.
// Dev builds can still exercise sandbox purchases.
const PURCHASES_OPEN = platformAi.isLive || __DEV__;

const COST_ROWS: { label: string; cost: number }[] = [
    { label: 'AI Chef message', cost: CREDIT_COSTS.chat },
    { label: 'Grocery cost estimate', cost: CREDIT_COSTS.costEstimate },
    { label: 'Recipe import from text or a link', cost: CREDIT_COSTS.textImport },
    { label: 'Recipe import from screenshots', cost: CREDIT_COSTS.imageImport },
    { label: 'AI recipe photo', cost: CREDIT_COSTS.recipeImage },
];

export default function PaywallScreen() {
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const m = useMonetization();
    const isWeb = Platform.OS === 'web';

    useEffect(() => {
        if (m.lastPurchase) {
            Alert.alert('Thanks!', 'Your purchase is on this device. AmpliFood AI credits appear here once AmpliFood AI is live.');
            m.clearMessages();
        }
    }, [m.lastPurchase]);

    const priceFor = (sku: string, listPrice: string) => m.products[sku]?.displayPrice || listPrice;
    const canBuy = m.isIapSupported && PURCHASES_OPEN;

    const onRestore = async () => {
        const { restoredPlus } = await m.restore();
        Alert.alert(
            restoredPlus ? 'Plus restored' : 'Nothing to restore',
            restoredPlus
                ? 'AmpliFood Plus is active on this device again.'
                : "We didn't find an active AmpliFood Plus subscription for this store account. Credit packs are tied to the account that bought them and come back once AmpliFood AI is live."
        );
    };

    const surface = { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border };
    const text = theme.colors.text;
    const display = { fontFamily: theme.typography.fonts.display };

    const BuyButton = ({ sku, label }: { sku: string; label: string }) => {
        const busy = m.busySku === sku;
        const disabled = !canBuy || !!m.busySku;
        return (
            <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => m.buy(sku)}
                style={[styles.buy, { backgroundColor: theme.primary[500], opacity: disabled && !busy ? 0.5 : 1 }]}
            >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buyText}>{label}</Text>}
            </Pressable>
        );
    };

    return (
        <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content}>
            <View style={styles.hero}>
                <BrandMark size={96} style={null} />
                <Text style={[styles.title, display, { color: text.primary }]}>AmpliFood Plus</Text>
                <Text style={[styles.subtitle, { color: text.secondary }]}>
                    AI in the kitchen without bringing your own key.
                </Text>
                <CheckerStrip squares={8} size={6} style={{ marginTop: 14 }} />
            </View>

            {!platformAi.isLive && (
                <View style={[styles.notice, { backgroundColor: theme.primary[50], borderColor: theme.primary[200] }]}>
                    <Ionicons name="time-outline" size={20} color={theme.primary[700]} />
                    <Text style={[styles.noticeText, { color: theme.primary[800] }]}>
                        AmpliFood AI is launching soon. Until then, AI features use your own key from Account, which works on every plan.
                    </Text>
                </View>
            )}

            {isWeb && (
                <View style={[styles.notice, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
                    <Ionicons name="phone-portrait-outline" size={20} color={text.primary} />
                    <Text style={[styles.noticeText, { color: text.primary }]}>
                        Plus and credit packs are available in the AmpliFood mobile app. Your own AI key keeps working here in the browser.
                    </Text>
                </View>
            )}

            <Text style={[styles.status, { color: text.secondary }]}>
                Your plan: <Text style={{ color: text.primary, fontWeight: '800' }}>{m.isPlus ? 'Plus' : 'Free'}</Text>
                {m.entitlements.purchasedCredits > 0
                    ? ` · ${m.entitlements.purchasedCredits} pack credits on this device (unverified)`
                    : ''}
            </Text>

            <View style={[styles.card, surface]}>
                <Text style={[styles.cardTitle, display, { color: text.primary }]}>Free</Text>
                <Text style={[styles.body, { color: text.secondary }]}>
                    Recipes, planner, pantry with barcode scan, and grocery lists. AI features work with your own Anthropic, OpenAI, xAI, or Gemini key. No AmpliFood AI credits.
                </Text>
                {!m.isPlus && <Text style={[styles.badge, { color: theme.colors.success }]}>Current plan</Text>}
            </View>

            <View style={[styles.card, surface, { borderColor: theme.primary[500], borderWidth: 2 }]}>
                <Text style={[styles.cardTitle, display, { color: text.primary }]}>Plus</Text>
                <Text style={[styles.body, { color: text.secondary }]}>
                    Everything in Free, plus {PLUS_MONTHLY_CREDITS} AmpliFood AI credits every month for AI Chef, recipe import, cost estimates, and recipe photos, with no API key needed.
                </Text>
                {m.isPlus ? (
                    <Text style={[styles.badge, { color: theme.colors.success }]}>Active</Text>
                ) : (
                    !isWeb &&
                    PLUS_PLANS.map((plan) => (
                        <View key={plan.sku} style={styles.planRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.planPrice, { color: text.primary }]}>
                                    {priceFor(plan.sku, plan.listPrice)} / {plan.period}
                                </Text>
                                {plan.note && <Text style={[styles.small, { color: text.tertiary }]}>{plan.note}</Text>}
                            </View>
                            <BuyButton sku={plan.sku} label={canBuy ? 'Subscribe' : 'Coming soon'} />
                        </View>
                    ))
                )}
                {isWeb && !m.isPlus && (
                    <Text style={[styles.small, { color: text.tertiary }]}>
                        {PLUS_PLANS.map((plan) => `${plan.listPrice} / ${plan.period}`).join(' or ')}, in the mobile app.
                    </Text>
                )}
            </View>

            <View style={[styles.card, surface]}>
                <Text style={[styles.cardTitle, display, { color: text.primary }]}>Credit packs</Text>
                <Text style={[styles.body, { color: text.secondary }]}>
                    One-time packs of AmpliFood AI credits, on any plan.
                </Text>
                {CREDIT_PACKS.map((pack) => (
                    <View key={pack.sku} style={styles.planRow}>
                        <Text style={[styles.planPrice, { color: text.primary, flex: 1 }]}>
                            {pack.credits} credits · {priceFor(pack.sku, pack.listPrice)}
                        </Text>
                        {!isWeb && <BuyButton sku={pack.sku} label={canBuy ? 'Buy' : 'Soon'} />}
                    </View>
                ))}
            </View>

            <View style={[styles.card, surface]}>
                <Text style={[styles.cardTitle, display, { color: text.primary }]}>What a credit buys</Text>
                {COST_ROWS.map((row) => (
                    <View key={row.label} style={styles.costRow}>
                        <Text style={[styles.body, { color: text.secondary, flex: 1 }]}>{row.label}</Text>
                        <Text style={[styles.body, { color: text.primary, fontWeight: '700' }]}>
                            {row.cost} {row.cost === 1 ? 'credit' : 'credits'}
                        </Text>
                    </View>
                ))}
                <Text style={[styles.small, { color: text.tertiary }]}>
                    Using your own key never uses credits.
                </Text>
            </View>

            {m.lastError && <Text style={[styles.error, { color: theme.colors.error }]}>{m.lastError}</Text>}

            {!isWeb && (
                <Pressable accessibilityRole="button" onPress={onRestore} disabled={m.restoring} style={styles.restore}>
                    {m.restoring ? (
                        <ActivityIndicator color={theme.primary[500]} />
                    ) : (
                        <Text style={[styles.restoreText, { color: theme.primary[600] }]}>Restore purchases</Text>
                    )}
                </Pressable>
            )}

            <Text style={[styles.legal, { color: text.tertiary }]}>
                {Platform.OS === 'ios'
                    ? 'Payment is charged to your Apple ID. Plus renews automatically unless cancelled at least 24 hours before the end of the period; manage or cancel it in Settings → Apple ID → Subscriptions.'
                    : 'Plus renews automatically unless cancelled; manage or cancel it in Google Play → Payments & subscriptions.'}
            </Text>
            <View style={styles.legalLinks}>
                <Text
                    accessibilityRole="link"
                    style={[styles.legalLink, { color: theme.primary[600] }]}
                    onPress={() => Linking.openURL(TERMS_URL)}
                >
                    Terms of Use
                </Text>
                <Text
                    accessibilityRole="link"
                    style={[styles.legalLink, { color: theme.primary[600] }]}
                    onPress={() => Linking.openURL(PRIVACY_URL)}
                >
                    Privacy Policy
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingBottom: 48, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
    hero: { alignItems: 'center', paddingVertical: 8 },
    title: { fontSize: 30, marginTop: 10 },
    subtitle: { fontSize: 16, marginTop: 4, textAlign: 'center' },
    notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'flex-start' },
    noticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
    status: { fontSize: 14, textAlign: 'center' },
    card: { borderRadius: 18, borderWidth: 1, padding: 18, gap: 10 },
    cardTitle: { fontSize: 22 },
    body: { fontSize: 15, lineHeight: 22 },
    small: { fontSize: 12, lineHeight: 17 },
    badge: { fontWeight: '800', fontSize: 14 },
    planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
    planPrice: { fontSize: 17, fontWeight: '700' },
    costRow: { flexDirection: 'row', gap: 12 },
    buy: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, minWidth: 104, alignItems: 'center' },
    buyText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    restore: { alignItems: 'center', paddingVertical: 12 },
    restoreText: { fontWeight: '800', fontSize: 16 },
    error: { textAlign: 'center', fontSize: 14 },
    legal: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
    legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
    legalLink: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline', paddingVertical: 6 },
});
