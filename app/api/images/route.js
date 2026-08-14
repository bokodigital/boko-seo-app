import { NextResponse } from "next/server";
import { adminGraphQLWithCost, awaitThrottle } from "@/lib/shopify";
import { getSession } from "@/lib/session";
import { applyGate } from "@/lib/gate";
import { verifyLicense } from "@/lib/license";
import { entitlementFromToken } from "@/lib/entitlement";
import { getAccountSession } from "@/lib/account-session";
import { suggestAlt } from "@/lib/alt-text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Shopify caps a single query at 1000 cost points, so these are sized to stay
// comfortably under that. See the cost notes next to each query below.
const PRODUCT_BATCH = 30; // products per GraphQL call
const MEDIA_PER_PRODUCT = 12; // images inspected per product
const PRODUCT_QUERY_COST = 850; // conservative estimate, used for throttle waits

// Stop scanning and hand a cursor back to the client before the serverless
// function times out. The UI shows a "Scan more images" button.
const TIME_BUDGET_MS = 42000;

function thumb(url, px = 260) {
  if (!url) return "";
  return url + (url.includes("?") ? "&" : "?") + `width=${px}`;
}

function fileName(url) {
  if (!url) return "";
  return (url.split(/[?#]/)[0].split("/").pop() || "").trim();
}

function isBlank(s) {
  return !s || !String(s).trim();
}

/* ------------------------------ product images ------------------------------ */

// Cost ≈ 2 + 30 × (1 + (2 + 12 × 2)) = 812
const PRODUCTS_QUERY = `query($cursor: String) {
  products(first: ${PRODUCT_BATCH}, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
    edges {
      node {
        id
        title
        handle
        media(first: ${MEDIA_PER_PRODUCT}) {
          edges { node { ... on MediaImage { id alt image { url } } } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

function productImages(nodes) {
  const out = [];
  for (const p of nodes) {
    const edges = (p.media && p.media.edges) || [];
    // Index over images only, so "alternate view" numbering ignores videos.
    let index = 0;
    for (const e of edges) {
      const m = e.node;
      if (!m || !m.id || !m.image || !m.image.url) continue; // videos / 3D models
      const i = index++;
      if (!isBlank(m.alt)) continue; // already has alt text
      const url = m.image.url;
      const s = suggestAlt({
        ownerTitle: p.title,
        filename: url,
        index: i,
        kind: "product",
      });
      out.push({
        key: m.id,
        kind: "productImage",
        ownerId: p.id,
        ownerTitle: p.title || "(untitled product)",
        ownerHandle: p.handle || "",
        ownerLabel: "Product",
        mediaId: m.id,
        url,
        thumb: thumb(url),
        filename: fileName(url),
        index: i,
        suggested: s.alt,
        needsManual: s.needsManual,
      });
    }
  }
  return out;
}

/* ---------------------------- collection images ---------------------------- */

// Cost ≈ 2 + 100 × 2 = 202
const COLLECTIONS_QUERY = `query($cursor: String) {
  collections(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
    edges { node { id title handle image { id url altText } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

function collectionImages(nodes) {
  const out = [];
  for (const c of nodes) {
    const img = c.image;
    if (!img || !img.url) continue;
    if (!isBlank(img.altText)) continue;
    const s = suggestAlt({
      ownerTitle: c.title,
      filename: img.url,
      index: 0,
      kind: "collection",
    });
    out.push({
      key: `collection:${c.id}`,
      kind: "collectionImage",
      ownerId: c.id,
      ownerTitle: c.title || "(untitled collection)",
      ownerHandle: c.handle || "",
      ownerLabel: "Collection",
      imageId: img.id || null,
      url: img.url,
      thumb: thumb(img.url),
      filename: fileName(img.url),
      index: 0,
      suggested: s.alt,
      needsManual: s.needsManual,
    });
  }
  return out;
}

/* ------------------------------ article images ------------------------------ */

// Cost ≈ 2 + 10 × (1 + (2 + 25 × 2)) = 532
const ARTICLES_QUERY = `query {
  blogs(first: 10) {
    edges {
      node {
        id
        title
        articles(first: 25, sortKey: UPDATED_AT, reverse: true) {
          edges { node { id title handle image { url altText } } }
        }
      }
    }
  }
}`;

function articleImages(blogEdges) {
  const out = [];
  for (const be of blogEdges || []) {
    const blog = be.node;
    for (const ae of (blog.articles && blog.articles.edges) || []) {
      const a = ae.node;
      const img = a.image;
      if (!img || !img.url) continue;
      if (!isBlank(img.altText)) continue;
      const s = suggestAlt({
        ownerTitle: a.title,
        filename: img.url,
        index: 0,
        kind: "article",
      });
      out.push({
        key: `article:${a.id}`,
        kind: "articleImage",
        ownerId: a.id,
        ownerTitle: a.title || "(untitled article)",
        ownerHandle: a.handle || "",
        ownerLabel: blog.title ? `Blog · ${blog.title}` : "Blog post",
        url: img.url,
        thumb: thumb(img.url),
        filename: fileName(img.url),
        index: 0,
        suggested: s.alt,
        needsManual: s.needsManual,
      });
    }
  }
  return out;
}

/* ---------------------------------- handler --------------------------------- */

export async function GET(request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }
  const { shop, token } = session;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  // How many images the client already holds, so the free allowance carries
  // across "scan more" requests instead of resetting on each page.
  const alreadyLoaded = Math.max(0, parseInt(url.searchParams.get("loaded") || "0", 10) || 0);
  const started = Date.now();

  try {
    const images = [];
    let scannedProducts = 0;

    // Collections and blog posts are a small, fixed slice — scan them once, on
    // the first request only. Follow-up "scan more" calls are products only.
    if (!cursor) {
      let collCursor = null;
      for (let i = 0; i < 5; i++) {
        const { data, cost } = await adminGraphQLWithCost(shop, token, COLLECTIONS_QUERY, {
          cursor: collCursor,
        });
        const conn = data.collections;
        images.push(...collectionImages((conn.edges || []).map((e) => e.node)));
        if (!conn.pageInfo.hasNextPage) break;
        collCursor = conn.pageInfo.endCursor;
        await awaitThrottle(cost, 250);
      }

      try {
        const { data } = await adminGraphQLWithCost(shop, token, ARTICLES_QUERY);
        images.push(...articleImages(data.blogs && data.blogs.edges));
      } catch (e) {
        // A store with no blog, or without read_content, shouldn't kill the scan.
        console.error("Article image scan skipped:", e && e.message);
      }
    }

    // Products: the bulk of the work. Keep going until the store runs out, the
    // time budget is spent, or we'd risk a timeout.
    let after = cursor;
    let hasNextPage = true;
    while (hasNextPage) {
      const { data, cost } = await adminGraphQLWithCost(shop, token, PRODUCTS_QUERY, {
        cursor: after,
      });
      const conn = data.products;
      const nodes = (conn.edges || []).map((e) => e.node);
      scannedProducts += nodes.length;
      images.push(...productImages(nodes));
      hasNextPage = conn.pageInfo.hasNextPage;
      after = conn.pageInfo.endCursor;

      if (!hasNextPage) break;
      if (Date.now() - started > TIME_BUDGET_MS) break;
      await awaitThrottle(cost, PRODUCT_QUERY_COST);
      if (Date.now() - started > TIME_BUDGET_MS) break;
    }

    const account = getAccountSession(request);
    const entitlement = entitlementFromToken(account && account.bokoToken);
    const member = verifyLicense(session.license, shop);
    const gate = applyGate([images], { member, entitlement, startAt: alreadyLoaded });

    return NextResponse.json({
      connected: true,
      images,
      scannedProducts,
      nextCursor: hasNextPage ? after : null,
      gate,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
