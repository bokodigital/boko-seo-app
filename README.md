# Boko — Shopify SEO Meta Studio

A Next.js app that generates **Google best-practice meta titles & descriptions** for your Shopify
**products, collections, pages and blog posts**, lets you review/edit them, and imports them back to
your store with one click (or **Import all**). Styled to the Boko brand (Poppins + Electric Lime).

It connects to **one store** through a Shopify **Admin API access token** (a custom app) — no OAuth,
no Partner account. Switching stores = change two environment variables and redeploy.

---

## What you need

1. A Shopify store you're an admin on.
2. An **Anthropic API key** (for the AI generation): https://console.anthropic.com/
3. Free **GitHub** and **Vercel** accounts.

---

## Step 1 — Create the Shopify Admin API token

1. In your Shopify admin, go to **Settings → Apps and sales channels → Develop apps**.
2. Click **Create an app** → name it e.g. `Boko SEO Studio` → **Create app**.
3. Open **Configuration → Admin API integration → Configure** and enable these scopes:
   - `read_products`, `write_products`
   - `read_content`, `write_content`
   - `read_online_store_pages`, `write_online_store_pages`
4. **Save**, then go to **API credentials → Install app**.
5. Copy the **Admin API access token** (starts with `shpat_`). You only see it once.
6. Note your store domain, e.g. `your-store.myshopify.com`.

## Step 2 — (Optional) run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```
Open http://localhost:3000

## Step 3 — Push to GitHub

```bash
git init
git add .
git commit -m "Boko Shopify SEO Meta Studio"
git branch -M main
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/boko-seo-app.git
git push -u origin main
```

## Step 4 — Deploy on Vercel

1. Go to https://vercel.com/new and **Import** the GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Leave build settings default.
3. Add **Environment Variables** (from `.env.example`):
   - `SHOPIFY_STORE_DOMAIN` = `your-store.myshopify.com`
   - `SHOPIFY_ADMIN_TOKEN` = `shpat_...`
   - `SHOPIFY_API_VERSION` = `2025-01`
   - `ANTHROPIC_API_KEY` = `sk-ant-...`
   - `ANTHROPIC_MODEL` = `claude-3-5-haiku-latest` (optional)
   - `APP_PASSWORD` = a password (optional — gates the app)
4. Click **Deploy**. Your app will be live at `https://<project>.vercel.app`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | yes | e.g. `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | yes | Admin API access token (`shpat_…`) |
| `SHOPIFY_API_VERSION` | no | Defaults to `2025-01` |
| `ANTHROPIC_API_KEY` | yes | For meta generation |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-3-5-haiku-latest` |
| `APP_PASSWORD` | no | If set, the app asks for this password and sends it as the `x-app-password` header |

## Switching stores

Change `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_TOKEN` in Vercel → **Settings → Environment Variables**,
then **Redeploy**. (One deployment serves one store. To run several stores at once, deploy the repo
multiple times as separate Vercel projects.)

## How meta is written back

- **Products** & **Collections** → native `seo { title description }` via `productUpdate` / `collectionUpdate`.
- **Pages** & **Blog articles** → `global.title_tag` / `global.description_tag` metafields via `pageUpdate` / `articleUpdate`.

## Security notes

- All tokens live only in server environment variables and are used only in server routes (`app/api/*`).
  They are never exposed to the browser.
- `APP_PASSWORD` is a light gate, not full auth. For sensitive stores, keep the Vercel deployment private
  or put it behind Vercel's password protection / SSO.

## Tech

Next.js 14 (App Router) · React 18 · Shopify Admin GraphQL API · Anthropic Messages API · Poppins via `next/font`.
