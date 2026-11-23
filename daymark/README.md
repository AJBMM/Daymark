# Daymark

A private, cloud-synced daily planner built with React, Vite and Supabase.

## Features
- Email/password account sign-in and sign-up
- Cloud-saved tasks, synced across devices
- Task subjects, estimates, deadlines, priorities and descriptions
- Daily schedule and automatic allocation across available days
- Weighted daily completion percentage (by estimated minutes)
- Complete, pause, edit and delete tasks
- Weekly view, workload limit and dark mode
- Responsive layout for desktop, tablet and phone

## 1. Set up the database
In your Supabase project, open **SQL Editor → New query**. Paste the contents of `supabase-schema.sql` and click **Run**.

## 2. Add the Supabase connection
In Supabase, open **Project Settings → API** (or **Data API** depending on the dashboard).
Copy the **Project URL** and the **publishable key** (or legacy `anon` key).

Create a file named `.env` in the project root, based on `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

These are browser-side project credentials, not your database password or service-role key. **Never put a service-role/secret key in this app or share it.**

## 3. Run locally (optional)
Install Node.js, then in this folder run:

```bash
npm install
npm run dev
```

## 4. Deploy on Vercel
1. Create a GitHub repository named `daymark`.
2. Upload the contents of this folder to the repository (not the ZIP file itself).
3. In Vercel, choose **Add New → Project**, import the `daymark` GitHub repository.
4. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
5. In Vercel Project Settings → Environment Variables, add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key
6. Deploy. Vercel will give you a URL ending in `vercel.app`.

## 5. Make it just for you
The database uses Row Level Security, so users can only read or change rows belonging to their own account. After you create your own Daymark login, disable new sign-ups in Supabase under **Authentication → Settings → Allow new users to sign up**. Keep your Vercel URL private if you don't want others visiting the sign-in page.

## Notes
- The app is private by account/data permissions, not by hiding the URL. Anyone who knows the URL may see the sign-in page, but cannot see your tasks without signing in.
- The publishable/anon key is designed to be used in the browser; database security comes from Row Level Security. Never use the Supabase service-role key in frontend code.
