import { neon } from '@neondatabase/serverless';

export const APP_VERSION = 'My Passwords Ver-0.002';

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
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) return null;
  return neon(databaseUrl);
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
