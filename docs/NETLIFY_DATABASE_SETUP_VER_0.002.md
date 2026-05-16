# My Passwords Ver-0.002 — Netlify Database Setup

## 1. Provision Netlify Database

In Netlify, open the My Passwords site and look for the Database / Data & Storage area. Provision a Netlify Database for the project.

Netlify Database is an integrated Postgres database. The app expects a Postgres connection string to be available to Netlify Functions.

## 2. Add the database connection variable

In Netlify, go to:

Site configuration → Environment variables

Add one of these keys, depending on what Netlify gives you:

```text
NETLIFY_DATABASE_URL=your_postgres_connection_string
```

If Netlify shows the value as `DATABASE_URL`, use that instead. The functions check these names in order:

```text
NETLIFY_DATABASE_URL
DATABASE_URL
POSTGRES_URL
NEON_DATABASE_URL
```

Keep the value secret. Do not add it to GitHub.

## 3. Run the SQL schema

Use the SQL in:

```text
db/schema.sql
```

Run it in the Netlify Database SQL editor / query tool. If Netlify offers migrations in your dashboard, apply it there.

## 4. Redeploy

After adding the environment variable, trigger:

```text
Deploys → Trigger deploy → Clear cache and deploy site
```

## 5. Test endpoints

Replace YOUR-SITE with your actual Netlify domain.

```text
https://YOUR-SITE.netlify.app/.netlify/functions/health
https://YOUR-SITE.netlify.app/.netlify/functions/db-health
```

The `db-health` endpoint should say `connected: true` once the database URL and schema are ready.
