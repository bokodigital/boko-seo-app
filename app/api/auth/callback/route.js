import { NextResponse } from "next/server";
import { normalizeShop, verifyHmac, exchangeToken } from "@/lib/oauth";
import { encryptSession, SESSION_COOKIE, STATE_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/auth/callback?code=...&shop=...&state=...&hmac=...
export async function GET(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const shop = normalizeShop(params.get("shop"));
  const code = params.get("code");
  const state = params.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (!shop || !code) {
    return NextResponse.redirect(`${url.origin}/?error=invalid_callback`);
  }
  if (!verifyHmac(params)) {
    return NextResponse.redirect(`${url.origin}/?error=bad_hmac`);
  }
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${url.origin}/?error=bad_state`);
  }

  try {
    const token = await exchangeToken(shop, code);
    const session = encryptSession({ shop, token });
    const res = NextResponse.redirect(`${url.origin}/?connected=1`);
    res.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/?error=token_exchange`);
  }
}
