import { NextResponse } from "next/server";
import { adminGraphQL } from "@/lib/shopify";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE = 250; // Shopify max per page
const MAX_PAGES = 40; // safety cap (~10k items per type)

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function mkItem(type, node, opts) {
  return {
    type,
    id: node.id,
    title: node.title || "(untitled)",
    handle: node.handle || "",
    blogTitle: opts.blogTitle || null,
    context: opts.context || "",
    curTitle: (opts.cur && opts.cur.title) || "",
    curDesc: (opts.cur && opts.cur.description) || "",
  };
}

// Generic cursor pagination over a top-level connection.
async function fetchAll(shop, token, field, nodeFields) {
  const out = [];
  let after = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const query = `query($cursor: String) {
      ${field}(first: ${PAGE}, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
        edges { node { ${nodeFields} } }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const d = await adminGraphQL(shop, token, query, { cursor: after });
    const conn = d[field];
    (conn.edges || []).forEach((e) => out.push(e.node));
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

// Pages have no sortKey arg.
async function fetchAllPages(shop, token) {
  const out = [];
  let after = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const query = `query($cursor: String) {
      pages(first: ${PAGE}, after: $cursor) {
        edges { node { id title handle bodySummary
          metaTitle: metafield(namespace: "global", key: "title_tag") { value }
          metaDesc: metafield(namespace: "global", key: "description_tag") { value }
        } }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const d = await adminGraphQL(shop, token, query, { cursor: after });
    const conn = d.pages;
    (conn.edges || []).forEach((e) => out.push(e.node));
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

// Articles across all blogs (paginate articles within each blog).
async function fetchAllArticles(shop, token) {
  const articles = [];
  let blogAfter = null;
  for (let b = 0; b < MAX_PAGES; b++) {
    const blogQuery = `query($cursor: String) {
      blogs(first: 50, after: $cursor) {
        edges { node { id title } }
        pageInfo { hasNextPage endCursor }
      }
    }`;
    const bd = await adminGraphQL(shop, token, blogQuery, { cursor: blogAfter });
    const blogs = bd.blogs.edges || [];
    for (const be of blogs) {
      const blogId = be.node.id;
      const blogTitle = be.node.title;
      let artAfter = null;
      for (let a = 0; a < MAX_PAGES; a++) {
        const artQuery = `query($id: ID!, $cursor: String) {
          blog(id: $id) {
            articles(first: ${PAGE}, after: $cursor) {
              edges { node { id title handle summary
                metaTitle: metafield(namespace: "global", key: "title_tag") { value }
                metaDesc: metafield(namespace: "global", key: "description_tag") { value }
              } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`;
        const ad = await adminGraphQL(shop, token, artQuery, { id: blogId, cursor: artAfter });
        const conn = ad.blog && ad.blog.articles;
        if (!conn) break;
        (conn.edges || []).forEach((e) => articles.push({ node: e.node, blogTitle }));
        if (!conn.pageInfo.hasNextPage) break;
        artAfter = conn.pageInfo.endCursor;
      }
    }
    if (!bd.blogs.pageInfo.hasNextPage) break;
    blogAfter = bd.blogs.pageInfo.endCursor;
  }
  return articles;
}

export async function GET(request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }
  const { shop, token } = session;
  try {
    const shopData = await adminGraphQL(shop, token, `query { shop { name } }`);
    const [prodNodes, collNodes, pageNodes, articleRows] = await Promise.all([
      fetchAll(shop, token, "products", "id title handle descriptionHtml seo { title description }"),
      fetchAll(shop, token, "collections", "id title handle descriptionHtml seo { title description }"),
      fetchAllPages(shop, token),
      fetchAllArticles(shop, token),
    ]);

    const products = prodNodes.map((n) =>
      mkItem("products", n, { cur: n.seo, context: stripHtml(n.descriptionHtml) })
    );
    const collections = collNodes.map((n) =>
      mkItem("collections", n, { cur: n.seo, context: stripHtml(n.descriptionHtml) })
    );
    const pages = pageNodes.map((n) =>
      mkItem("pages", n, {
        cur: { title: n.metaTitle && n.metaTitle.value, description: n.metaDesc && n.metaDesc.value },
        context: stripHtml(n.bodySummary),
      })
    );
    const articles = articleRows.map((r) =>
      mkItem("articles", r.node, {
        cur: { title: r.node.metaTitle && r.node.metaTitle.value, description: r.node.metaDesc && r.node.metaDesc.value },
        context: stripHtml(r.node.summary),
        blogTitle: r.blogTitle,
      })
    );

    return NextResponse.json({
      connected: true,
      store: { name: (shopData.shop && shopData.shop.name) || "", domain: shop },
      products,
      collections,
      pages,
      articles,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
