import { neon } from '@neondatabase/serverless';

export const APP_VERSION = 'My Passwords Ver-0.002D';

export function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body, null, 2)
  };
}

export function getDatabaseUrl() {
  return (
    process.env.NETLIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  );
}

export function getEnvironmentFlags() {
  return {
    has_NETLIFY_DATABASE_URL: Boolean(process.env.NETLIFY_DATABASE_URL),
    has_DATABASE_URL: Boolean(process.env.DATABASE_URL),
    has_POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
    has_NEON_DATABASE_URL: Boolean(process.env.NEON_DATABASE_URL),
    has_NETLIFY: Boolean(process.env.NETLIFY),
    has_CONTEXT: Boolean(process.env.CONTEXT),
    has_DEPLOY_PRIME_URL: Boolean(process.env.DEPLOY_PRIME_URL),
    has_URL: Boolean(process.env.URL)
  };
}

function describeConnectionString(value) {
  if (!value) return { present: false };

  try {
    const url = new URL(value);
    return {
      present: true,
      protocol: url.protocol.replace(':', ''),
      host: url.host,
      database: url.pathname.replace('/', '') || null,
      sslmode: url.searchParams.get('sslmode') || null
    };
  } catch (error) {
    return { present: true, parseable: false };
  }
}

export async function getNetlifyDatabaseDiagnostics() {
  const diagnostics = {
    package_imported: false,
    exported_keys: [],
    getDatabase_available: false,
    getConnectionString_available: false,
    connection_string: { present: false },
    database_client_created: false,
    database_client_keys: [],
    has_sql_method: false,
    has_pool_method: false,
    error: null
  };

  try {
    const netlifyDatabase = await import('@netlify/database');
    diagnostics.package_imported = true;
    diagnostics.exported_keys = Object.keys(netlifyDatabase).sort();
    diagnostics.getDatabase_available = typeof netlifyDatabase.getDatabase === 'function';
    diagnostics.getConnectionString_available = typeof netlifyDatabase.getConnectionString === 'function';

    if (diagnostics.getConnectionString_available) {
      try {
        const connectionString = netlifyDatabase.getConnectionString();
        diagnostics.connection_string = describeConnectionString(connectionString);
      } catch (error) {
        diagnostics.connection_string = { present: false, error: error.message };
      }
    }

    if (diagnostics.getDatabase_available) {
      try {
        const db = netlifyDatabase.getDatabase();
        diagnostics.database_client_created = Boolean(db);
        diagnostics.database_client_keys = db ? Object.keys(db).sort() : [];
        diagnostics.has_sql_method = typeof db?.sql === 'function';
        diagnostics.has_pool_method = Boolean(db?.pool);
        return { diagnostics, sql: typeof db?.sql === 'function' ? db.sql : null };
      } catch (error) {
        diagnostics.error = error.message;
      }
    }
  } catch (error) {
    diagnostics.error = error.message;
  }

  return { diagnostics, sql: null };
}

export async function getSql() {
  const { sql } = await getNetlifyDatabaseDiagnostics();
  if (sql) return sql;

  const databaseUrl = getDatabaseUrl();
  if (databaseUrl) return neon(databaseUrl);

  return null;
}

export function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    return {};
  }
}

export function requirePost(event) {
  return event.httpMethod === 'POST';
}

export function publicId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
