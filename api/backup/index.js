import { applyCors } from '../_lib/cors.js';
import { isGoogleSignInConfigured, requireSecrets } from '../_lib/env.js';
import { bearerToken, verifySession } from '../_lib/session.js';
import { getBackupSql, isPartyDatabaseConfigured } from '../_lib/partyDb.js';
import { consumePartyRateLimit } from '../_lib/partyRateLimit.js';
import { checkMinuteRateLimit } from '../_lib/store.js';
import { isSyncEncryptionConfigured } from '../_lib/syncCrypto.js';
import { handleSyncPull, handleSyncPush, handleSyncStatus } from '../_lib/syncStore.js';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_BACKUPS_PER_USER = 10;

function clientKey(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function parseBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    return {};
}

function actionFromReq(req) {
    const q = req.query?.action;
    if (q) return String(q);
    return String(parseBody(req).action || '');
}

async function requireUser(req, res) {
    if (!isGoogleSignInConfigured() || !isPartyDatabaseConfigured()) {
        res.status(503).json({ error: 'misconfigured', message: 'Backups are not available.' });
        return null;
    }
    try {
        requireSecrets();
    } catch {
        res.status(503).json({ error: 'misconfigured', message: 'Server configuration error.' });
        return null;
    }
    const token = bearerToken(req);
    if (!token) {
        res.status(401).json({ error: 'unauthorized', message: 'Sign in in Account.' });
        return null;
    }
    try {
        return await verifySession(token);
    } catch {
        res.status(401).json({ error: 'unauthorized', message: 'Sign in again in Account.' });
        return null;
    }
}

