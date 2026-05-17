# My Passwords Ver-0.003 — Supabase Setup

This patch switches the cloud database layer from Netlify Database to Supabase while keeping Netlify hosting and Netlify Functions.

## Supabase project setup

1. Create a new Supabase project.
2. Open Supabase SQL Editor.
3. Run the full SQL from `db/schema.sql`.
4. Go to Project Settings → API.
5. Copy:
   - Project URL
   - service_role key

## Netlify environment variables

Add these to the Netlify project:

```text
SUPABASE_URL=your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=your service_role key
```

The service role key must only be used inside Netlify Functions. Do not place it in frontend code.

## Old Netlify Database variable

Remove or ignore the old variable:

```text
NETLIFY_DATABASE_URL
```

Ver-0.003 no longer uses Netlify Database for app writes.

## Important cleanup

Remove the old Netlify Database migrations folder from the repo:

```bat
rmdir /s /q netlify\database
```

Then commit the deletion so Netlify stops running Netlify Database migration setup.
