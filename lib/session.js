// Encrypted session cookie holding { shop, token } for the connected store.
import crypto from "crypto";

export const SESSION_COOKIE = "boko_session";
export const STATE_COOKIE = "boko_oauth_state";

function key() {
  const secret = process.env.SESSION_SECRET || "";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

export function encryptSession(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString("base64url");
}

export function decryptSession(str) {
  try {
    const buf = Buffer.from(str, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    const out = Buffer.concat([d.update(data), d.final()]).toString("utf8");
    return JSON.parse(out);
  } catch (e) {
    return null;
  }
}

// Read { shop, token } from a Next.js request, or null.
export function getSession(request) {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const s = decryptSession(raw);
  if (!s || !s.shop || !s.token) return null;
  return s;
}