async function trimOldBackups(sql, userSub) {
    const rows = await sql`
        SELECT id FROM user_backups WHERE user_sub = ${userSub}
        ORDER BY created_at DESC`;
    const excess = rows.slice(MAX_BACKUPS_PER_USER);
    for (const row of excess) {
        await sql`DELETE FROM user_backups WHERE id = ${row.id}::uuid AND user_sub = ${userSub}`;
    }
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;

    const action = actionFromReq(req);
    if (!checkMinuteRateLimit(`backup:${clientKey(req)}`, 30)) {
        res.status(429).json({ error: 'rate_limited', message: 'Too many requests.' });
        return;
    }

    const session = await requireUser(req, res);
    if (!session) return;

    const sql = await getBackupSql();
    const userSub = session.sub;

    try {
        if (action === 'list' && req.method === 'GET') {
            const rows = await sql`
                SELECT id, created_at, app_version, schema_version, size_bytes
                FROM user_backups WHERE user_sub = ${userSub}
                ORDER BY created_at DESC LIMIT ${MAX_BACKUPS_PER_USER}`;
            res.status(200).json({
                ok: true,
                backups: rows.map((r) => ({
                    id: r.id,
                    createdAt: new Date(r.created_at).getTime(),
                    appVersion: r.app_version,
                    schemaVersion: r.schema_version,
                    sizeBytes: r.size_bytes,
                })),
            });
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed.' });
            return;
        }

        const body = parseBody(req);

        if (action === 'upload') {
            if (!(await consumePartyRateLimit(sql, `backup:upload:${userSub}`, 6))) {
                res.status(429).json({ error: 'rate_limited', message: 'Too many backup uploads.' });
                return;
            }
            const appVersion = String(body.appVersion || 'unknown').slice(0, 40);
            const schemaVersion = Number(body.schemaVersion ?? 0);
            const payloadBase64 = String(body.payloadBase64 || '').trim();
            const raw = payloadBase64.replace(/^data:[^;]+;base64,/, '');
            const buffer = Buffer.from(raw, 'base64');
            if (!buffer.length || buffer.length > MAX_BACKUP_BYTES) {
                res.status(400).json({
                    error: 'bad_request',
                    message: `Backup must be between 1 byte and ${MAX_BACKUP_BYTES} bytes.`,
                });
                return;
            }
            const inserted = await sql`
                INSERT INTO user_backups (user_sub, app_version, schema_version, size_bytes, data)
                VALUES (${userSub}, ${appVersion}, ${schemaVersion}, ${buffer.length}, ${buffer})
                RETURNING id, created_at`;
            await trimOldBackups(sql, userSub);
            res.status(200).json({
                ok: true,
                id: inserted[0].id,
                createdAt: new Date(inserted[0].created_at).getTime(),
                sizeBytes: buffer.length,
            });
            return;
        }

        if (action === 'get') {
            const backupId = String(body.backupId || '').trim();
            if (!backupId) {
                res.status(400).json({ error: 'bad_request', message: 'Missing backupId.' });
                return;
            }
            const rows = await sql`
                SELECT data, size_bytes, app_version, schema_version, created_at
                FROM user_backups WHERE id = ${backupId}::uuid AND user_sub = ${userSub} LIMIT 1`;
            const row = rows[0];
            if (!row) {
                res.status(404).json({ error: 'not_found', message: 'Backup not found.' });
                return;
            }
            res.status(200).json({
                ok: true,
                payloadBase64: Buffer.from(row.data).toString('base64'),
                sizeBytes: row.size_bytes,
                appVersion: row.app_version,
                schemaVersion: row.schema_version,
                createdAt: new Date(row.created_at).getTime(),
            });
            return;
        }

        if (action === 'delete') {
            const backupId = String(body.backupId || '').trim();
            if (!backupId) {
                res.status(400).json({ error: 'bad_request', message: 'Missing backupId.' });
                return;
            }
            await sql`DELETE FROM user_backups WHERE id = ${backupId}::uuid AND user_sub = ${userSub}`;
            res.status(200).json({ ok: true });
            return;
        }

        if (action === 'sync-status' && req.method === 'GET') {
            if (!isSyncEncryptionConfigured()) {
                res.status(503).json({
                    error: 'misconfigured',
                    message: 'Cloud sync is not available (SYNC_ENCRYPTION_KEY missing).',
                });
                return;
            }
            const status = await handleSyncStatus(sql, userSub);
            res.status(200).json(status);
            return;
        }

        if (action === 'sync-pull') {
            if (!isSyncEncryptionConfigured()) {
                res.status(503).json({
                    error: 'misconfigured',
                    message: 'Cloud sync is not available (SYNC_ENCRYPTION_KEY missing).',
                });
                return;
            }
            if (!(await consumePartyRateLimit(sql, `sync:pull:${userSub}`, 60))) {
                res.status(429).json({ error: 'rate_limited', message: 'Too many sync pulls.' });
                return;
            }
            const cursor = body.cursor ?? req.query?.cursor ?? 0;
            const result = await handleSyncPull(sql, userSub, cursor);
            res.status(200).json(result);
            return;
        }

        if (action === 'sync-push') {
            if (!isSyncEncryptionConfigured()) {
                res.status(503).json({
                    error: 'misconfigured',
                    message: 'Cloud sync is not available (SYNC_ENCRYPTION_KEY missing).',
                });
                return;
            }
            if (!(await consumePartyRateLimit(sql, `sync:push:${userSub}`, 30))) {
                res.status(429).json({ error: 'rate_limited', message: 'Too many sync pushes.' });
                return;
            }
            const deviceId = String(body.deviceId || '').slice(0, 64);
            const records = body.records;
            const result = await handleSyncPush(sql, userSub, deviceId, records);
            if (result.error) {
                res.status(400).json({ error: result.error, message: result.message });
                return;
            }
            res.status(200).json(result);
            return;
        }

        res.status(400).json({ error: 'bad_request', message: 'Unknown action.' });
    } catch (error) {
        console.error('[backup]', action, error);
        res.status(500).json({
            error: 'server_error',
            message: 'Something went wrong on our side. Try again in a moment.',
        });
    }
}
