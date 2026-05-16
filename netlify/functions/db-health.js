import { APP_VERSION, getSql, jsonResponse } from './_db.js';

export async function handler() {
  const sql = getSql();

  if (!sql) {
    return jsonResponse(200, {
      ok: false,
      connected: false,
      app: 'My Passwords',
      version: APP_VERSION,
      message: 'Netlify Database is not available to this function yet. Make sure @netlify/database is installed, the site is linked, and the latest deploy has completed.'
    });
  }

  try {
    const rows = await sql`select now() as server_time`;
    return jsonResponse(200, {
      ok: true,
      connected: true,
      app: 'My Passwords',
      version: APP_VERSION,
      database_driver: '@netlify/database',
      server_time: rows?.[0]?.server_time || null
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      connected: false,
      app: 'My Passwords',
      version: APP_VERSION,
      message: 'Database driver loaded, but the test query failed.',
      error: error.message
    });
  }
}
