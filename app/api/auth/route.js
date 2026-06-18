import { NextResponse } from "next/server";
import crypto from "crypto";
import { normalizeShop, authUrl } from "@/lib/oauth";
import { STATE_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/auth?shop=my-store.myshopify.com  -> redirect to Shopify consent screen
export async function GET(request) {
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
    return NextResponse.json(
      { error: "App not configured: SHOPIFY_API_KEY / SHOPIFY_API_SECRET missing." },
      { status: 500 }
    );
  }
  const url = new URL(request.url);
  const shop = normalizeShop(url.searchParams.get("shop"));
  if (!shop) {
    return NextResponse.json({ error: "Invalid or missing shop domain." }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${url.origin}/api/auth/callback`;
  const res = NextResponse.redirect(authUrl(shop, state, redirectUri));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
