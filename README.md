# Boko — Shopify SEO Meta Studio

A Next.js app that generates **Google best-practice meta titles & descriptions** for your Shopify
**products, collections, pages and blog posts**, lets you review/edit them, and imports them back to
your store with one click (or **Import all**). Styled to the Boko brand (Poppins + Electric Lime).

Any merchant **connects their own store** via Shopify OAuth — they enter their `*.myshopify.com`
domain, approve access on Shopify, and come straight back. The access token is stored only in an
encrypted, http-only session cookie (no database). Meta is generated with **free, rule-based logic**
— no AI key or paid API.

---

## What you need

1. A free **Shopify Partners** account: https://partners.shopify.com/
2. Free **GitHub** and **Vercel** accounts.

(No AI/API key required — generation is rule-based and free.)

---

## Step 1 — Create the Shopify app (Partners)

1. In the Partner dashboard: **Apps → Create app → Create app manually**. Name it `Boko SEO Studio`.
2. Copy the **Client ID** and **Client secret** (you'll set them as env vars).
3. You'll fill in the URLs in **Step 4** once you have your Vercel domain.

## Step 2 — Push to GitHub

Create an empty repo on github.com, then either upload the unzipped files via the web
(**Add file → Upload files**) or push from a terminal:

```bash
git init && git add . && git commit -m "Boko Shopify SEO Meta Studio"
git branch -M main
git remote add origin https://github.com/<you>/boko-seo-app.git
git push -u origin main
```

## Step 3 — Deploy on Vercel

1. https://vercel.com/new → **Import** the repo. Framework preset auto-detects **Next.js**.
2. Add **Environment Variables** (from `.env.example`):
   - `SHOPIFY_API_KEY` = your app's Client ID
   - `SHOPIFY_API_SECRET` = your app's Client secret
   - `SHOPIFY_SCOPES` = `read_products,write_products,read_content,write_content`
   - `SHOPIFY_API_VERSION` = `2025-01`
   - `SESSION_SECRET` = a long random string (`openssl rand -hex 32`)
   - `UPGRADE_URL` = *(optional)* where the free-tier **Upgrade** button links (defaults to `https://boko.com.au/ai-tools/seo-meta-studio-by-boko/`)
3. **Deploy.** Note your URL, e.g. `https://boko-seo-app.vercel.app`.

## Step 4 — Point the Shopify app at your Vercel URL

Back in the Partner app settings, set:

- **App URL**: `https://<your-app>.vercel.app`
- **Allowed redirection URL(s)**: `https://<your-app>.vercel.app/api/auth/callback`

Save. (If you change your domain later, update these two fields.)

## Step 5 — Connect a store

Open your Vercel URL. Enter a `*.myshopify.com` domain, click **Connect store**, approve on
Shopify, and you're in. Use **Disconnect / switch store** in the header to connect a different store.

> Installing on a store you don't own (e.g. a client's) while the app is unlisted requires either
> a collaborator/staff account on that store, or submitting the app for listing. For your own and
> dev stores, the flow above works immediately.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | yes | Partner app Client ID |
| `SHOPIFY_API_SECRET` | yes | Partner app Client secret |
| `SHOPIFY_SCOPES` | no | Defaults to products + content scopes |
| `SHOPIFY_API_VERSION` | no | Defaults to `2025-01` |
| `SESSION_SECRET` | yes | Encrypts the session cookie |

Meta generation is rule-based and needs no API key.

## How meta is written back

- **Products** & **Collections** → native `seo { title description }` via `productUpdate` / `collectionUpdate`.
- **Pages** & **Blog articles** → `global.title_tag` / `global.description_tag` metafields via `pageUpdate` / `articleUpdate`.

## Auth & security notes

- OAuth with **state nonce** (CSRF protection) and **HMAC verification** on the callback.
- The offline access token is stored only inside an **AES-256-GCM encrypted, http-only, secure cookie**
  — never exposed to the browser and never written to disk/DB.
- One browser session = one connected store. Disconnecting clears the cookie.

## Tech
---

## Image alt tags

The **Alt tags** tab scans the store for images that have **no alt text** and writes one for each.

- **What's scanned:** product images (all media on a product), collection images, and blog post
  featured images. Shopify pages have no image field in the Admin API, so they're not included.
- **How alt text is written:** free, rule-based — no AI key, no per-image cost. It combines the
  product/collection/article title with anything meaningful in the filename, and falls back to a
  positional descriptor ("– alternate view", "– side view") for second and third images. Junk
  filenames (`IMG_4821.JPG`, `DSC_0001`, hashes, dimensions, `@2x`) are ignored rather than repeated
  back at the reader. Alt text is capped at 125 characters.
- **When it can't guess:** if there's nothing usable in the title or the filename, the card is
  flagged *"please describe this image yourself"* and left blank rather than saving filler.
- **Review before saving:** every suggestion is editable. Save one at a time, or **Save all
  suggestions** for everything visible on the tab.
- **Big catalogues:** the scan is paced against Shopify's GraphQL cost limits and runs in batches.
  If the store is large you'll see a **Scan more images** button to pull the next batch.

Alt text is written back with `productUpdateMedia`, `collectionUpdate` and `articleUpdate` — all
covered by the existing `write_products` / `write_content` scopes, so **no re-authorisation is
needed** for stores already connected.

> If you bump `SHOPIFY_API_VERSION` past `2025-04`, `productUpdateMedia` is removed from the schema.
> The app automatically falls back to `fileUpdate`, which needs `write_files` added to
> `SHOPIFY_SCOPES` (and merchants to reconnect).

---

## Free tier & upgrades (10-item limit)

The Studio is free for the **first 10 items across all content types combined**
(pages, posts/articles, categories, products, product categories/collections).
Once a connected site has **more than 10 items**, everything beyond the first 10
is **locked**: those cards show an **Upgrade** button instead of Generate/Import,
and "Generate all" / "Fix issues" / "Import all" only act on the free items.

The limit is enforced both in the UI and on the server (`/api/generate`,
`/api/import` and `/api/alt` return **HTTP 402** for locked items), so it can't be
bypassed by the buttons alone.

Image alt tags have their **own separate allowance of 10 images** — a store has far
more images than pages, so counting them in the same pool would exhaust the free
tier instantly. `/api/images` carries the running count across "Scan more" batches
via the `loaded` query param, so the allowance isn't handed out again per batch.

- **Where the count is decided:** `/api/items` (meta) and `/api/images` (alt tags)
  tag each item `locked` in a fixed order and return a `gate` object
  (`{ total, freeLimit, locked, lockedCount, upgradeUrl }`).
- **Change the free limit:** edit `FREE_LIMIT` in `lib/gate.js`.
- **Where "Upgrade" links to:** set the optional env var **`UPGRADE_URL`**
  (defaults to `https://boko.com.au/ai-tools/seo-meta-studio-by-boko/`). Point it at your Boko upgrade /
  checkout / enquiry page.
---

