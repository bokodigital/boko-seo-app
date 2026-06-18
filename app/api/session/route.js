import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const s = getSession(request);
  const configured = Boolean(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET);
  if (!s) return NextResponse.json({ connected: false, configured });
  return NextResponse.json({ connected: true, configured, shop: s.shop });
}
