// Shopify OAuth helpers (public app, offline token).
import crypto from "crypto";

export function validShop(shop) {
  return typeof shop === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

// Accepts "my-store", "my-store.myshopify.com", or a full URL; returns the
// canonical "*.myshopify.com" domain, or null if it can't be normalised.
export function normalizeShop(input) {
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return validShop(s) ? s : null;
}

export function scopes() {
  return (
    process.env.SHOPIFY_SCOPES ||
    "read_products,write_products,read_content,write_content"
  );
}

export function authUrl(shop, state, redirectUri) {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY || "",
    scope: scopes(),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyHmac(searchParams) {
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const pairs = [];
  searchParams.forEach((v, k) => {
    if (k !== "hmac" && k !== "signature") pairs.push([k, v]);
  });
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const msg = pairs.map(([k, v]) => `${k}=${v}`).join("&");
  const digest = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const hmac = searchParams.get("hmac") || "";
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  } catch (e) {
    return false;
  }
}

export async function exchangeToken(shop, code) {
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) {
    throw new Error(d.error_description || d.error || "Token exchange failed");
  }
  return d.access_token;
}
