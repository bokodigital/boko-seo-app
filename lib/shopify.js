// Server-only Shopify Admin GraphQL helper.
// Uses the per-merchant shop + access token from the OAuth session.

export async function adminGraphQL(shop, token, query, variables = {}) {
  if (!shop || !token) {
    throw new Error("Not connected to a Shopify store.");
  }
  const version = process.env.SHOPIFY_API_VERSION || "2025-01";
  const res = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
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

/**
 * Same call, but also hands back Shopify's query-cost / throttle state so a
 * long scan can pace itself instead of getting rate-limited mid-way.
 * Returns { data, cost } where cost.throttleStatus = { maximumAvailable,
 * currentlyAvailable, restoreRate }.
 */
export async function adminGraphQLWithCost(shop, token, query, variables = {}) {
  if (!shop || !token) {
    throw new Error("Not connected to a Shopify store.");
  }
  const version = process.env.SHOPIFY_API_VERSION || "2025-01";
  const res = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
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
  return { data: json.data, cost: (json.extensions && json.extensions.cost) || null };
}

/** Wait until the leaky bucket has at least `need` points available. */
export async function awaitThrottle(cost, need) {
  const t = cost && cost.throttleStatus;
  if (!t) return;
  const available = Number(t.currentlyAvailable) || 0;
  if (available >= need) return;
  const rate = Number(t.restoreRate) || 50;
  const waitMs = Math.min(10000, Math.ceil(((need - available) / rate) * 1000) + 250);
  await new Promise((r) => setTimeout(r, waitMs));
}
