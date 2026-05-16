import {
  APP_VERSION,
  getDatabaseUrl,
  getEnvironmentFlags,
  getNetlifyDatabaseDiagnostics,
  jsonResponse
} from './_db.js';
import { neon } from '@neondatabase/serverless';

export async function handler() {
  const startedAt = new Date().toISOString();
  const env = getEnvironmentFlags();
  const manualDatabaseUrl = getDatabaseUrl();
  const { diagnostics, sql } = await getNetlifyDatabaseDiagnostics();

  const base = {
    app: 'My Passwords',
    version: APP_VERSION,
    checked_at: startedAt,
    environment: env,
    netlify_database: diagnostics
  };

  if (sql) {
    try {
      const rows = await sql`select now() as server_time, current_database() as database_name`;
      return jsonResponse(200, {
        ok: true,
        connected: true,
        ...base,
        database_driver: '@netlify/database',
        server_time: rows?.[0]?.server_time || null,
        database_name: rows?.[0]?.database_name || null
      });
    } catch (error) {
      return jsonResponse(500, {
        ok: false,
        connected: false,
        ...base,
        database_driver: '@netlify/database',
        message: 'The @netlify/database package loaded, but the test query failed.',
        error: error.message
      });
    }
  }

  if (manualDatabaseUrl) {
    try {
      const manualSql = neon(manualDatabaseUrl);
      const rows = await manualSql`select now() as server_time, current_database() as database_name`;
      return jsonResponse(200, {
        ok: true,
        connected: true,
        ...base,
        database_driver: 'manual-env-url',
        server_time: rows?.[0]?.server_time || null,
        database_name: rows?.[0]?.database_name || null
      });
    } catch (error) {
      return jsonResponse(500, {
        ok: false,
        connected: false,
        ...base,
        database_driver: 'manual-env-url',
        message: 'A manual database URL was found, but the test query failed.',
        error: error.message
      });
    }
  }

  return jsonResponse(200, {
    ok: false,
    connected: false,
    ...base,
    message: 'No usable Netlify Database runtime connection was found. This diagnostic response now shows whether @netlify/database imports, whether getConnectionString is available, and whether any database URL environment variables are present.'
  });
}
