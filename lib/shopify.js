// Server-only Shopify Admin GraphQL helper.
// Uses a custom-app Admin API access token (no OAuth).

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

export function shopifyConfigured() {
  return Boolean(DOMAIN && TOKEN);
}

export async function adminGraphQL(query, variables = {}) {
  if (!shopifyConfigured()) {
    throw new Error(
      "Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN."
    );
  }
  const res = await fetch(
    `https://${DOMAIN}/admin/api/${VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    }
  );
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Shopify returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (json.errors) {
    throw new Error(
      typeof json.errors === "string" ? json.errors : JSON.stringify(json.errors)
    );
  }
  return json.data;
}

export function storeDomain() {
  return DOMAIN || "";
}
