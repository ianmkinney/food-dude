import { applyCors } from '../_lib/cors.js';
import { isEmailAllowed, isGoogleSignInConfigured, requireSecrets } from '../_lib/env.js';
import { bearerToken, verifySession } from '../_lib/session.js';
import { checkMinuteRateLimit } from '../_lib/store.js';
import { getPartySql, isPartyDatabaseConfigured, MAX_PARTY_IMAGE_BYTES } from '../_lib/partyDb.js';
import { generateToken, hashToken } from '../_lib/partyTokens.js';
import { memberTokenFromReq, partyReject } from '../_lib/partyHttp.js';
import { normalizeMealsInput, rowToPartySnapshot } from '../_lib/partySerialize.js';
import { uploadPartyImage, isBlobConfigured } from '../_lib/partyBlob.js';
import { consumePartyRateLimit } from '../_lib/partyRateLimit.js';
import { withPartyTransaction } from '../_lib/partyTxn.js';
import { insertInviteToken, isInviteRowValid, rotateInviteToken } from '../_lib/partyInvite.js';
import { decodePartyImageBase64, sniffImageBuffer } from '../_lib/partyImageSniff.js';
import {
    MAX_ACTIVE_MEMBERS,
    MAX_EMAIL_LEN,
    MAX_MIGRATE_MEMBERS,
} from '../_lib/partyConstants.js';
import { dedupeServerMemberRows, upsertActivePartyMember, isHumanPartyMember } from '../_lib/partyMembers.js';
import {
    MAX_CHAT_BATCH,
    normalizeAttachmentMeta,
    partyChatPostRejection,
    rowToChatMessage,
    sanitizePartyChatBody,
} from '../_lib/partyChat.js';
import { normalizePantrySnapshotItems } from '../_lib/partyPantryShare.js';

const MAX_NAME = 200;
const MAX_DISPLAY = 120;
const MAX_MEALS = 80;
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

