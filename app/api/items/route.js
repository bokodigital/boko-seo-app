import { NextResponse } from "next/server";
import { adminGraphQL, storeDomain } from "@/lib/shopify";
import { checkAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const LOAD_QUERY = `query Load {
  shop { name }
  products(first: 50, sortKey: UPDATED_AT, reverse: true) {
    edges { node { id title handle descriptionHtml seo { title description } } }
  }
  collections(first: 50, sortKey: UPDATED_AT, reverse: true) {
    edges { node { id title handle descriptionHtml seo { title description } } }
  }
  pages(first: 50) {
    edges { node { id title handle bodySummary
      metaTitle: metafield(namespace: "global", key: "title_tag") { value }
      metaDesc: metafield(namespace: "global", key: "description_tag") { value }
    } }
  }
  blogs(first: 20) {
    edges { node { id title articles(first: 50) { edges { node { id title handle summary
      metaTitle: metafield(namespace: "global", key: "title_tag") { value }
      metaDesc: metafield(namespace: "global", key: "description_tag") { value }
    } } } } }
  }
}`;

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

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const d = await adminGraphQL(LOAD_QUERY);
    const products = (d.products.edges || []).map((e) =>
      mkItem("products", e.node, { cur: e.node.seo, context: stripHtml(e.node.descriptionHtml) })
    );
    const collections = (d.collections.edges || []).map((e) =>
      mkItem("collections", e.node, { cur: e.node.seo, context: stripHtml(e.node.descriptionHtml) })
    );
    const pages = (d.pages.edges || []).map((e) =>
      mkItem("pages", e.node, {
        cur: {
          title: e.node.metaTitle && e.node.metaTitle.value,
          description: e.node.metaDesc && e.node.metaDesc.value,
        },
        context: stripHtml(e.node.bodySummary),
      })
    );
    const articles = [];
    (d.blogs.edges || []).forEach((be) => {
      const blogTitle = be.node.title;
      (be.node.articles.edges || []).forEach((ae) => {
        articles.push(
          mkItem("articles", ae.node, {
            cur: {
              title: ae.node.metaTitle && ae.node.metaTitle.value,
              description: ae.node.metaDesc && ae.node.metaDesc.value,
            },
            context: stripHtml(ae.node.summary),
            blogTitle,
          })
        );
      });
    });

    return NextResponse.json({
      store: { name: (d.shop && d.shop.name) || "", domain: storeDomain() },
      products,
      collections,
      pages,
      articles,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
