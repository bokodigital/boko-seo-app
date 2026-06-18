import { NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TITLE_MIN = 50, TITLE_MAX = 60, DESC_MIN = 150, DESC_MAX = 160;

const TYPE_LABEL = {
  products: "product",
  collections: "product collection",
  pages: "web page",
  articles: "blog article",
};

function extractJson(raw) {
  let s = String(raw || "").replace(/```json/gi, "```").replace(/```/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch (e) {}
  }
  return null;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set." },
      { status: 500 }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, title, handle, context, store } = body || {};
  const typeLabel = TYPE_LABEL[type] || "page";
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";

  const prompt =
    `You are an expert SEO copywriter writing for the Shopify store "${store || "this store"}".\n` +
    `Write search-optimised meta tags for the ${typeLabel} below.\n\n` +
    `RULES (follow exactly):\n` +
    `- metaTitle: ${TITLE_MIN}-${TITLE_MAX} characters. Lead with the primary keyword. Natural, compelling.\n` +
    `- metaDescription: ${DESC_MIN}-${DESC_MAX} characters. One or two sentences that summarise value and invite the click.\n` +
    `- Voice: clear, concise, active verbs, no jargon, no clickbait, no quotation marks.\n` +
    `- Do not exceed the character maximums.\n` +
    `Return ONLY valid JSON, no commentary: {"metaTitle":"...","metaDescription":"..."}\n\n` +
    `TITLE: ${title || ""}\n` +
    `HANDLE: ${handle || ""}\n` +
    `CONTENT: ${(context || "").slice(0, 1200)}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || `Anthropic error ${r.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const textOut =
      (data.content && data.content[0] && data.content[0].text) || "";
    const j = extractJson(textOut);
    if (!j || !j.metaTitle) {
      return NextResponse.json(
        { error: "Could not parse a suggestion from the model." },
        { status: 502 }
      );
    }
    return NextResponse.json({
      metaTitle: String(j.metaTitle).trim(),
      metaDescription: String(j.metaDescription || "").trim(),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