function clientKey(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function softRateLimit(req, res, bucket, max = 30) {
    if (!checkMinuteRateLimit(`${bucket}:${clientKey(req)}`, max)) {
        partyReject(res, 429, 'rate_limited');
        return false;
    }
    return true;
}

async function durableRateLimit(res, sql, rateKey, maxPerMinute) {
    const ok = await consumePartyRateLimit(sql, rateKey, maxPerMinute);
    if (!ok) {
        partyReject(res, 429, 'rate_limited');
        return false;
    }
    return true;
}

function applyBinaryImageHeaders(res, contentType, cacheKey = '') {
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    if (cacheKey) {
        res.setHeader('ETag', `"party-img-${cacheKey}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
}

async function requireUserSession(req, res) {
    if (!isGoogleSignInConfigured()) {
        partyReject(res, 503, 'misconfigured');
        return null;
    }
    try {
        requireSecrets();
    } catch (error) {
        console.error('[party] secrets:', error?.message || error);
        partyReject(res, 503, 'misconfigured');
        return null;
    }
    const token = bearerToken(req);
    if (!token) {
        partyReject(res, 401, 'unauthorized');
        return null;
    }
    try {
        return await verifySession(token);
    } catch {
        partyReject(res, 401, 'unauthorized');
        return null;
    }
}

/** Valid session when present; null when missing or invalid (no 401). Used for party chat polling/posting. */
async function optionalUserSession(req) {
    if (!isGoogleSignInConfigured()) return null;
    try {
        requireSecrets();
    } catch {
        return null;
    }
    const token = bearerToken(req);
    if (!token) return null;
    try {
        return await verifySession(token);
    } catch {
        return null;
    }
}

async function loadPartyBundle(sql, partyId) {
    const parties = await sql`SELECT * FROM parties WHERE id = ${partyId}::uuid LIMIT 1`;
    const party = parties[0];
    if (!party) return null;
    const members = await sql`
        SELECT * FROM party_members WHERE party_id = ${partyId}::uuid AND status = 'active'
        ORDER BY joined_at ASC`;
    const meals = await sql`
        SELECT * FROM party_meals WHERE party_id = ${partyId}::uuid ORDER BY created_at ASC`;
    const claims = await sql`
        SELECT * FROM party_meal_ingredient_claims WHERE party_id = ${partyId}::uuid ORDER BY claimed_at ASC`;
    const invites = await sql`
        SELECT token, revoked, expires_at FROM invite_tokens
        WHERE party_id = ${partyId}::uuid AND revoked = false
        AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`;
    const inviteRow = invites[0];
    return {
        party,
        members: dedupeServerMemberRows(members, { ownerEmail: party.owner_email }),
        meals,
        claims,
        inviteToken: inviteRow && isInviteRowValid(inviteRow) ? inviteRow.token : null,
    };
}

async function assertPartyOwner(sql, partyId, session) {
    const rows = await sql`
        SELECT owner_sub, owner_email FROM parties WHERE id = ${partyId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) return { ok: false, status: 404, error: 'not_found' };
    const email = String(session.email).toLowerCase();
    const ownerEmail = String(row.owner_email || '').toLowerCase();
    if (session.sub && row.owner_sub !== session.sub && email !== ownerEmail) {
        return { ok: false, status: 403, error: 'forbidden' };
    }
    return { ok: true };
}

async function isPartyOwner(sql, partyId, session) {
    if (!session) return false;
    const result = await assertPartyOwner(sql, partyId, session);
    return result.ok;
}

async function assertMemberAccess(sql, partyId, memberToken) {
    if (!memberToken) return { ok: false, status: 401, error: 'forbidden' };
    const hash = hashToken(memberToken);
    const rows = await sql`
        SELECT member_id, status FROM party_members
        WHERE party_id = ${partyId}::uuid AND member_token_hash = ${hash} LIMIT 1`;
    const row = rows[0];
    if (!row || row.status !== 'active') {
        return { ok: false, status: 403, error: 'forbidden' };
    }
    return { ok: true, memberId: row.member_id };
}

async function assertPartyChatAccess(sql, partyId, session, memberToken) {
    const ownerView = session ? await isPartyOwner(sql, partyId, session) : false;
    if (ownerView && session) {
        const rows = await sql`
            SELECT member_id, display_name FROM party_members
            WHERE party_id = ${partyId}::uuid AND status = 'active'
            AND (google_sub = ${session.sub} OR lower(email) = ${session.email.toLowerCase()})
            LIMIT 1`;
        const row = rows[0];
        if (row) {
            return {
                ok: true,
                memberId: row.member_id,
                displayName: row.display_name,
                isOwner: true,
            };
        }
        return {
            ok: true,
            memberId: null,
            displayName: String(session.name || session.email?.split('@')[0] || 'Owner').slice(0, MAX_DISPLAY),
            isOwner: true,
        };
    }
    const member = await assertMemberAccess(sql, partyId, memberToken);
    if (!member.ok) return member;
    const nameRows = await sql`
        SELECT display_name FROM party_members WHERE member_id = ${member.memberId}::uuid LIMIT 1`;
    return {
        ok: true,
        memberId: member.memberId,
        displayName: nameRows[0]?.display_name || 'Member',
        isOwner: false,
    };
}

async function countActiveMembers(client, partyId) {
    const result = await client.query(
        `SELECT COUNT(*)::int AS c FROM party_members WHERE party_id = $1::uuid AND status = 'active'`,
        [partyId]
    );
    return Number(result.rows[0]?.c ?? 0);
}

function parseBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    return {};
}

function actionFromReq(req) {
    const q = req.query?.action;
    if (q) return String(q);
    const body = parseBody(req);
    return body.action ? String(body.action) : '';
}

function parseValidatedImage(imageBase64, res) {
    const buffer = decodePartyImageBase64(imageBase64);
    if (!buffer || !buffer.length) {
        partyReject(res, 400, 'bad_request', { message: 'Invalid image payload.' });
        return null;
    }
    if (buffer.length > MAX_PARTY_IMAGE_BYTES) {
        partyReject(res, 400, 'bad_request', { message: 'Image must be at most 500KB after compression.' });
        return null;
    }
    const sniffed = sniffImageBuffer(buffer);
    if (!sniffed) {
        partyReject(res, 400, 'bad_request', { message: 'Only JPEG, PNG, or WebP images are allowed.' });
        return null;
    }
    return { buffer, contentType: sniffed.contentType };
}

async function persistPartyImage(sql, partyId, buffer, contentType, thumbBuffer = null, thumbContentType = null) {
    let imageUrl = null;
    let imageBytea = null;
    let thumbUrl = null;
    let thumbBytea = null;
    if (isBlobConfigured()) {
        const uploaded = await uploadPartyImage({ partyId, buffer, contentType });
        imageUrl = uploaded.url;
        if (thumbBuffer) {
            const thumbUploaded = await uploadPartyImage({
                partyId: `${partyId}-thumb`,
                buffer: thumbBuffer,
                contentType: thumbContentType || 'image/jpeg',
            });
            thumbUrl = thumbUploaded.url;
        }
    } else {
        imageBytea = buffer;
        thumbBytea = thumbBuffer;
    }
    await sql`
        UPDATE parties SET image_url = ${imageUrl}, image_bytea = ${imageBytea},
            image_content_type = ${contentType},
            image_thumb_url = ${thumbUrl}, image_thumb_bytea = ${thumbBytea},
            image_thumb_content_type = ${thumbContentType},
            updated_at = now()
        WHERE id = ${partyId}::uuid`;
}

async function replaceMealsOnClient(client, partyId, mealsInput) {
    const meals = normalizeMealsInput(mealsInput).slice(0, MAX_MEALS);
    const existing = await client.query(`SELECT id FROM party_meals WHERE party_id = $1::uuid`, [partyId]);
    const keepIds = new Set(meals.filter((m) => m.id).map((m) => m.id));
    for (const row of existing.rows) {
        if (!keepIds.has(row.id)) {
            await client.query(`DELETE FROM party_meals WHERE id = $1::uuid`, [row.id]);
        }
    }
    for (const meal of meals) {
        const recipeJson = JSON.stringify(meal.recipeIds || []);
        const metaJson = JSON.stringify(meal.recipeMeta || {});
        if (meal.id) {
            await client.query(
                `INSERT INTO party_meals (id, party_id, name, description, recipe_ids, recipe_meta)
                 VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb)
                 ON CONFLICT (id) DO UPDATE SET
                   name = EXCLUDED.name,
                   description = EXCLUDED.description,
                   recipe_ids = EXCLUDED.recipe_ids,
                   recipe_meta = EXCLUDED.recipe_meta,
                   updated_at = now()`,
                [meal.id, partyId, meal.name, meal.description, recipeJson, metaJson]
            );
        } else {
            await client.query(
                `INSERT INTO party_meals (party_id, name, description, recipe_ids, recipe_meta)
                 VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb)`,
                [partyId, meal.name, meal.description, recipeJson, metaJson]
            );
        }
    }
}

function normalizeIngredientKey(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .slice(0, 200);
}

async function resolveActingMember(sql, partyId, session, memberToken) {
    const ownerView = await isPartyOwner(sql, partyId, session);
    if (ownerView) {
        const rows = await sql`
            SELECT member_id, display_name FROM party_members
            WHERE party_id = ${partyId}::uuid AND status = 'active'
            AND lower(email) = ${String(session.email).toLowerCase()}
            LIMIT 1`;
        if (rows[0]) return rows[0];
    }
    const access = await assertMemberAccess(sql, partyId, memberToken);
    if (!access.ok) return null;
    const rows = await sql`
        SELECT member_id, display_name FROM party_members
        WHERE member_id = ${access.memberId}::uuid LIMIT 1`;
    return rows[0] || null;
}

async function handleClaimIngredient(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const mealId = String(body.mealId || '').trim();
    const recipeId = String(body.recipeId || '').trim();
    const ingredientName = String(body.ingredientName || '').trim().slice(0, 200);
    const ingredientKey = normalizeIngredientKey(body.ingredientKey || ingredientName);
    if (!partyId || !mealId || !recipeId || !ingredientKey) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    const actor = await resolveActingMember(sql, partyId, session, memberToken);
    if (!actor) {
        partyReject(res, 403, 'forbidden');
        return;
    }
    if (!(await durableRateLimit(res, sql, `party:claim:${partyId}`, 40))) return;

    const registerOnly = Boolean(body.registerOnly || body.register_only);
    let claimMemberId = actor.member_id;
    let claimDisplayName = actor.display_name;
    const claimedByName = String(body.claimedByMemberName || body.claimed_by_member_name || '').trim();
    if (registerOnly) {
        claimMemberId = null;
        claimDisplayName = null;
    } else if (claimedByName) {
        const match = await sql`
            SELECT member_id, display_name FROM party_members
            WHERE party_id = ${partyId}::uuid AND status = 'active'
            AND lower(display_name) = lower(${claimedByName})
            LIMIT 1`;
        if (match[0]) {
            claimMemberId = match[0].member_id;
            claimDisplayName = match[0].display_name;
        }
    }

    await sql`
        INSERT INTO party_meal_ingredient_claims (
            party_id, meal_id, recipe_id, ingredient_key, ingredient_name,
            claimed_by_member_id, claimed_by_display_name
        ) VALUES (
            ${partyId}::uuid, ${mealId}::uuid, ${recipeId}, ${ingredientKey}, ${ingredientName},
            ${claimMemberId}::uuid, ${claimDisplayName}
        )
        ON CONFLICT (meal_id, recipe_id, ingredient_key) DO UPDATE SET
            ingredient_name = EXCLUDED.ingredient_name,
            claimed_by_member_id = COALESCE(party_meal_ingredient_claims.claimed_by_member_id, EXCLUDED.claimed_by_member_id),
            claimed_by_display_name = COALESCE(party_meal_ingredient_claims.claimed_by_display_name, EXCLUDED.claimed_by_display_name),
            claimed_at = CASE
                WHEN party_meal_ingredient_claims.claimed_by_member_id IS NULL AND EXCLUDED.claimed_by_member_id IS NOT NULL
                THEN now()
                ELSE party_meal_ingredient_claims.claimed_at
            END`;
    await sql`UPDATE parties SET version = version + 1, updated_at = now() WHERE id = ${partyId}::uuid`;

    const bundle = await loadPartyBundle(sql, partyId);
    const ownerView = await isPartyOwner(sql, partyId, session);
    res.status(200).json({
        ok: true,
        version: bundle.party.version,
        party: rowToPartySnapshot(bundle, { isOwner: ownerView }),
    });
}

async function handleSetPantryShare(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const enabled = Boolean(body.enabled);
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    const actor = await resolveActingMember(sql, partyId, session, memberToken);
    if (!actor) {
        partyReject(res, 403, 'forbidden');
        return;
    }
    if (!(await durableRateLimit(res, sql, `party:pantry:${partyId}`, 30))) return;

    if (enabled) {
        await sql`
            UPDATE party_members SET pantry_share_enabled = true
            WHERE member_id = ${actor.member_id}::uuid`;
    } else {
        await sql`
            UPDATE party_members SET
                pantry_share_enabled = false,
                pantry_snapshot = NULL,
                pantry_updated_at = NULL
            WHERE member_id = ${actor.member_id}::uuid`;
    }
    await sql`UPDATE parties SET version = version + 1, updated_at = now() WHERE id = ${partyId}::uuid`;
    const bundle = await loadPartyBundle(sql, partyId);
    const ownerView = await isPartyOwner(sql, partyId, session);
    res.status(200).json({
        ok: true,
        version: bundle.party.version,
        party: rowToPartySnapshot(bundle, { isOwner: ownerView }),
    });
}

async function handleUpdatePantrySnapshot(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const items = normalizePantrySnapshotItems(body.items);
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    const actor = await resolveActingMember(sql, partyId, session, memberToken);
    if (!actor) {
        partyReject(res, 403, 'forbidden');
        return;
    }
    if (!(await durableRateLimit(res, sql, `party:pantry-snap:${partyId}`, 20))) return;

    const rows = await sql`
        SELECT pantry_share_enabled FROM party_members
        WHERE member_id = ${actor.member_id}::uuid LIMIT 1`;
    if (!rows[0]?.pantry_share_enabled) {
        partyReject(res, 409, 'pantry_share_disabled');
        return;
    }
    await sql`
        UPDATE party_members SET
            pantry_snapshot = ${JSON.stringify(items)}::jsonb,
            pantry_updated_at = now()
        WHERE member_id = ${actor.member_id}::uuid`;
    await sql`UPDATE parties SET version = version + 1, updated_at = now() WHERE id = ${partyId}::uuid`;
    const bundle = await loadPartyBundle(sql, partyId);
    const ownerView = await isPartyOwner(sql, partyId, session);
    res.status(200).json({
        ok: true,
        version: bundle.party.version,
        party: rowToPartySnapshot(bundle, { isOwner: ownerView }),
    });
}

async function handleUnclaimIngredient(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const claimId = String(body.claimId || '').trim();
    if (!partyId || !claimId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    const actor = await resolveActingMember(sql, partyId, session, memberToken);
    if (!actor) {
        partyReject(res, 403, 'forbidden');
        return;
    }
    const rows = await sql`
        SELECT claimed_by_member_id FROM party_meal_ingredient_claims
        WHERE id = ${claimId}::uuid AND party_id = ${partyId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) {
        partyReject(res, 404, 'not_found');
        return;
    }
    const ownerView = await isPartyOwner(sql, partyId, session);
    if (row.claimed_by_member_id !== actor.member_id && !ownerView) {
        partyReject(res, 403, 'forbidden');
        return;
    }
    await sql`DELETE FROM party_meal_ingredient_claims WHERE id = ${claimId}::uuid`;
    await sql`UPDATE parties SET version = version + 1, updated_at = now() WHERE id = ${partyId}::uuid`;
    const bundle = await loadPartyBundle(sql, partyId);
    res.status(200).json({
        ok: true,
        version: bundle.party.version,
        party: rowToPartySnapshot(bundle, { isOwner: ownerView }),
    });
}

async function handleCreate(req, res, session) {
    const body = parseBody(req);
    const name = String(body.name || '').trim().slice(0, MAX_NAME);
    if (!name) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    if (!(await durableRateLimit(res, sql, `party:create:${session.sub}`, 10))) return;

    const { party, inviteToken, ownerMemberToken } = await withPartyTransaction(async (client) => {
        const inviteToken = generateToken(24);
        const partyRes = await client.query(
            `INSERT INTO parties (name, owner_sub, owner_email)
             VALUES ($1, $2, $3)
             RETURNING id, name, version, updated_at, owner_email, image_url`,
            [name, session.sub, session.email.toLowerCase()]
        );
        const party = partyRes.rows[0];
        await insertInviteToken(client, party.id, inviteToken);
        const ownerMemberToken = generateToken(32);
        await upsertActivePartyMember(client, {
            partyId: party.id,
            displayName: session.name || session.email.split('@')[0] || 'Owner',
            email: session.email.toLowerCase(),
            googleSub: session.sub,
            memberTokenHash: hashToken(ownerMemberToken),
        });
        return { party, inviteToken, ownerMemberToken };
    });

    const bundle = await loadPartyBundle(sql, party.id);
    res.status(200).json({
        ok: true,
        party: rowToPartySnapshot(bundle, { isOwner: true }),
        ownerMemberToken,
        inviteUrl: `/p/${inviteToken}`,
    });
}

async function handleGet(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || req.query?.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    const ownerView = await isPartyOwner(sql, partyId, session);
    if (!ownerView) {
        const member = await assertMemberAccess(sql, partyId, memberToken);
        if (!member.ok) {
            partyReject(res, member.status, member.error);
            return;
        }
    }
    const bundle = await loadPartyBundle(sql, partyId);
    if (!bundle) {
        partyReject(res, 404, 'not_found');
        return;
    }
    res.status(200).json({ ok: true, party: rowToPartySnapshot(bundle, { isOwner: ownerView }) });
}

async function handleJoin(req, res, session) {
    const body = parseBody(req);
    const inviteToken = String(body.inviteToken || body.token || '').trim();
    const displayName = String(
        body.displayName || session?.name || session?.email?.split('@')[0] || ''
    )
        .trim()
        .slice(0, MAX_DISPLAY);
    if (!INVITE_TOKEN_RE.test(inviteToken) || !displayName) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    if (!(await durableRateLimit(res, sql, `party:join:${clientKey(req)}`, 15))) return;

    const invites = await sql`
        SELECT party_id, revoked, expires_at FROM invite_tokens WHERE token = ${inviteToken} LIMIT 1`;
    const invite = invites[0];
    if (!isInviteRowValid(invite)) {
        partyReject(res, 404, 'not_found');
        return;
    }

    const email = session?.email
        ? String(session.email).trim().toLowerCase().slice(0, MAX_EMAIL_LEN)
        : null;

    const result = await withPartyTransaction(async (client) => {
        const active = await countActiveMembers(client, invite.party_id);
        if (active >= MAX_ACTIVE_MEMBERS) {
            return { cap: true };
        }
        const memberToken = generateToken(32);
        const memberId = await upsertActivePartyMember(client, {
            partyId: invite.party_id,
            displayName,
            email,
            googleSub: session?.sub || null,
            memberTokenHash: hashToken(memberToken),
        });
        await client.query(
            `UPDATE parties SET version = version + 1, updated_at = now() WHERE id = $1::uuid`,
            [invite.party_id]
        );
        return { memberId, memberToken, partyId: invite.party_id };
    });

    if (result.cap) {
        partyReject(res, 409, 'member_cap');
        return;
    }

    const bundle = await loadPartyBundle(sql, result.partyId);
    res.status(200).json({
        ok: true,
        memberId: result.memberId,
        memberToken: result.memberToken,
        party: rowToPartySnapshot(bundle, { isOwner: false }),
    });
}

async function handleLeave(req, res) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const memberToken = memberTokenFromReq(req);
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const access = await assertMemberAccess(sql, partyId, memberToken);
    if (!access.ok) {
        partyReject(res, access.status, access.error);
        return;
    }
    await sql`
        UPDATE party_members SET
            status = 'removed',
            removed_at = now(),
            member_token_hash = NULL,
            pantry_share_enabled = false,
            pantry_snapshot = NULL,
            pantry_updated_at = NULL
        WHERE member_id = ${access.memberId}::uuid`;
    await sql`
        UPDATE parties SET version = version + 1, updated_at = now() WHERE id = ${partyId}::uuid`;
    res.status(200).json({ ok: true });
}

async function handleRemoveMember(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const memberId = String(body.memberId || '').trim();
    if (!partyId || !memberId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const owner = await assertPartyOwner(sql, partyId, session);
    if (!owner.ok) {
        partyReject(res, owner.status, owner.error);
        return;
    }

    const newInviteToken = await withPartyTransaction(async (client) => {
        await client.query(
            `UPDATE party_members SET status = 'removed', removed_at = now(), member_token_hash = NULL,
                pantry_share_enabled = false, pantry_snapshot = NULL, pantry_updated_at = NULL
             WHERE party_id = $1::uuid AND member_id = $2::uuid`,
            [partyId, memberId]
        );
        const token = await rotateInviteToken(client, partyId);
        await client.query(
            `UPDATE parties SET version = version + 1, updated_at = now() WHERE id = $1::uuid`,
            [partyId]
        );
        return token;
    });

    res.status(200).json({
        ok: true,
        inviteToken: newInviteToken,
        inviteUrl: `/p/${newInviteToken}`,
    });
}

async function handleRotateInvite(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const owner = await assertPartyOwner(sql, partyId, session);
    if (!owner.ok) {
        partyReject(res, owner.status, owner.error);
        return;
    }
    const newInviteToken = await withPartyTransaction(async (client) => {
        const token = await rotateInviteToken(client, partyId);
        await client.query(
            `UPDATE parties SET version = version + 1, updated_at = now() WHERE id = $1::uuid`,
            [partyId]
        );
        return token;
    });
    res.status(200).json({
        ok: true,
        inviteToken: newInviteToken,
        inviteUrl: `/p/${newInviteToken}`,
    });
}

async function handleRename(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const name = String(body.name || '').trim().slice(0, MAX_NAME);
    if (!partyId || !name) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const owner = await assertPartyOwner(sql, partyId, session);
    if (!owner.ok) {
        partyReject(res, owner.status, owner.error);
        return;
    }
    await sql`
        UPDATE parties SET name = ${name}, version = version + 1, updated_at = now()
        WHERE id = ${partyId}::uuid`;
    const bundle = await loadPartyBundle(sql, partyId);
    res.status(200).json({ ok: true, party: rowToPartySnapshot(bundle, { isOwner: true }) });
}

async function handleUpdateMeals(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    const ownerView = await isPartyOwner(sql, partyId, session);
    if (!ownerView) {
        const member = await assertMemberAccess(sql, partyId, memberToken);
        if (!member.ok) {
            partyReject(res, member.status, member.error);
            return;
        }
    }

    await withPartyTransaction(async (client) => {
        await replaceMealsOnClient(client, partyId, body.meals);
        await client.query(
            `UPDATE parties SET version = version + 1, updated_at = now() WHERE id = $1::uuid`,
            [partyId]
        );
    });

    const bundle = await loadPartyBundle(sql, partyId);
    res.status(200).json({
        ok: true,
        version: bundle.party.version,
        updatedAt: new Date(bundle.party.updated_at).getTime(),
        party: rowToPartySnapshot(bundle, { isOwner: ownerView }),
    });
}

async function handleUploadImage(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const imageBase64 = String(body.imageBase64 || '').trim();
    const thumbBase64 = String(body.thumbImageBase64 || body.imageThumbBase64 || '').trim();
    if (!partyId || !imageBase64) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    if (!(await durableRateLimit(res, sql, `party:upload:${session.sub}`, 10))) return;
    const owner = await assertPartyOwner(sql, partyId, session);
    if (!owner.ok) {
        partyReject(res, owner.status, owner.error);
        return;
    }
    const parsed = parseValidatedImage(imageBase64, res);
    if (!parsed) return;

    let thumbParsed = null;
    if (thumbBase64) {
        thumbParsed = parseValidatedImage(thumbBase64, res);
        if (!thumbParsed) return;
    }
    await persistPartyImage(
        sql,
        partyId,
        parsed.buffer,
        parsed.contentType,
        thumbParsed?.buffer ?? null,
        thumbParsed?.contentType ?? null
    );
    await sql`UPDATE parties SET version = version + 1, updated_at = now() WHERE id = ${partyId}::uuid`;
    const rows = await sql`
        SELECT image_url, image_thumb_url, version FROM parties WHERE id = ${partyId}::uuid LIMIT 1`;
    res.status(200).json({
        ok: true,
        version: Number(rows[0]?.version ?? 0),
        imageUrl: rows[0]?.image_url || null,
        thumbUrl: rows[0]?.image_thumb_url || null,
    });
}

async function assertPartyChatReadAccess(sql, partyId, session, memberToken) {
    const ownerView = session ? await isPartyOwner(sql, partyId, session) : false;
    if (!ownerView) {
        const member = await assertMemberAccess(sql, partyId, memberToken);
        if (!member.ok) {
            return member;
        }
    }
    return { ok: true, ownerView };
}

async function handleChatHistory(req, res, session) {
    const partyId = String(req.query?.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    if (!session && !memberToken) {
        partyReject(res, 401, 'unauthorized');
        return;
    }
    const access = await assertPartyChatReadAccess(sql, partyId, session, memberToken);
    if (!access.ok) {
        partyReject(res, access.status, access.error);
        return;
    }
    const limit = Math.min(Math.max(Number(req.query?.limit) || MAX_CHAT_BATCH, 1), MAX_CHAT_BATCH);
    const beforeMs = Number(req.query?.beforeMs ?? req.query?.beforeChatMs ?? 0);
    let rows;
    if (Number.isFinite(beforeMs) && beforeMs > 0) {
        const beforeDate = new Date(beforeMs);
        rows = await sql`
            SELECT * FROM party_messages
            WHERE party_id = ${partyId}::uuid AND created_at < ${beforeDate}
            ORDER BY created_at DESC
            LIMIT ${limit}`;
        rows = rows.reverse();
    } else {
        rows = await sql`
            SELECT * FROM party_messages
            WHERE party_id = ${partyId}::uuid
            ORDER BY created_at DESC
            LIMIT ${limit}`;
        rows = rows.reverse();
    }
    const messages = rows.map(rowToChatMessage);
    const oldestCreatedAt = messages.length ? messages[0].createdAt : null;
    const latestCreatedAt = messages.length ? messages[messages.length - 1].createdAt : 0;
    res.status(200).json({
        ok: true,
        messages,
        hasMore: rows.length === limit,
        oldestCreatedAt,
        latestCreatedAt,
    });
}

async function handleRefreshOwnerMemberToken(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const owner = await assertPartyOwner(sql, partyId, session);
    if (!owner.ok) {
        partyReject(res, owner.status, owner.error);
        return;
    }
    const memberToken = generateToken(32);
    await withPartyTransaction(async (client) => {
        await upsertActivePartyMember(client, {
            partyId,
            displayName: String(session.name || session.email?.split('@')[0] || 'Owner').slice(0, MAX_DISPLAY),
            email: session.email.toLowerCase(),
            googleSub: session.sub,
            memberTokenHash: hashToken(memberToken),
        });
    });
    res.status(200).json({ ok: true, memberToken });
}

async function handleChangesSince(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || req.query?.partyId || '').trim();
    const sinceVersion = Number(body.sinceVersion ?? req.query?.sinceVersion ?? 0);
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const memberToken = memberTokenFromReq(req);
    if (!session && !memberToken) {
        partyReject(res, 401, 'unauthorized');
        return;
    }
    const ownerView = await isPartyOwner(sql, partyId, session);
    if (!ownerView) {
        const member = await assertMemberAccess(sql, partyId, memberToken);
        if (!member.ok) {
            partyReject(res, member.status, member.error);
            return;
        }
    }
    const bundle = await loadPartyBundle(sql, partyId);
    if (!bundle) {
        partyReject(res, 404, 'not_found');
        return;
    }
    const changed = Number(bundle.party.version) > sinceVersion;
    const sinceChatMs = Number(body.sinceChatMs ?? req.query?.sinceChatMs ?? 0);
    let chatMessages = [];
    let latestChatMs = sinceChatMs;
    if (Number.isFinite(sinceChatMs) && sinceChatMs >= 0) {
        const sinceDate = new Date(sinceChatMs);
        const rows = await sql`
            SELECT * FROM party_messages
            WHERE party_id = ${partyId}::uuid AND created_at > ${sinceDate}
            ORDER BY created_at ASC
            LIMIT ${MAX_CHAT_BATCH}`;
        chatMessages = rows.map(rowToChatMessage);
        if (rows.length) {
            latestChatMs = new Date(rows[rows.length - 1].created_at).getTime();
        }
    }
    res.status(200).json({
        ok: true,
        changed,
        version: bundle.party.version,
        updatedAt: new Date(bundle.party.updated_at).getTime(),
        party: changed ? rowToPartySnapshot(bundle, { isOwner: ownerView }) : null,
        chat: { messages: chatMessages, latestCreatedAt: latestChatMs },
    });
}

async function handleChatPost(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    if (!session && !memberTokenFromReq(req)) {
        partyReject(res, 401, 'unauthorized');
        return;
    }
    const sql = await getPartySql();
    if (!(await durableRateLimit(res, sql, `party:chat:${clientKey(req)}`, 40))) return;
    const access = await assertPartyChatAccess(sql, partyId, session, memberTokenFromReq(req));
    if (!access.ok) {
        partyReject(res, access.status, access.error);
        return;
    }
    const text = sanitizePartyChatBody(body.body ?? body.text ?? '');
    const attachment = normalizeAttachmentMeta(body.attachment || body.attachmentMeta);
    const isAmpi = Boolean(body.isAmpi);
    const ampiViaName = isAmpi
        ? String(body.ampiViaName || access.displayName || '').trim().slice(0, MAX_DISPLAY)
        : null;
    const rejection = partyChatPostRejection({ text, isAmpi, attachment });
    if (rejection) {
        partyReject(res, 400, 'bad_request', { message: rejection });
        return;
    }
    if (isAmpi && !ampiViaName) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const displayName = isAmpi ? `Ampi (via ${ampiViaName})` : String(access.displayName || 'Member').slice(0, MAX_DISPLAY);
    const inserted = await sql`
        INSERT INTO party_messages (
            party_id, sender_member_id, sender_display_name, body, is_ampi, ampi_via_name, attachment_meta
        ) VALUES (
            ${partyId}::uuid,
            ${access.memberId ? access.memberId : null}::uuid,
            ${displayName},
            ${text},
            ${isAmpi},
            ${isAmpi ? ampiViaName : null},
            ${attachment ? JSON.stringify(attachment) : null}
        )
        RETURNING *`;
    res.status(200).json({ ok: true, message: rowToChatMessage(inserted[0]) });
}

async function handleChatDelete(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const messageId = String(body.messageId || '').trim();
    if (!partyId || !messageId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    if (!session && !memberTokenFromReq(req)) {
        partyReject(res, 401, 'unauthorized');
        return;
    }
    const sql = await getPartySql();
    const access = await assertPartyChatAccess(sql, partyId, session, memberTokenFromReq(req));
    if (!access.ok) {
        partyReject(res, access.status, access.error);
        return;
    }
    const rows = await sql`
        SELECT id, sender_member_id FROM party_messages
        WHERE id = ${messageId}::uuid AND party_id = ${partyId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) {
        partyReject(res, 404, 'not_found');
        return;
    }
    const ownerView = session ? await isPartyOwner(sql, partyId, session) : false;
    const ownMessage = row.sender_member_id && access.memberId && row.sender_member_id === access.memberId;
    if (!ownerView && !ownMessage) {
        partyReject(res, 403, 'forbidden');
        return;
    }
    await sql`DELETE FROM party_messages WHERE id = ${messageId}::uuid`;
    res.status(200).json({ ok: true, messageId });
}

async function handleMigrate(req, res, session) {
    const body = parseBody(req);
    const name = String(body.name || '').trim().slice(0, MAX_NAME);
    if (!name) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const membersInput = Array.isArray(body.members) ? body.members : [];
    if (membersInput.length > MAX_MIGRATE_MEMBERS) {
        partyReject(res, 400, 'bad_request', { message: `At most ${MAX_MIGRATE_MEMBERS} members can be migrated.` });
        return;
    }

    const sql = await getPartySql();
    if (!(await durableRateLimit(res, sql, `party:create:${session.sub}`, 10))) return;

    let imagePayload = null;
    if (body.imageBase64) {
        imagePayload = parseValidatedImage(body.imageBase64, res);
        if (!imagePayload) return;
    }

    const { partyId, inviteToken, ownerMemberToken } = await withPartyTransaction(async (client) => {
        const inviteToken = generateToken(24);
        const partyRes = await client.query(
            `INSERT INTO parties (name, owner_sub, owner_email) VALUES ($1, $2, $3) RETURNING id`,
            [name, session.sub, session.email.toLowerCase()]
        );
        const partyId = partyRes.rows[0].id;
        await insertInviteToken(client, partyId, inviteToken);
        const ownerMemberToken = generateToken(32);
        await upsertActivePartyMember(client, {
            partyId,
            displayName: session.name || 'Owner',
            email: session.email.toLowerCase(),
            googleSub: session.sub,
            memberTokenHash: hashToken(ownerMemberToken),
        });
        let added = 1;
        for (const m of membersInput) {
            const displayName = String(m.displayName || m.name || '').trim().slice(0, MAX_DISPLAY);
            if (!displayName || displayName.toLowerCase() === 'owner') continue;
            if (!isHumanPartyMember({ displayName })) continue;
            if (added >= MAX_ACTIVE_MEMBERS) break;
            const email = m.email ? String(m.email).trim().toLowerCase().slice(0, MAX_EMAIL_LEN) : null;
            if (email && email === session.email.toLowerCase()) continue;
            await upsertActivePartyMember(client, {
                partyId,
                displayName,
                email,
                googleSub: null,
                memberTokenHash: null,
            });
            added += 1;
        }
        await replaceMealsOnClient(client, partyId, body.meals);
        if (imagePayload) {
            let imageUrl = null;
            let imageBytea = null;
            if (isBlobConfigured()) {
                const uploaded = await uploadPartyImage({
                    partyId,
                    buffer: imagePayload.buffer,
                    contentType: imagePayload.contentType,
                });
                imageUrl = uploaded.url;
            } else {
                imageBytea = imagePayload.buffer;
            }
            await client.query(
                `UPDATE parties SET image_url = $1, image_bytea = $2, image_content_type = $3 WHERE id = $4::uuid`,
                [imageUrl, imageBytea, imagePayload.contentType, partyId]
            );
        }
        await client.query(
            `UPDATE parties SET version = version + 1, updated_at = now() WHERE id = $1::uuid`,
            [partyId]
        );
        return { partyId, inviteToken, ownerMemberToken };
    });

    const bundle = await loadPartyBundle(sql, partyId);
    res.status(200).json({
        ok: true,
        partyId,
        ownerMemberToken,
        inviteToken,
        inviteUrl: `/p/${inviteToken}`,
        party: rowToPartySnapshot(bundle, { isOwner: true }),
    });
}

async function handlePartyImage(req, res) {
    const partyId = String(req.query?.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const variant = String(req.query?.variant || 'full').toLowerCase() === 'thumb' ? 'thumb' : 'full';
    const versionParam = String(req.query?.v || '').trim();
    const rows = await sql`
        SELECT image_url, image_bytea, image_content_type,
               image_thumb_url, image_thumb_bytea, image_thumb_content_type,
               version
        FROM parties WHERE id = ${partyId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) {
        partyReject(res, 404, 'not_found');
        return;
    }
    const cacheKey = versionParam || String(row.version ?? '');
    const url = variant === 'thumb' ? row.image_thumb_url || row.image_url : row.image_url;
    const bytea = variant === 'thumb' ? row.image_thumb_bytea || row.image_bytea : row.image_bytea;
    const contentType =
        variant === 'thumb'
            ? row.image_thumb_content_type || row.image_content_type
            : row.image_content_type;
    if (url) {
        res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
        res.redirect(302, url);
        return;
    }
    if (bytea) {
        applyBinaryImageHeaders(res, contentType || 'application/octet-stream', cacheKey);
        res.status(200).send(Buffer.from(bytea));
        return;
    }
    partyReject(res, 404, 'not_found');
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;

    const action = actionFromReq(req);
    if (action === 'image' && req.method === 'GET') {
        if (!isPartyDatabaseConfigured()) {
            partyReject(res, 503, 'misconfigured');
            return;
        }
        if (!softRateLimit(req, res, 'party-image', 60)) return;
        try {
            await handlePartyImage(req, res);
        } catch (error) {
            console.error('[party/image]', error);
            partyReject(res, 500, 'server_error');
        }
        return;
    }

    const chatGetActions = ['changes_since', 'chat_history'];
    if (req.method !== 'POST' && !(chatGetActions.includes(action) && req.method === 'GET')) {
        partyReject(res, 405, 'method_not_allowed');
        return;
    }

    if (!isPartyDatabaseConfigured()) {
        partyReject(res, 503, 'misconfigured');
        return;
    }
    if (!softRateLimit(req, res, 'party-api', 40)) return;

    let session = null;
    const chatActions = ['changes_since', 'chat_history', 'chat_post', 'chat_delete'];
    const needsSession = [
        'create',
        'join',
        'get',
        'leave',
        'remove_member',
        'upload_image',
        'migrate',
        'rotate_invite',
        'rename',
        'update_meals',
        'claim_ingredient',
        'unclaim_ingredient',
        'set_pantry_share',
        'update_pantry_snapshot',
        'refresh_owner_member_token',
    ].includes(action);

    if (chatActions.includes(action)) {
        session = await optionalUserSession(req);
        if (!session && !memberTokenFromReq(req)) {
            partyReject(res, 401, 'unauthorized');
            return;
        }
    } else if (needsSession) {
        session = await requireUserSession(req, res);
        if (!session) return;
    }

    try {
        switch (action) {
            case 'create':
                await handleCreate(req, res, session);
                break;
            case 'get':
                await handleGet(req, res, session);
                break;
            case 'join':
                await handleJoin(req, res, session);
                break;
            case 'leave':
                await handleLeave(req, res);
                break;
            case 'remove_member':
                await handleRemoveMember(req, res, session);
                break;
            case 'rotate_invite':
                await handleRotateInvite(req, res, session);
                break;
            case 'rename':
                await handleRename(req, res, session);
                break;
            case 'update_meals':
                await handleUpdateMeals(req, res, session);
                break;
            case 'upload_image':
                await handleUploadImage(req, res, session);
                break;
            case 'changes_since':
                await handleChangesSince(req, res, session);
                break;
            case 'chat_history':
                await handleChatHistory(req, res, session);
                break;
            case 'refresh_owner_member_token':
                await handleRefreshOwnerMemberToken(req, res, session);
                break;
            case 'migrate':
                await handleMigrate(req, res, session);
                break;
            case 'claim_ingredient':
                await handleClaimIngredient(req, res, session);
                break;
            case 'unclaim_ingredient':
                await handleUnclaimIngredient(req, res, session);
                break;
            case 'set_pantry_share':
                await handleSetPantryShare(req, res, session);
                break;
            case 'update_pantry_snapshot':
                await handleUpdatePantrySnapshot(req, res, session);
                break;
            case 'chat_post':
                await handleChatPost(req, res, session);
                break;
            case 'chat_delete':
                await handleChatDelete(req, res, session);
                break;
            default:
                partyReject(res, 400, 'bad_request');
        }
    } catch (error) {
        console.error(`[party/${action}]`, error);
        partyReject(res, 500, 'server_error');
    }
}
