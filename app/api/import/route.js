import { NextResponse } from "next/server";
import { FREE_LIMIT, upgradeUrl } from "@/lib/gate";
import { adminGraphQL } from "@/lib/shopify";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const PROD_MUT = `mutation P($input: ProductInput!){ productUpdate(input:$input){ product{ id } userErrors{ field message } } }`;
const COLL_MUT = `mutation C($input: CollectionInput!){ collectionUpdate(input:$input){ collection{ id } userErrors{ field message } } }`;
const PAGE_MUT = `mutation Pg($id: ID!, $page: PageUpdateInput!){ pageUpdate(id:$id, page:$page){ page{ id } userErrors{ field message } } }`;
const ART_MUT  = `mutation Ar($id: ID!, $article: ArticleUpdateInput!){ articleUpdate(id:$id, article:$article){ article{ id } userErrors{ field message } } }`;

function build(type, id, title, desc) {
  if (type === "products") {
    return { query: PROD_MUT, variables: { input: { id, seo: { title, description: desc } } }, path: "productUpdate" };
  }
  if (type === "collections") {
    return { query: COLL_MUT, variables: { input: { id, seo: { title, description: desc } } }, path: "collectionUpdate" };
  }
  const metafields = [
    { namespace: "global", key: "title_tag", value: title, type: "single_line_text_field" },
    { namespace: "global", key: "description_tag", value: desc, type: "multi_line_text_field" },
  ];
  if (type === "pages") {
    return { query: PAGE_MUT, variables: { id, page: { metafields } }, path: "pageUpdate" };
  }
  if (type === "articles") {
    return { query: ART_MUT, variables: { id, article: { metafields } }, path: "articleUpdate" };
  }
  return null;
}

export async function POST(request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not connected to a store." }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { type, id, metaTitle, metaDescription, locked } = body || {};

  // Free-tier gate: items beyond the free first-100 are locked.
  if (locked) {
    return NextResponse.json(
      {
        error: `Your free plan covers the first ${FREE_LIMIT} items. Upgrade with Boko to optimise the rest.`,
        upgradeUrl: upgradeUrl(),
      },
      { status: 402 }
    );
  }
  if (!type || !id || !metaTitle) {
    return NextResponse.json({ error: "type, id and metaTitle are required." }, { status: 400 });
  }
  const m = build(type, id, metaTitle, metaDescription || "");
  if (!m) {
    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }
  try {
    const data = await adminGraphQL(session.shop, session.token, m.query, m.variables);
    const ue = data[m.path] && data[m.path].userErrors;
    if (ue && ue.length) {
      return NextResponse.json({ error: ue.map((x) => x.message).join("; ") }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
