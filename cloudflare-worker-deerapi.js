// ============================================================
// Cloudflare Worker — Multi-Platform Image Gen Proxy
// ============================================================
// DEPLOYMENT:
//   1. Go to https://dash.cloudflare.com → Workers & Pages → Create
//   2. Paste this code into the editor
//   3. Go to Settings → Variables → Add:
//      - Name: COMETAPI_KEY, DEERAPI_KEY or DASHSCOPE_API_KEY
//      - Value: your upstream API key
//      - Check "Encrypt"
//   4. Deploy
//   5. Copy the worker URL (e.g. https://imgproxy.YOUR.workers.dev)
//      and paste it into the app's Settings panel (⚙)
// ============================================================
//
// This proxy supports DeerAPI and Bailian endpoints:
//   - /v1/chat/completions
//   - /compatible-mode/v1/chat/completions
//   - /v1/images/generations
//   - /v1/images/edits
//   - /api/v1/services/aigc/multimodal-generation/generation
//   - /api/v1/services/aigc/image2image/image-synthesis
//   - /api/v1/tasks/{task_id}
//   - /v1beta/models/...:generateContent
//   - /mj/...
//
// Frontend uses X-Target-Path to choose upstream API path.
// Platform is inferred from X-Upstream-Base when X-Api-Platform is absent.
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
        return json({
          ok: true,
          service: "deerapi-proxy",
          version: WORKER_VERSION,
          features: [
            "dashscope-image2image",
            "dashscope-async-header",
            "dashscope-task-polling",
          ],
          defaultUpstream: DEFAULT_UPSTREAM_BASE,
        });
      }

      const targetPath = request.headers.get("X-Target-Path") || "/v1/chat/completions";
      const upstreamBase = resolveUpstreamBase(request.headers.get("X-Upstream-Base"));
      if (!upstreamBase) {
        return json({ error: "Invalid X-Upstream-Base" }, 400);
      }
      // Async task polling uses GET (e.g. DashScope /api/v1/tasks/{id}).
      // Most other generation endpoints use POST.
      const isAllowedGetPath =
        /^\/mj\/task\/[^/]+\/fetch(?:\?.*)?$/.test(targetPath) ||
        /^\/replicate\/v1\/predictions\/[^/]+(?:\?.*)?$/.test(targetPath) ||
        /^\/api\/v1\/tasks\/[^/?]+(?:\?.*)?$/.test(targetPath);
      if (method !== "POST" && !(method === "GET" && isAllowedGetPath)) {
        return json({ error: "Method not allowed" }, 405);
      }

      const incomingContentType = request.headers.get("Content-Type") || "";
      const dashScopeAsync = request.headers.get("X-DashScope-Async") || "";
      const body = method === "POST" ? await request.arrayBuffer() : undefined;

      const apiPlatform = normalizeApiPlatform(
        request.headers.get("X-Api-Platform") || inferApiPlatformFromBase(upstreamBase)
      );
      const requestApiKey = normalizeApiKey(request.headers.get("X-Api-Key") || "");
      const fallbackApiKey = getFallbackApiKey(env, apiPlatform);
      const apiKey = requestApiKey || fallbackApiKey;
      if (!apiKey) {
        const envName =
          apiPlatform === "bailian"
            ? "DASHSCOPE_API_KEY"
            : apiPlatform === "deerapi"
            ? "DEERAPI_KEY"
            : apiPlatform === "lumina"
            ? "LUMINA_API_KEY"
            : "COMETAPI_KEY";
        return json({ error: `API key missing. Provide X-Api-Key or configure ${envName}.` }, 400);
      }

      const isGemini = targetPath.includes("/v1beta/");
      const prefersBearer = apiPlatform === "bailian" || apiPlatform === "comet" || apiPlatform === "lumina" || !isGemini;
      const primaryAuth = prefersBearer ? `Bearer ${apiKey}` : apiKey;
      const fallbackAuth = prefersBearer ? apiKey : `Bearer ${apiKey}`;
      const baseHeaders = {
        ...(incomingContentType ? { "Content-Type": incomingContentType } : {}),
        ...(dashScopeAsync ? { "X-DashScope-Async": dashScopeAsync } : {}),
        "X-Api-Key": apiKey,
        "X-Goog-Api-Key": apiKey,
      };
      const forward = (authorization) =>
        fetch(`${upstreamBase}${targetPath}`, {
          method,
          headers: {
            ...baseHeaders,
            "Authorization": authorization,
          },
          body,
        });

      let resp = await forward(primaryAuth);
      let data = await resp.text();
      const authError = /auth|authorization|api.?key|bearer|x-goog-api-key|invalid key|token|密钥/i.test(data);
      if ([400, 401, 403].includes(resp.status) && authError && fallbackAuth !== primaryAuth) {
        const retry = await forward(fallbackAuth);
        const retryData = await retry.text();
        if (retry.ok || !resp.ok) {
          resp = retry;
          data = retryData;
        }
      }

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
    "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url, X-Upstream-Base, X-Api-Key, X-Api-Platform, X-DashScope-Async",
  };
}

const DEFAULT_UPSTREAM_BASE = "https://api.cometapi.com";
const WORKER_VERSION = "2026-05-13-wan21-upscale";

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  next = next.replace(/^authorization\s*:\s*/i, "").trim();
  next = next.replace(/^x-goog-api-key\s*:\s*/i, "").trim();
  next = next.replace(/^bearer\s+/i, "").trim();
  next = next.replace(/^["']+|["']+$/g, "").trim();
  return next;
}

function normalizeApiPlatform(value) {
  if (value === "bailian") return "bailian";
  if (value === "deerapi") return "deerapi";
  if (value === "comet") return "comet";
  if (value === "lumina") return "lumina";
  return "comet";
}

function inferApiPlatformFromBase(value) {
  if (/dashscope\.aliyuncs\.com/i.test(value || "")) return "bailian";
  if (/cometapi\.com/i.test(value || "")) return "comet";
  if (/deerapi\.com/i.test(value || "")) return "deerapi";
  if (/tripo3d\.com/i.test(value || "")) return "lumina";
  return "comet";
}

function getFallbackApiKey(env, apiPlatform) {
  if (apiPlatform === "bailian") {
    return normalizeApiKey(env.DASHSCOPE_API_KEY || env.BAILIAN_API_KEY || "");
  }
  if (apiPlatform === "deerapi") {
    return normalizeApiKey(env.DEERAPI_KEY || "");
  }
  if (apiPlatform === "lumina") {
    return normalizeApiKey(env.LUMINA_API_KEY || "");
  }
  return normalizeApiKey(env.COMETAPI_KEY || env.COMET_API_KEY || "");
}

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
