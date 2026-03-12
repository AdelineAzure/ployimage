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
// This proxy supports DeerAPI image generation endpoints:
//   - /v1/chat/completions
//   - /v1/images/generations
//   - /v1beta/models/...:generateContent
//   - /mj/...
//
// Frontend uses X-Target-Path to choose upstream API path.
// ============================================================

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      // Image proxy mode for signed URLs and hotlink-restricted URLs.
      const imageUrl = request.headers.get("X-Image-Url") || url.searchParams.get("image_url");
      if (imageUrl) {
        if (method !== "GET") return json({ error: "Image proxy only supports GET" }, 405);

        let parsed;
        try {
          parsed = new URL(imageUrl);
        } catch {
          return json({ error: "Invalid image URL" }, 400);
        }
        if (!/^https?:$/.test(parsed.protocol)) {
          return json({ error: "Unsupported URL protocol" }, 400);
        }

        const imgResp = await fetch(parsed.toString(), { method: "GET", redirect: "follow" });
        const imgType = imgResp.headers.get("Content-Type") || "application/octet-stream";
        const imgData = await imgResp.arrayBuffer();

        return new Response(imgData, {
          status: imgResp.status,
          headers: {
            "Content-Type": imgType,
            ...corsHeaders(),
          },
        });
      }

      // Worker preview health check
      if (method === "GET" && url.pathname === "/" && !request.headers.get("X-Target-Path")) {
        return json({ ok: true, service: "deerapi-proxy", defaultUpstream: DEFAULT_UPSTREAM_BASE });
      }

      const targetPath = request.headers.get("X-Target-Path") || "/v1/chat/completions";
      const upstreamBase = resolveUpstreamBase(request.headers.get("X-Upstream-Base"));
      if (!upstreamBase) {
        return json({ error: "Invalid X-Upstream-Base" }, 400);
      }
      // Midjourney task polling uses GET (e.g. /mj/task/{id}/fetch).
      // Most other DeerAPI generation endpoints use POST.
      const isAllowedGetPath =
        /^\/mj\/task\/[^/]+\/fetch(?:\?.*)?$/.test(targetPath) ||
        /^\/replicate\/v1\/predictions\/[^/]+(?:\?.*)?$/.test(targetPath);
      if (method !== "POST" && !(method === "GET" && isAllowedGetPath)) {
        return json({ error: "Method not allowed" }, 405);
      }

      const body = method === "POST" ? await request.text() : undefined;

      const requestApiKey = (request.headers.get("X-Api-Key") || "").trim();
      const fallbackApiKey = (env.DEERAPI_KEY || "").trim();
      const apiKey = requestApiKey || fallbackApiKey;
      if (!apiKey) {
        return json({ error: "API key missing. Provide X-Api-Key or configure DEERAPI_KEY." }, 400);
      }

      const isGemini = targetPath.includes("/v1beta/");
      const authHeader = isGemini ? apiKey : `Bearer ${apiKey}`;

      const resp = await fetch(`${upstreamBase}${targetPath}`, {
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
    "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url, X-Upstream-Base, X-Api-Key",
  };
}

const DEFAULT_UPSTREAM_BASE = "https://api.deerapi.com";

function resolveUpstreamBase(value) {
  if (!value) return DEFAULT_UPSTREAM_BASE;
  try {
    const url = new URL(value);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
