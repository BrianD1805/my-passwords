import { getDatabase } from '@netlify/database';
import { neon } from '@neondatabase/serverless';

export const APP_VERSION = 'My Passwords Ver-0.002B';

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

export function getSql() {
  // Netlify Database's current recommended path is @netlify/database.
  // It automatically resolves the correct production or deploy-preview database branch.
  try {
    const db = getDatabase();
    if (db?.sql) return db.sql;
  } catch (error) {
    // Fall back to a manual connection string for older/local setups.
  }

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
