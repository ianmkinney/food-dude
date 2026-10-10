import { applyCors } from '../_lib/cors.js';
import { isEmailAllowed, isOwnerGateConfigured, requireSecrets } from '../_lib/env.js';
import { bearerToken, verifySession } from '../_lib/session.js';
import { checkMinuteRateLimit } from '../_lib/store.js';
import { getPartySql, isPartyDatabaseConfigured, MAX_PARTY_IMAGE_BYTES } from '../_lib/partyDb.js';
import { generateToken, hashToken } from '../_lib/partyTokens.js';
import { memberTokenFromReq, partyReject } from '../_lib/partyHttp.js';
import { normalizeMealsInput, rowToPartySnapshot } from '../_lib/partySerialize.js';
import { uploadPartyImage, isBlobConfigured } from '../_lib/partyBlob.js';

const MAX_NAME = 200;
const MAX_DISPLAY = 120;
const MAX_MEALS = 80;
const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

function clientKey(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res, bucket, max = 30) {
    if (!checkMinuteRateLimit(`${bucket}:${clientKey(req)}`, max)) {
        partyReject(res, 429, 'rate_limited');
        return false;
    }
    return true;
}

async function requireOwnerSession(req, res) {
    if (!isOwnerGateConfigured()) {
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
        const session = await verifySession(token);
        if (!isEmailAllowed(session.email)) {
            partyReject(res, 403, 'not_allowed');
            return null;
        }
        return session;
    } catch {
        partyReject(res, 401, 'unauthorized');
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
    const invites = await sql`
        SELECT token FROM invite_tokens WHERE party_id = ${partyId}::uuid AND revoked = false
        ORDER BY created_at DESC LIMIT 1`;
    return {
        party,
        members,
        meals,
        inviteToken: invites[0]?.token || null,
    };
}

async function assertPartyOwner(sql, partyId, session) {
    const rows = await sql`
        SELECT owner_sub, owner_email FROM parties WHERE id = ${partyId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) return { ok: false, status: 404, error: 'not_found' };
    const email = String(session.email).toLowerCase();
    const ownerEmail = String(row.owner_email || '').toLowerCase();
    if (row.owner_sub !== session.sub && email !== ownerEmail) {
        return { ok: false, status: 403, error: 'forbidden' };
    }
    return { ok: true };
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

async function bumpPartyVersion(sql, partyId) {
    const rows = await sql`
        UPDATE parties SET version = version + 1, updated_at = now()
        WHERE id = ${partyId}::uuid
        RETURNING version, updated_at`;
    return rows[0];
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

async function handleCreate(req, res, session) {
    const body = parseBody(req);
    const name = String(body.name || '').trim().slice(0, MAX_NAME);
    if (!name) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const inviteToken = generateToken(24);
    const rows = await sql`
        INSERT INTO parties (name, owner_sub, owner_email)
        VALUES (${name}, ${session.sub}, ${session.email.toLowerCase()})
        RETURNING id, name, version, updated_at, owner_email, image_url`;
    const party = rows[0];
    await sql`
        INSERT INTO invite_tokens (token, party_id) VALUES (${inviteToken}, ${party.id})`;
    const ownerMemberToken = generateToken(32);
    await sql`
        INSERT INTO party_members (party_id, display_name, email, status, member_token_hash)
        VALUES (
            ${party.id},
            ${session.name || session.email.split('@')[0] || 'Owner'},
            ${session.email.toLowerCase()},
            'active',
            ${hashToken(ownerMemberToken)}
        )`;
    const bundle = await loadPartyBundle(sql, party.id);
    const snapshot = rowToPartySnapshot({
        ...bundle,
        inviteToken,
    });
    res.status(200).json({
        ok: true,
        party: snapshot,
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
    let allowed = false;
    if (session) {
        const owner = await assertPartyOwner(sql, partyId, session);
        if (owner.ok) allowed = true;
    }
    if (!allowed) {
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
    res.status(200).json({ ok: true, party: rowToPartySnapshot(bundle) });
}

async function handleJoin(req, res) {
    const body = parseBody(req);
    const inviteToken = String(body.inviteToken || body.token || '').trim();
    const displayName = String(body.displayName || '').trim().slice(0, MAX_DISPLAY);
    if (!INVITE_TOKEN_RE.test(inviteToken) || !displayName) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const invites = await sql`
        SELECT party_id, revoked FROM invite_tokens WHERE token = ${inviteToken} LIMIT 1`;
    const invite = invites[0];
    if (!invite || invite.revoked) {
        partyReject(res, 404, 'not_found');
        return;
    }
    const memberToken = generateToken(32);
    const email = body.email ? String(body.email).trim().toLowerCase().slice(0, 200) : null;
    const inserted = await sql`
        INSERT INTO party_members (party_id, display_name, email, status, member_token_hash)
        VALUES (${invite.party_id}, ${displayName}, ${email}, 'active', ${hashToken(memberToken)})
        RETURNING member_id`;
    await bumpPartyVersion(sql, invite.party_id);
    const bundle = await loadPartyBundle(sql, invite.party_id);
    res.status(200).json({
        ok: true,
        memberId: inserted[0].member_id,
        memberToken,
        party: rowToPartySnapshot(bundle),
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
        UPDATE party_members SET status = 'removed', removed_at = now(), member_token_hash = NULL
        WHERE member_id = ${access.memberId}::uuid`;
    await bumpPartyVersion(sql, partyId);
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
    await sql`
        UPDATE party_members SET status = 'removed', removed_at = now(), member_token_hash = NULL
        WHERE party_id = ${partyId}::uuid AND member_id = ${memberId}::uuid`;
    await bumpPartyVersion(sql, partyId);
    res.status(200).json({ ok: true });
}

async function replaceMeals(sql, partyId, mealsInput) {
    const meals = normalizeMealsInput(mealsInput).slice(0, MAX_MEALS);
    await sql`DELETE FROM party_meals WHERE party_id = ${partyId}::uuid`;
    for (const meal of meals) {
        const recipeJson = JSON.stringify(meal.recipeIds || []);
        await sql`
            INSERT INTO party_meals (party_id, name, description, recipe_ids)
            VALUES (${partyId}::uuid, ${meal.name}, ${meal.description}, ${recipeJson}::jsonb)`;
    }
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
    let allowed = false;
    if (session) {
        const owner = await assertPartyOwner(sql, partyId, session);
        if (owner.ok) allowed = true;
    }
    if (!allowed) {
        const member = await assertMemberAccess(sql, partyId, memberToken);
        if (!member.ok) {
            partyReject(res, member.status, member.error);
            return;
        }
    }
    await replaceMeals(sql, partyId, body.meals);
    if (body.name) {
        const name = String(body.name).trim().slice(0, MAX_NAME);
        if (name) {
            await sql`UPDATE parties SET name = ${name}, updated_at = now() WHERE id = ${partyId}::uuid`;
        }
    }
    const bumped = await bumpPartyVersion(sql, partyId);
    const bundle = await loadPartyBundle(sql, partyId);
    res.status(200).json({
        ok: true,
        version: bumped.version,
        updatedAt: new Date(bumped.updated_at).getTime(),
        party: rowToPartySnapshot(bundle),
    });
}

async function handleUploadImage(req, res, session) {
    const body = parseBody(req);
    const partyId = String(body.partyId || '').trim();
    const imageBase64 = String(body.imageBase64 || '').trim();
    if (!partyId || !imageBase64) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const owner = await assertPartyOwner(sql, partyId, session);
    if (!owner.ok) {
        partyReject(res, owner.status, owner.error);
        return;
    }
    const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    let buffer;
    try {
        buffer = Buffer.from(raw, 'base64');
    } catch {
        partyReject(res, 400, 'bad_request');
        return;
    }
    if (buffer.length > MAX_PARTY_IMAGE_BYTES) {
        partyReject(res, 400, 'bad_request', { message: 'Image must be at most 500KB after compression.' });
        return;
    }
    let imageUrl = null;
    let imageBytea = null;
    if (isBlobConfigured()) {
        const uploaded = await uploadPartyImage({ partyId, buffer, contentType: 'image/jpeg' });
        imageUrl = uploaded.url;
    } else {
        imageBytea = buffer;
    }
    await sql`
        UPDATE parties SET image_url = ${imageUrl}, image_bytea = ${imageBytea}, updated_at = now()
        WHERE id = ${partyId}::uuid`;
    await bumpPartyVersion(sql, partyId);
    res.status(200).json({ ok: true, imageUrl });
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
    let allowed = false;
    if (session) {
        const owner = await assertPartyOwner(sql, partyId, session);
        if (owner.ok) allowed = true;
    }
    if (!allowed) {
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
    res.status(200).json({
        ok: true,
        changed,
        version: bundle.party.version,
        updatedAt: new Date(bundle.party.updated_at).getTime(),
        party: changed ? rowToPartySnapshot(bundle) : null,
    });
}

async function handleMigrate(req, res, session) {
    const body = parseBody(req);
    const name = String(body.name || '').trim().slice(0, MAX_NAME);
    if (!name) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const inviteToken = generateToken(24);
    const rows = await sql`
        INSERT INTO parties (name, owner_sub, owner_email)
        VALUES (${name}, ${session.sub}, ${session.email.toLowerCase()})
        RETURNING id`;
    const partyId = rows[0].id;
    await sql`INSERT INTO invite_tokens (token, party_id) VALUES (${inviteToken}, ${partyId})`;
    const ownerMemberToken = generateToken(32);
    await sql`
        INSERT INTO party_members (party_id, display_name, email, status, member_token_hash)
        VALUES (
            ${partyId},
            ${session.name || 'Owner'},
            ${session.email.toLowerCase()},
            'active',
            ${hashToken(ownerMemberToken)}
        )`;
    const members = Array.isArray(body.members) ? body.members : [];
    for (const m of members) {
        const displayName = String(m.displayName || m.name || '').trim().slice(0, MAX_DISPLAY);
        if (!displayName || displayName.toLowerCase() === 'owner') continue;
        await sql`
            INSERT INTO party_members (party_id, display_name, email, status)
            VALUES (${partyId}, ${displayName}, ${m.email || null}, 'active')`;
    }
    await replaceMeals(sql, partyId, body.meals);
    if (body.imageBase64) {
        const raw = String(body.imageBase64).replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(raw, 'base64');
        if (buffer.length && buffer.length <= MAX_PARTY_IMAGE_BYTES) {
            let imageUrl = null;
            let imageBytea = null;
            if (isBlobConfigured()) {
                const uploaded = await uploadPartyImage({ partyId, buffer, contentType: 'image/jpeg' });
                imageUrl = uploaded.url;
            } else {
                imageBytea = buffer;
            }
            await sql`
                UPDATE parties SET image_url = ${imageUrl}, image_bytea = ${imageBytea}
                WHERE id = ${partyId}::uuid`;
        }
    }
    await bumpPartyVersion(sql, partyId);
    const bundle = await loadPartyBundle(sql, partyId);
    res.status(200).json({
        ok: true,
        partyId,
        ownerMemberToken,
        inviteToken,
        inviteUrl: `/p/${inviteToken}`,
        party: rowToPartySnapshot({ ...bundle, inviteToken }),
    });
}

async function handlePartyImage(req, res) {
    const partyId = String(req.query?.partyId || '').trim();
    if (!partyId) {
        partyReject(res, 400, 'bad_request');
        return;
    }
    const sql = await getPartySql();
    const rows = await sql`
        SELECT image_url, image_bytea FROM parties WHERE id = ${partyId}::uuid LIMIT 1`;
    const row = rows[0];
    if (!row) {
        partyReject(res, 404, 'not_found');
        return;
    }
    if (row.image_url) {
        res.redirect(302, row.image_url);
        return;
    }
    if (row.image_bytea) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).send(Buffer.from(row.image_bytea));
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
        if (!rateLimit(req, res, 'party-image', 60)) return;
        try {
            await handlePartyImage(req, res);
        } catch (error) {
            console.error('[party/image]', error);
            partyReject(res, 500, 'bad_request');
        }
        return;
    }

    if (req.method !== 'POST' && !(action === 'changes_since' && req.method === 'GET')) {
        partyReject(res, 405, 'method_not_allowed');
        return;
    }

    if (!isPartyDatabaseConfigured()) {
        partyReject(res, 503, 'misconfigured');
        return;
    }
    if (!rateLimit(req, res, 'party-api', 40)) return;

    let session = null;
    const needsOwner =
        action === 'create' ||
        action === 'remove_member' ||
        action === 'upload_image' ||
        action === 'migrate';
    const optionalSession =
        action === 'get' || action === 'update_meals' || action === 'changes_since';

    if (needsOwner) {
        session = await requireOwnerSession(req, res);
        if (!session) return;
    } else if (optionalSession) {
        const token = bearerToken(req);
        if (token) {
            try {
                session = await verifySession(token);
                if (!isEmailAllowed(session.email)) session = null;
            } catch {
                session = null;
            }
        }
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
                await handleJoin(req, res);
                break;
            case 'leave':
                await handleLeave(req, res);
                break;
            case 'remove_member':
                await handleRemoveMember(req, res, session);
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
            case 'migrate':
                await handleMigrate(req, res, session);
                break;
            default:
                partyReject(res, 400, 'bad_request');
        }
    } catch (error) {
        console.error(`[party/${action}]`, error);
        partyReject(res, 500, 'bad_request');
    }
}
