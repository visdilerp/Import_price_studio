# Visdil Ventures — Import Cost Studio

Multi-user import landed-cost calculator for China (USD) and UK (GBP) shipments into India.

- Admin creates logins; each user's saved calculations are visible to themselves and to admins.
- Calculations list (searchable by report name), fully editable, with an edit log per report.
- Price revision history (Offer 1 → Offer 2 → …) per report.
- Branded, professionally formatted PDF reports.

**Stack:** static HTML/CSS/JS · Supabase (auth + Postgres + Row Level Security) · Netlify (hosting)

---

## 1. Supabase setup (database + logins)

1. Go to https://supabase.com → **New project** (free tier is fine). Choose a strong database password and a region near you (e.g. Mumbai).
2. When the project is ready, open **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`, and click **Run**. This creates all tables, security policies, and triggers.
3. **Allow instant logins:** go to **Authentication → Sign In / Providers → Email** and turn **OFF** "Confirm email". (Users created by the admin can then sign in immediately, without a confirmation email.)
4. **Create your admin account:** go to **Authentication → Users → Add user → Create new user**. Enter your email + password and tick "Auto Confirm User".
5. Promote it to admin — back in **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
6. Get your keys: **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `js/config.js`:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://YOURPROJECT.supabase.co",
     SUPABASE_ANON_KEY: "eyJ..."
   };
   ```
   The anon key is designed to be public — all data protection is enforced by Row Level Security in the database.

> After deploying, sign in as admin → **Users** tab → create logins for your team from inside the app.

---

## 2. Git / GitHub

From inside this project folder:

```bash
git init
git add .
git commit -m "Visdil Import Cost Studio - initial version"
```

Create an empty repository on https://github.com (no README/.gitignore — this folder already has them), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

For future changes: `git add . && git commit -m "message" && git push`

---

## 3. Netlify hosting

1. Go to https://app.netlify.com → **Add new site → Import an existing project → GitHub** and pick your repository.
2. Build settings: leave **Build command** empty and set **Publish directory** to `.` (the repo root). `netlify.toml` already configures this.
3. Deploy. Netlify gives you a URL like `https://something.netlify.app` — you can rename it under **Site settings → Change site name**, or attach your own domain.
4. Every `git push` to `main` auto-deploys.

**Recommended:** in Supabase, go to **Authentication → URL Configuration** and set the Site URL to your Netlify URL.

---

## Daily use

| Task | Where |
|---|---|
| New costing | Calculator tab → fill in → **Save** |
| Reopen / edit a report | Calculations tab → **Open / Edit** → change → **Save** (change is logged) |
| See who changed what | Calculations tab → **Edit log** |
| Freeze an offer (Offer 1, Offer 2, …) | Open the report → adjust markup/discount → **⟳ Record revision** |
| Compare offers over time | Calculations tab → **Revisions** |
| Create team logins | Users tab (admin only) |
| Branded PDF | **Download PDF report** |

## Notes & limits

- Creating users from the Users tab uses Supabase sign-up under the hood, so "Confirm email" must stay off. For stricter control (e.g. blocking anyone from signing up via the API directly), move user creation into a Netlify Function using the Supabase `service_role` key — happy to add this later.
- Password resets: admin can set a new password from Supabase Dashboard → Authentication → Users.
- Exchange rates and all charge rates are editable per report and stored with it, so old reports keep the rates they were made with.
