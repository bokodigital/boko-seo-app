import { NextResponse } from "next/server";
import { getSession, encryptSession, SESSION_COOKIE } from "@/lib/session";
import { verifyLicense } from "@/lib/license";

export const dynamic = "force-dynamic";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

// GET -> { active } for the currently connected store.
export async function GET(request) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ active: false }, { status: 401 });
  return NextResponse.json({ active: verifyLicense(session.license, session.shop) });
}

// POST { key } -> verify against the connected store; if valid, store it in the
// session so every future request is unlocked.
export async function POST(request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Connect a store first." }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const key = (body.key || "").trim();
  if (!verifyLicense(key, session.shop)) {
    return NextResponse.json(
      { active: false, error: "That licence key isn't valid for this store." },
      { status: 400 }
    );
  }
  const res = NextResponse.json({ active: true });
  res.cookies.set(SESSION_COOKIE, encryptSession({ ...session, license: key }), COOKIE_OPTS);
  return res;
}
