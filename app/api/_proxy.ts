import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

/**
 * Forwards /api/* requests to Flask, guarantees JSON back to the browser.
 * Prevents "Unexpected token '<'" by never bubbling upstream HTML.
 */
export async function proxy(req: NextRequest, method: "GET" | "POST") {
  const url = new URL(req.url);
  const target = `${BACKEND}${url.pathname}`; // keep same path on Flask

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;

  const init: RequestInit = { method, headers, credentials: "include" };

  if (method === "POST") {
    const bodyText = await req.text();
    init.body = bodyText && bodyText.trim().length ? bodyText : "{}";
  }

  const res = await fetch(target, init);
  const text = await res.text();

  // Force JSON response to the browser
  try {
    const json = text ? JSON.parse(text) : {};
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "upstream_non_json", status: res.status, body: text.slice(0, 200) },
      { status: res.ok ? 502 : res.status }
    );
  }
}