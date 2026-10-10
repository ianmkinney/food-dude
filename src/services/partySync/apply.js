import {
    partyMealOperations,
    partyMemberOperations,
    partyOperations,
} from '../../database/operations';

/**
 * Apply an imported party document to local SQLite.
 * @param {object} doc exported party document
 * @param {object} options
 * @param {boolean} [options.incrementVersion]
 * @param {string} [options.localPartyId] existing sqlite id when updating
 */
export async function applyPartyDocument(doc, options = {}) {
    const now = Date.now();
    let partyId = options.localPartyId;

    if (partyId) {
        await partyOperations.updateSyncFields(partyId, {
            name: doc.name,
            description: doc.description,
            owner_email: doc.ownerEmail,
            sync_version: doc.version,
            updated_at: doc.updatedAt || now,
            scheduled_date: doc.scheduledDate,
            scheduled_meal_type: doc.scheduledMealType,
            party_uuid: doc.uuid,
        });
    } else {
        const existing = await partyOperations.getByUuid(doc.uuid);
        if (existing) {
            partyId = existing.id;
            await partyOperations.updateSyncFields(partyId, {
                name: doc.name,
                description: doc.description,
                owner_email: doc.ownerEmail,
                sync_version: doc.version,
                updated_at: doc.updatedAt || now,
                scheduled_date: doc.scheduledDate,
                scheduled_meal_type: doc.scheduledMealType,
            });
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

    await partyMemberOperations.replaceEmailMembers(
        partyId,
        (doc.members || []).map((m) => ({
            email: m.email,
            name: m.name,
            role:
                m.email?.toLowerCase() === String(doc.ownerEmail || '').toLowerCase()
                    ? 'owner'
                    : 'member',
        }))
    );

    const existingMeals = await partyMealOperations.getByPartyId(partyId);
    const existingIds = new Set(existingMeals.map((m) => String(m.sync_meal_id || m.id)));
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
