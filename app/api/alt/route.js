import { NextResponse } from "next/server";
import { FREE_LIMIT, upgradeUrl } from "@/lib/gate";
import { adminGraphQL } from "@/lib/shopify";
import { getSession } from "@/lib/session";
import { ALT_MAX } from "@/lib/alt-text";

export const dynamic = "force-dynamic";

/* Product media. Available on write_products — no extra scope needed. */
const PRODUCT_MEDIA_MUT = `mutation($productId: ID!, $media: [UpdateMediaInput!]!) {
  productUpdateMedia(productId: $productId, media: $media) {
    media { ... on MediaImage { id alt } }
    mediaUserErrors { field message }
  }
}`;

/* Fallback for API versions where productUpdateMedia has been removed.
   Note: fileUpdate needs the write_files scope. */
const FILE_UPDATE_MUT = `mutation($files: [FileUpdateInput!]!) {
  fileUpdate(files: $files) {
    files { ... on MediaImage { id alt } }
    userErrors { field message }
  }
}`;

const COLLECTION_MUT = `mutation($input: CollectionInput!) {
  collectionUpdate(input: $input) {
    collection { id }
    userErrors { field message }
  }
}`;

const ARTICLE_MUT = `mutation($id: ID!, $article: ArticleUpdateInput!) {
  articleUpdate(id: $id, article: $article) {
    article { id }
    userErrors { field message }
  }
}`;

function errsFrom(data, path) {
  const node = data && data[path];
  if (!node) return [`Shopify returned no result for ${path}.`];
  const ue = node.userErrors || node.mediaUserErrors || [];
  return ue.map((x) => x.message).filter(Boolean);
}

/** productUpdateMedia was removed in newer API versions; fall back to fileUpdate. */
function missingMutation(e) {
  const m = String((e && e.message) || "");
  return /doesn't exist on type|Field 'productUpdateMedia'|undefinedField/i.test(m);
}

async function updateProductImage(shop, token, { ownerId, mediaId, alt }) {
  try {
    const data = await adminGraphQL(shop, token, PRODUCT_MEDIA_MUT, {
      productId: ownerId,
      media: [{ id: mediaId, alt }],
    });
    return errsFrom(data, "productUpdateMedia");
  } catch (e) {
    if (!missingMutation(e)) throw e;
    const data = await adminGraphQL(shop, token, FILE_UPDATE_MUT, {
      files: [{ id: mediaId, alt }],
    });
    return errsFrom(data, "fileUpdate");
  }
}

async function updateCollectionImage(shop, token, { ownerId, imageId, alt }) {
  const image = imageId ? { id: imageId, altText: alt } : { altText: alt };
  const data = await adminGraphQL(shop, token, COLLECTION_MUT, {
    input: { id: ownerId, image },
  });
  return errsFrom(data, "collectionUpdate");
}

async function updateArticleImage(shop, token, { ownerId, alt }) {
  const data = await adminGraphQL(shop, token, ARTICLE_MUT, {
    id: ownerId,
    article: { image: { altText: alt } },
  });
  return errsFrom(data, "articleUpdate");
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

  const { kind, ownerId, mediaId, imageId, locked } = body || {};
  const alt = String((body && body.alt) || "").replace(/\s+/g, " ").trim();

  if (locked) {
    return NextResponse.json(
      {
        error: `Your free plan covers the first ${FREE_LIMIT} images. Upgrade with Boko to fix the rest.`,
        upgradeUrl: upgradeUrl(),
      },
      { status: 402 }
    );
  }
  if (!kind || !ownerId) {
    return NextResponse.json({ error: "kind and ownerId are required." }, { status: 400 });
  }
  if (!alt) {
    return NextResponse.json({ error: "Alt text can't be empty." }, { status: 400 });
  }
  if (alt.length > ALT_MAX) {
    return NextResponse.json(
      { error: `Alt text must be ${ALT_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  const { shop, token } = session;
  try {
    let errors;
    if (kind === "productImage") {
      if (!mediaId) {
        return NextResponse.json({ error: "mediaId is required for product images." }, { status: 400 });
      }
      errors = await updateProductImage(shop, token, { ownerId, mediaId, alt });
    } else if (kind === "collectionImage") {
      errors = await updateCollectionImage(shop, token, { ownerId, imageId, alt });
    } else if (kind === "articleImage") {
      errors = await updateArticleImage(shop, token, { ownerId, alt });
    } else {
      return NextResponse.json({ error: `Unknown image kind: ${kind}` }, { status: 400 });
    }

    if (errors && errors.length) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 422 });
    }
    return NextResponse.json({ ok: true, alt });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
