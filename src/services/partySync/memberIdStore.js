import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (partyUuid) => `amplifood.party.memberId.${partyUuid}`;

export async function getStoredMemberId(partyUuid) {
    if (!partyUuid) return null;
    try {
        return await AsyncStorage.getItem(key(partyUuid));
    } catch {
        return null;
    }
}

export async function setStoredMemberId(partyUuid, memberId) {
    if (!partyUuid || !memberId) return;
    await AsyncStorage.setItem(key(partyUuid), memberId);
}
