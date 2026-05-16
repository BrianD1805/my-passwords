# My Passwords Ver-0.001 — Private Encrypted PWA Vault Foundation

This patch creates the first working foundation for **My Passwords**.

It is built as a private encrypted PWA now, but the folder/database structure is prepared so the project can later become a SaaS product.

---

## 1. Folder setup

Create your master local folder:

```bat
C:\01 My Work 2026\My Passwords\My Passwords Program Files
```

Unzip this patch and copy/overwrite all files into that master Program Files directory.

You normally open the terminal directly from the project folder, so no `cd` command is included here.

---

## 2. What is included in Ver-0.001

- React + Vite PWA app
- Installable manifest
- Service worker cache: `my-passwords-v0.001`
- Local encrypted vault using browser Web Crypto
- Master password unlock/create screen
- Dashboard
- Search
- Categories
- Add/delete encrypted local items
- Copy username/secret buttons
- Show/hide secret button
- SaaS-ready Postgres schema
- Netlify Functions folder
- Netlify config file
- Version label: `My Passwords Ver-0.001`

---

## 3. Local install commands

First-time install:

```bat
npm install
```

Start local testing:

```bat
npm run dev
```

Open the local URL shown in the terminal, usually:

```text
http://localhost:5173/
```

Production build test:

```bat
npm run build
```

Optional local production preview:

```bat
npm run preview
```

---

## 4. Local test checklist

1. Open the app locally.
2. Enter a master password with at least 8 characters.
3. Confirm the vault unlocks.
4. Add a test item.
5. Click copy username.
6. Click show/hide secret.
7. Click copy secret.
8. Lock the vault.
9. Reopen with the same master password.
10. Confirm the encrypted local records come back.
11. Run `npm run build` before pushing.

---

## 5. GitHub setup

Create a new GitHub repository, suggested name:

```text
my-passwords
```

Then from your local project folder:

```bat
git init
git branch -M main
git add .
git commit -m "My Passwords Ver-0.001 private encrypted PWA vault foundation"
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/my-passwords.git
git push -u origin main
```

For future patches, use:

```bat
git status
git add .
git commit -m "My Passwords Ver-0.001 private encrypted PWA vault foundation"
git push origin main
```

---

## 6. Netlify setup

1. Log in to Netlify.
2. Add new site.
3. Import from GitHub.
4. Select your `my-passwords` repository.
5. Use these build settings:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

The `netlify.toml` file already includes these values.

---

## 7. Netlify Database setup

This project is prepared for Netlify Database/Postgres, but Ver-0.001 keeps the vault local and encrypted first.

After the Netlify site is created:

1. Open the Netlify project.
2. Go to the data/database area.
3. Provision Netlify Database if available on your plan.
4. Once the database is live, run the SQL in:

```text
db/schema.sql
```

The database structure is SaaS-ready and includes:

- tenants
- users
- categories
- vault_items
- emergency_users
- emergency_requests
- audit_log

Important: sensitive data should only go into `vault_items.encrypted_payload`.

---

## 8. Netlify Functions test

After deploy, test:

```text
/.netlify/functions/health
/.netlify/functions/db-health
```

Expected Ver-0.001 behaviour:

- `health` confirms functions are wired.
- `db-health` confirms database is prepared but not connected yet.

---

## 9. Important security note

Ver-0.001 is a foundation build. It is not yet a finished commercial password manager.

Before using this for critical real-world secrets, the next stages should add:

- Production login/auth
- Database encrypted sync
- Secure account recovery policy
- Emergency access workflow
- Audit logs in the UI
- Export/backup encryption
- Strong master password rules
- Optional 2FA

---

## 10. Suggested next build

**My Passwords Ver-0.002 — connect encrypted vault sync to Netlify Database, add admin profile setup, tenant bootstrap, and database health check.**
