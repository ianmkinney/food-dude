import { getPartySql, isPartyDatabaseConfigured } from './_lib/partyDb.js';

export const config = {
    runtime: 'edge',
};

export default async function handler(req) {
    const { ImageResponse } = await import('@vercel/og');
    const React = await import('react');
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get('token') || '').trim();
    let title = 'AmpliFood Party';
    if (token && isPartyDatabaseConfigured()) {
        try {
            const sql = await getPartySql();
            const rows = await sql`
                SELECT p.name FROM invite_tokens it
                JOIN parties p ON p.id = it.party_id
                WHERE it.token = ${token} AND it.revoked = false
                LIMIT 1`;
            if (rows[0]?.name) title = rows[0].name;
        } catch (error) {
            console.warn('[p-og] lookup failed', error?.message || error);
        }
    }
    return new ImageResponse(
        React.createElement(
            'div',
            {
                style: {
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 50%, #042f2e 100%)',
                    color: 'white',
                    fontFamily: 'system-ui, sans-serif',
                    padding: 48,
                },
            },
            React.createElement(
                'div',
                { style: { fontSize: 36, opacity: 0.9, marginBottom: 24 } },
                'AmpliFood'
            ),
            React.createElement(
                'div',
                {
                    style: {
                        fontSize: 64,
                        fontWeight: 700,
                        textAlign: 'center',
                        lineHeight: 1.1,
                        maxWidth: 1000,
                    },
                },
                title
            ),
            React.createElement(
                'div',
                { style: { fontSize: 28, marginTop: 32, opacity: 0.85 } },
                'Join the party'
            )
        ),
        { width: 1200, height: 630 }
    );
}
