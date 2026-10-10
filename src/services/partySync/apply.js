import {
    partyMealOperations,
    partyMemberOperations,
    partyOperations,
} from '../../database/operations';

async function persistRemovedIds(partyId, removedMemberIds) {
    await partyOperations.setRemovedMemberIds(partyId, removedMemberIds || []);
}

async function syncMeals(partyId, doc) {
    const existingMeals = await partyMealOperations.getByPartyId(partyId);
    const incomingIds = new Set((doc.meals || []).map((m) => String(m.id)));

    for (const meal of doc.meals || []) {
        const syncId = String(meal.id);
        const match = existingMeals.find((m) => String(m.sync_meal_id || m.id) === syncId);
        if (match) {
            await partyMealOperations.update(match.id, {
                name: meal.name,
                description: meal.description,
                recipeIds: meal.recipeIds || [],
                syncMealId: syncId,
            });
        } else {
            await partyMealOperations.create({
                partyId,
                name: meal.name,
                description: meal.description,
                recipeIds: meal.recipeIds || [],
                createdBy: meal.createdBy || 'sync',
                syncMealId: syncId,
            });
        }
    }

    for (const meal of existingMeals) {
        const syncId = String(meal.sync_meal_id || meal.id);
        if (!incomingIds.has(syncId)) {
            await partyMealOperations.delete(meal.id);
        }
    }
}

/**
 * Apply an imported party document to local SQLite.
 */
export async function applyPartyDocument(doc, options = {}) {
    const now = Date.now();
    let partyId = options.localPartyId;

    const baseFields = {
        name: doc.name,
        description: doc.description,
        owner_email: doc.ownerEmail,
        sync_version: doc.version,
        updated_at: doc.updatedAt || now,
        scheduled_date: doc.scheduledDate,
        scheduled_meal_type: doc.scheduledMealType,
        party_uuid: doc.uuid,
    };

    if (partyId) {
        await partyOperations.updateSyncFields(partyId, baseFields);
    } else {
        const existing = await partyOperations.getByUuid(doc.uuid);
        if (existing) {
            partyId = existing.id;
            await partyOperations.updateSyncFields(partyId, baseFields);
        } else {
            partyId = await partyOperations.createWithSync({
                name: doc.name,
                description: doc.description,
                partyUuid: doc.uuid,
                ownerEmail: doc.ownerEmail,
                syncSecret: options.syncSecret,
                syncVersion: doc.version,
                createdBy: options.createdBy || null,
                updatedAt: doc.updatedAt || now,
                scheduledDate: doc.scheduledDate,
                scheduledMealType: doc.scheduledMealType,
            });
        }
    }

    if (options.syncSecret) {
        await partyOperations.setSyncSecret(partyId, options.syncSecret);
    }

    await persistRemovedIds(partyId, doc.removedMemberIds);
    await partyMemberOperations.syncFromDocument(partyId, doc.members || [], doc.ownerEmail);
    await syncMeals(partyId, doc);

    if (options.incrementVersion) {
        const party = await partyOperations.getById(partyId);
        const nextVersion = Number(party?.sync_version || doc.version || 1) + 1;
        await partyOperations.updateSyncFields(partyId, {
            sync_version: nextVersion,
            updated_at: Date.now(),
        });
        return { partyId, version: nextVersion };
    }

    return { partyId, version: doc.version };
}

/** Merge a single join receipt onto the owner's party. */
export async function applyJoinReceipt(doc, options = {}) {
    const local = await partyOperations.getByUuid(doc.uuid);
    if (!local) {
        throw new Error('Party not found on this device. Open the party first as the owner.');
    }
    const partyId = local.id;
    if (options.syncSecret) {
        await partyOperations.setSyncSecret(partyId, options.syncSecret);
    }
    if (doc.removedMemberIds) {
        await persistRemovedIds(partyId, doc.removedMemberIds);
    }
    const member = doc.member;
    if (!member?.id || !member?.name) {
        throw new Error('Invalid join receipt.');
    }
    await partyMemberOperations.upsertSyncMember(partyId, {
        syncMemberId: member.id,
        userName: member.name,
        memberEmail: member.email || null,
        role: 'member',
        memberStatus: member.status || 'confirmed',
        joinedAt: member.joinedAt || Date.now(),
        userId: `member:${member.id}`,
    });
    return { partyId, member };
}

/** Joiner imports party and registers themselves as a member. */
export async function applyPartyJoin(doc, joiningMember, options = {}) {
    const members = [...(doc.members || [])];
    const existingIdx = members.findIndex((m) => m.id === joiningMember.id);
    const entry = {
        id: joiningMember.id,
        name: joiningMember.name,
        email: joiningMember.email || null,
        joinedAt: joiningMember.joinedAt,
        status: 'confirmed',
        role: 'member',
    };
    if (existingIdx >= 0) members[existingIdx] = entry;
    else members.push(entry);

    const joinDoc = {
        ...doc,
        intent: undefined,
        members,
        updatedAt: Date.now(),
    };
    const result = await applyPartyDocument(joinDoc, options);
    return result;
}
