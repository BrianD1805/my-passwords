import { APP_VERSION, getDatabaseUrl, getSql, jsonResponse } from './_db.js';

export async function handler() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return jsonResponse(200, {
      ok: false,
      connected: false,
      app: 'My Passwords',
      version: APP_VERSION,
      message: 'No database connection string found yet. Add NETLIFY_DATABASE_URL or DATABASE_URL in Netlify environment variables after provisioning Netlify Database.'
    });
  }

  try {
    const sql = getSql();
    const rows = await sql`select now() as server_time`;
    return jsonResponse(200, {
      ok: true,
      connected: true,
      app: 'My Passwords',
      version: APP_VERSION,
      server_time: rows?.[0]?.server_time || null
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      connected: false,
      app: 'My Passwords',
      version: APP_VERSION,
      message: 'Database connection was found but the test query failed.',
      error: error.message
    });
  }
}
