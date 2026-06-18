import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Free, rule-based meta generation. No API key, no external calls.
const TITLE_MIN = 50, TITLE_MAX = 60, DESC_MIN = 150, DESC_MAX = 160;

const TYPE_WORD = {
  products: "product",
  collections: "collection",
  pages: "page",
  articles: "article",
};

function clean(s) {
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function trimWords(s, max) {
  if (s.length <= max) return s;
  let t = s.slice(0, max);
  const i = t.lastIndexOf(" ");
  if (i > max * 0.6) t = t.slice(0, i);
  return t.trim().replace(/[\s,;:.\-–|]+$/, "");
}

function makeTitle(title, store) {
  const base = clean(title);
  if (base.length >= TITLE_MIN && base.length <= TITLE_MAX) return base;
  if (base.length > TITLE_MAX) return trimWords(base, TITLE_MAX);

  const tails = store
    ? [` | ${store}`, ` – Shop ${store}`, ` | ${store} Online Store`, ` – Buy Online at ${store}`]
    : [` | Shop Online`, ` – Buy Online Today`, ` | Free Shipping & Returns`];

  let best = base;
  for (const t of tails) {
    const cand = base + t;
    if (cand.length <= TITLE_MAX) {
      if (cand.length >= TITLE_MIN) return cand;
      if (cand.length > best.length) best = cand;
    }
  }
  return best;
}

function makeDesc(context, title, store, typeWord) {
  let text = clean(context);
  if (!text) {
    text = `Discover ${clean(title)}${store ? ` at ${store}` : ""}.`;
  }
  if (text.length > DESC_MAX) return trimWords(text, DESC_MAX);

  const fillers = [
    store ? `Shop this ${typeWord} at ${store} today.` : `Shop this ${typeWord} today.`,
    `Enjoy quality you can trust, fast shipping and easy returns.`,
    `Browse the full range and order online now.`,
    store ? `${store} — great value, every day.` : `Great value, every day.`,
  ];

  let out = text;
  for (const f of fillers) {
    if (out.length >= DESC_MIN) break;
    const add = (out.endsWith(".") ? " " : ". ") + f;
    if ((out + add).length <= DESC_MAX) out += add;
  }
  if (out.length > DESC_MAX) out = trimWords(out, DESC_MAX);
  return out;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, title, context, store } = body || {};
  const typeWord = TYPE_WORD[type] || "page";

  const metaTitle = makeTitle(title || "", store || "");
  const metaDescription = makeDesc(context || "", title || "", store || "", typeWord);

  return NextResponse.json({ metaTitle, metaDescription });
}
