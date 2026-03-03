// ============================================================
// Cloudflare Worker — DeerAPI Multi-Model Image Gen Proxy
// ============================================================
// DEPLOYMENT:
//   1. Go to https://dash.cloudflare.com → Workers & Pages → Create
//   2. Paste this code into the editor
//   3. Go to Settings → Variables → Add:
//      - Name: DEERAPI_KEY
//      - Value: your DeerAPI key (sk-...)
//      - Check "Encrypt"
//   4. Deploy
//   5. Copy the worker URL (e.g. https://imgproxy.YOUR.workers.dev)
//      and paste it into the app's Settings panel (⚙)
// ============================================================
// 
// This proxy supports ALL DeerAPI image generation endpoints:
//   - /v1/chat/completions    (gpt-4o-image, gpt-5-image, etc.)
//   - /v1/images/generations  (gpt-image-1, seedream, etc.)
//   - /v1beta/models/...:generateContent  (Gemini image models)
//
// The frontend specifies which path to use via X-Target-Path header.
// Auth format differs: Gemini uses plain key, others use Bearer token.
// ============================================================

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();

    // ── CORS Preflight ──
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // ── Allow only GET / POST for application logic ──
    if (method !== "POST" && method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    // ── Validate Key ──
    if (!env.DEERAPI_KEY) {
      return json({ error: "DEERAPI_KEY not configured in Worker environment" }, 500);
    }

    try {
      // Read target API path from header (sent by frontend)
      const targetPath = request.headers.get("X-Target-Path") || "/v1/chat/completions";
      const body = method === "POST" ? await request.text() : undefined;

      // Gemini endpoints use plain key auth; OpenAI-compatible use Bearer
      const isGemini = targetPath.includes("/v1beta/");
      const authHeader = isGemini ? env.DEERAPI_KEY : `Bearer ${env.DEERAPI_KEY}`;

      const resp = await fetch(`https://api.deerapi.com${targetPath}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body,
      });

      const data = await resp.text();

      return new Response(data, {
        status: resp.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Target-Path",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
