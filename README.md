# GiftVault

GiftVault is a wishlist app with Supabase email/password authentication, a per-account wishlist and contacts, public share links, friend requests, and gift reservations. Supabase Postgres stores all persistent app data. Reservation identities and reservation status are not readable by wishlist owners.

The interface uses an original editorial layout with glassmorphism and claymorphism, drawing broad inspiration from Lenis and Basement's typographic web direction without copying their sites or assets.

## Supabase setup

1. Create a Supabase project and enable **Authentication → Sign In / Providers → Email**.
2. Under **Authentication → URL Configuration**, set the local **Site URL** to `http://localhost:8000` and add `http://localhost:8000` and `http://127.0.0.1:8000` as redirect URLs.
3. In **Project Settings → API Keys**, use the **Project URL** and **Publishable key** (or legacy `anon`/public key). These browser values are configured in `supabase-config.js`. Never put a `service_role` or secret key in this app.
4. In **SQL Editor**, choose **New query**, paste the contents of `supabase/schema.sql`, and click **Run**. This creates the wishlist, items, contacts, reservations, RLS policies, and public-share/guest-reservation functions.
5. In **SQL Editor**, choose **New query**, paste the contents of `supabase/friends-migration.sql`, and click **Run**. This adds username profiles, friend requests, friendship RLS policies, and friend-only wishlist/reservation functions. It also creates profiles for existing Auth users and automatically creates one for new signups.

Email confirmation follows your Supabase Auth settings. If confirmation is enabled, users must follow the email link before signing in. The default Supabase email service is rate-limited; configure a trusted SMTP provider for a production launch.

After running both SQL files, users can set a username from **My wishlist → Edit username** (or the account menu). Friends find each other by exact username from the **Friends** page and accept or decline requests there. Usernames are unique, lowercase, 3–24 characters, and use letters, numbers, or underscores. The generated `member_…` username can be changed at any time. Public profile lookup returns no email addresses. Never expose a Supabase service-role key in the browser.

## Run locally

Python 3 is required for the local server. From this directory, run:

```sh
python3 dev-server.py
```

Open [http://localhost:8000](http://localhost:8000). The browser loads Supabase's JavaScript client from `esm.sh`, so an internet connection is required. The server rewrites `/list/<share-token>` requests to the app entry point so public share links work locally. Vercel deployments use `vercel.json` to rewrite extensionless routes to `/index.html` while leaving files such as `/styles.css` and `/app.js` untouched.

## Reservation privacy

Wishlist owners can select and manage their own wishlist and items under Row Level Security. Public visitors read a shared list only through `get_public_wishlist`, which returns list and item details but no reservation state. Reservations have RLS enabled, no client read policy, and no direct table grants. `reserve_wishlist_item` validates the share token and item, accepts a reserver name or email, and inserts at most one reservation per item without returning who reserved it or whether it was previously reserved. Friends can read a friend's wishlist only via `get_friend_wishlist`, which returns an `is_claimed` boolean without reservation identity; access is checked against an accepted friendship in the database. `reserve_friend_wishlist_item` validates the friendship on the server. Owners are not eligible to call that friend-only list function for their own wishlist, and the owner-facing app never requests reservation status.

This prevents the app and authenticated owner from querying reservation records, but a public share URL is a bearer link: anyone with it can open the same visitor flow. No anonymous system can distinguish the owner from another unauthenticated visitor who has the link. Treat the URL as shareable, and do not use it as an authentication secret.

## Data migration and roles

The previous prototype's `localStorage` sample/demo records are intentionally not imported. New accounts start with an empty wishlist; example.com samples have been removed. Authentication, wishlist items, contacts, and birthdays persist in Supabase across sign-out and reload. Personal insights are account-scoped, not community analytics. Admin permissions are not granted client-side; production admin access must be provisioned and enforced by a trusted server.
