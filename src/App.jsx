import { useState, useRef, useCallback, useEffect } from "react";

// ─── DeerAPI Model Registry ───
// Each model has its own apiType defining which DeerAPI endpoint/format to use
const IMAGE_MODELS = [
  // Seedream — /v1/images/generations (豆包生图)
  { id: "doubao-seedream-4-0-250828", name: "Seedream 4.0", provider: "ByteDance", apiType: "images" },
  { id: "doubao-seedream-4-5-251128", name: "Seedream 4.5", provider: "ByteDance", apiType: "images", badge: "NEW" },
  // Midjourney via /mj
  { id: "midjourney-imagine", name: "Midjourney Imagine", provider: "Midjourney", apiType: "midjourney", badge: "BETA" },
  // GPT‑1.5 image — 依旧走 /v1/images/generations
  { id: "gpt-image-1.5", name: "GPT‑1.5 Image", provider: "OpenAI", apiType: "images", badge: "HOT" },
  // NanoBanana 系列：本质调用 Gemini 图像模型
  { id: "gemini-2.5-flash-image", name: "NanoBanana", provider: "Google", apiType: "gemini", badge: "HOT" },
  { id: "gemini-3-pro-image", name: "NanoBanana Pro", provider: "Google", apiType: "gemini", badge: "PRO" },
];

const PROVIDER_COLORS = {
  OpenAI: { bg: "#10a37f", text: "#fff" },
  Google: { bg: "#1a73e8", text: "#fff" },
  ByteDance: { bg: "#fe2c55", text: "#fff" },
};

// ─── Cloudflare Worker Proxy Code ───
const CF_WORKER_CODE = `// Deploy this as a Cloudflare Worker
// Set DEERAPI_KEY as an environment variable in your Worker settings

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url",
        },
      });
    }

    if (request.method !== "POST" && request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const imageUrl = request.headers.get("X-Image-Url");
    if (imageUrl) {
      const imgResp = await fetch(imageUrl, { method: "GET", redirect: "follow" });
      const imgType = imgResp.headers.get("Content-Type") || "application/octet-stream";
      const imgData = await imgResp.arrayBuffer();
      return new Response(imgData, {
        status: imgResp.status,
        headers: {
          "Content-Type": imgType,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url",
        },
      });
    }

    // The frontend sends the target path in a header
    const targetPath = request.headers.get("X-Target-Path") || "/v1/chat/completions";
    const body = await request.text();

    // Determine auth format: Gemini endpoints use plain key, others use Bearer
    const isGemini = targetPath.includes("/v1beta/");
    const authHeader = isGemini
      ? env.DEERAPI_KEY
      : \`Bearer \${env.DEERAPI_KEY}\`;

    const resp = await fetch(\`https://api.deerapi.com\${targetPath}\`, {
      method: "POST",
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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url",
      },
    });
  },
};`;

// ─── Helpers ───
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function stripBase64Prefix(dataUrl) {
  if (!dataUrl) return "";
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
}

function getMimeFromDataUrl(dataUrl) {
  const m = dataUrl?.match(/^data:(image\/[a-z+]+);base64,/);
  return m ? m[1] : "image/png";
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function downloadImageUrl(url, filename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback to direct opening if fetch download fails.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

function normalizeImageValue(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("/")) return `https://api.deerapi.com${v}`;
  const mdUrl = v.match(/\((https?:\/\/[^)]+)\)/)?.[1] || v.match(/https?:\/\/\S+/)?.[0];
  if (mdUrl) return mdUrl.replace(/[),.;]+$/, "");
  if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 128) {
    return `data:image/png;base64,${v}`;
  }
  return null;
}

function extractImageCandidates(input, out = []) {
  if (input == null) return out;
  if (typeof input === "string") {
    const direct = normalizeImageValue(input);
    if (direct) out.push(direct);
    const urlMatches = input.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    urlMatches.forEach((u) => {
      const normalized = normalizeImageValue(u);
      if (normalized) out.push(normalized);
    });
    return out;
  }
  if (Array.isArray(input)) {
    input.forEach((item) => extractImageCandidates(item, out));
    return out;
  }
  if (typeof input === "object") {
    Object.entries(input).forEach(([k, v]) => {
      if (/url|image|img|uri|link/i.test(k)) extractImageCandidates(v, out);
      else if (typeof v === "object" || typeof v === "string") extractImageCandidates(v, out);
    });
    return out;
  }
  return out;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function proxyFetchImageAsDataUrl(proxyUrl, rawUrl) {
  const normalized = normalizeImageValue(rawUrl);
  if (!normalized || !/^https?:\/\//i.test(normalized)) return normalized;

  try {
    if (!proxyUrl?.trim()) return normalized;
    // Route all image URLs via Worker to bypass browser CORS/hotlink limits.
    const resp = await fetch(proxyUrl, {
      method: "GET",
      headers: { "X-Image-Url": normalized },
    });
    const type = resp.headers.get("content-type") || "";
    if (!resp.ok || !type.startsWith("image/")) return normalized;
    const blob = await resp.blob();
    return await blobToDataUrl(blob);
  } catch {
    return normalized;
  }
}

function buildWorkerImageProxyUrl(proxyUrl, rawUrl) {
  const normalized = normalizeImageValue(rawUrl);
  if (!normalized) return null;
  if (normalized.startsWith("data:image/")) return normalized;
  if (!/^https?:\/\//i.test(normalized)) return normalized;
  if (!proxyUrl?.trim()) return normalized;
  try {
    const base = proxyUrl.replace(/\/+$/, "");
    return `${base}/?image_url=${encodeURIComponent(normalized)}`;
  } catch {
    return normalized;
  }
}

function safeName(input) {
  return String(input || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function dataUrlToBytes(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "png";
  return { bytes, ext };
}

function extFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  } catch {}
  return "png";
}

async function fetchImageBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const type = resp.headers.get("content-type") || "";
  const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : extFromUrl(url);
  return { bytes: buf, ext };
}

async function downloadAllAsZip(turns) {
  const JSZip = (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
  const zip = new JSZip();

  const ordered = [...turns].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < ordered.length; i += 1) {
    const turn = ordered[i];
    const folder = zip.folder(String(i + 1));
    folder.file(
      "prompt.json",
      JSON.stringify(
        {
          seq: turn.seq,
          createdAt: new Date(turn.createdAt).toISOString(),
          prompt: turn.prompt || "",
          selectedModels: turn.selectedModelIds,
          status: turn.status,
        },
        null,
        2
      )
    );

    const okResults = (turn.results || []).filter((r) => r.status === "success" && r.images?.length);
    for (const r of okResults) {
      const modelBase = safeName(r.modelName || r.modelId);
      for (let j = 0; j < r.images.length; j += 1) {
        const img = r.images[j];
        const index = j + 1;
        const fromDataUrl = dataUrlToBytes(img);
        if (fromDataUrl) {
          folder.file(`${modelBase}_${index}.${fromDataUrl.ext}`, fromDataUrl.bytes);
          continue;
        }
        if (/^https?:\/\//i.test(img)) {
          try {
            const remote = await fetchImageBytes(img);
            folder.file(`${modelBase}_${index}.${remote.ext}`, remote.bytes);
          } catch {
            // Keep URL fallback if remote download is blocked.
            folder.file(`${modelBase}_${index}.txt`, img);
          }
        }
      }
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `polyimage-history-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── DeerAPI Call Functions ───

// 1. OpenAI Chat Completions format (gpt-4o-image, gpt-5-image)
async function callChatAPI(proxyUrl, model, prompt, imageBase64) {
  const content = [];
  if (prompt) content.push({ type: "text", text: prompt });
  if (imageBase64) {
    content.push({ type: "image_url", image_url: { url: imageBase64 } });
  }
  if (!content.length) content.push({ type: "text", text: "Generate a creative image" });

  const body = {
    model: model.id,
    stream: false,
    messages: [{ role: "user", content }],
  };

  const resp = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Target-Path": "/v1/chat/completions" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();

  const images = [];
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("No response from model");

  const c = msg.content;
  if (typeof c === "string") {
    const re = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g;
    const matches = c.match(re);
    if (matches) images.push(...matches);
    const urlRe = /https?:\/\/[^\s"')]+\.(?:png|jpg|jpeg|webp)/gi;
    const urlMatches = c.match(urlRe);
    if (urlMatches) images.push(...urlMatches);
  } else if (Array.isArray(c)) {
    c.forEach((block) => {
      if (block.type === "image_url") images.push(block.image_url?.url);
      if (block.type === "image" && block.source?.data) images.push(`data:image/${block.source.media_type || "png"};base64,${block.source.data}`);
    });
  }
  if (msg.images) images.push(...msg.images);
  return images;
}

// 2. OpenAI Images / Seedream format (gpt-image-1, gpt-image-1.5, seedream)
async function callImagesAPI(proxyUrl, model, prompt, imageBase64) {
  const isSeedream = model.provider === "ByteDance";
  const body = {
    model: model.id,
    prompt: prompt || "Generate a creative image",
    n: 1,
    size: isSeedream ? "2K" : "1024x1024",
  };
  if (isSeedream) {
    // Use URL response to avoid oversized base64 payload causing network failures.
    body.response_format = "url";
    body.watermark = true;
    body.guidance_scale = 3;
  }
  if (imageBase64 && isSeedream) {
    body.image = imageBase64;
  }

  const resp = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Target-Path": "/v1/images/generations" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();

  const images = [];
  // OpenAI-style: { data: [ { b64_json, url } ] }
  if (Array.isArray(data.data)) {
    data.data.forEach((item) => {
      const normalized =
        normalizeImageValue(item?.url) ||
        normalizeImageValue(item?.b64_json) ||
        normalizeImageValue(item?.image_base64) ||
        normalizeImageValue(item?.base64);
      if (normalized) images.push(normalized);
    });
  }
  // 某些实现可能直接返回 { image_base64: "...", url: "..." }
  if (!images.length) {
    const normalized = normalizeImageValue(data.image_base64) || normalizeImageValue(data.url);
    if (normalized) images.push(normalized);
  }
  if (!images.length && Array.isArray(data.images)) {
    data.images.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null) ||
        normalizeImageValue(item?.url) ||
        normalizeImageValue(item?.b64_json) ||
        normalizeImageValue(item?.image_base64) ||
        normalizeImageValue(item?.base64);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length && Array.isArray(data.result)) {
    data.result.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null) ||
        normalizeImageValue(item?.url) ||
        normalizeImageValue(item?.b64_json) ||
        normalizeImageValue(item?.image_base64) ||
        normalizeImageValue(item?.base64);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length) {
    extractImageCandidates(data, images);
  }

  const deduped = Array.from(new Set(images));
  const resolved = await Promise.all(deduped.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
  const finalImages = resolved
    .map((v) => normalizeImageValue(v))
    .filter(Boolean)
    .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);

  return finalImages;
}

// 3. Gemini generateContent format
async function callGeminiAPI(proxyUrl, model, prompt, imageBase64) {
  const parts = [];
  if (prompt) parts.push({ text: prompt });
  if (!prompt && !imageBase64) parts.push({ text: "Generate a creative image" });
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: getMimeFromDataUrl(imageBase64), data: stripBase64Prefix(imageBase64) } });
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };

  const resp = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Target-Path": `/v1beta/models/${model.id}:generateContent` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();

  const images = [];
  data.candidates?.[0]?.content?.parts?.forEach((part) => {
    if (part.inlineData?.data) images.push(`data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`);
  });
  return images;
}
// 4. Midjourney imagine + fetch（按接口文档，只显示 1 张）
async function callMidjourneyAPI(proxyUrl, model, prompt, imageBase64) {
  if (!prompt) throw new Error("Midjourney 需要文字 prompt");

  // 按文档要求构造请求体
  const submitBody = {
    botType: "MID_JOURNEY",
    prompt,
    accountFilter: {
      modes: ["FAST"],
    },
  };
  // 如果有参考图，按文档用 base64Array 传入
  if (imageBase64) {
    submitBody.base64Array = [stripBase64Prefix(imageBase64)];
  }

  const submitResp = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Target-Path": "/mj/submit/imagine",
    },
    body: JSON.stringify(submitBody),
  });
  if (!submitResp.ok) throw new Error(`API ${submitResp.status}: ${(await submitResp.text()).slice(0, 300)}`);
  const submitData = await submitResp.json();
  const taskId = submitData?.result || submitData?.taskId || submitData?.id;
  if (!taskId) throw new Error("Midjourney 未返回任务 ID");

  const maxWaitMs = 480_000;
  const intervalMs = 5_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const fetchResp = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        "X-Target-Path": `/mj/task/${taskId}/fetch`,
      },
    });
    if (!fetchResp.ok) throw new Error(`API ${fetchResp.status}: ${(await fetchResp.text()).slice(0, 300)}`);
    const taskRaw = await fetchResp.json();
    const task = taskRaw?.result && typeof taskRaw.result === "object" ? taskRaw.result : taskRaw;

    const status =
      task?.status ||
      task?.taskStatus ||
      taskRaw?.status ||
      taskRaw?.taskStatus ||
      taskRaw?.code;
    const statusText = String(status || "").toUpperCase();
    if (statusText === "SUCCESS" || statusText === "SUCCEEDED" || status === 1) {
      const candidates = [
        ...(extractImageCandidates(task) || []),
        ...(extractImageCandidates(taskRaw) || []),
        ...(extractImageCandidates(task?.properties) || []),
        ...(extractImageCandidates(taskRaw?.properties) || []),
      ];
      const normalized = Array.from(new Set(candidates.map((v) => normalizeImageValue(v)).filter(Boolean)));
      if (!normalized.length) throw new Error("Midjourney 任务成功但未返回图片地址");
      const resolved = await Promise.all(normalized.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
      const finalImages = resolved
        .map((v) => normalizeImageValue(v))
        .filter(Boolean)
        .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
      if (!finalImages.length) throw new Error("Midjourney 任务成功但图片地址不可访问");
      return finalImages.slice(0, 1);
    }
    if (statusText === "FAILURE" || statusText === "FAILED" || statusText === "CANCEL" || status === -1) {
      throw new Error(task?.failReason || task?.message || taskRaw?.description || "Midjourney 任务失败");
    }
  }

  throw new Error("Midjourney 任务超时");
}

// 5. NanoBanana via replicate
async function callReplicateNanoBananaAPI(proxyUrl, model, prompt, imageBase64) {
  if (!prompt) throw new Error("NanoBanana 需要文字 prompt");

  const models = "nanobanana";

  const submitBody = {
    input: {
      prompt,
    },
  };
  if (imageBase64) {
    submitBody.input.image = imageBase64;
  }

  const submitResp = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Target-Path": `/replicate/v1/models/${models}/predictions`,
    },
    body: JSON.stringify(submitBody),
  });
  if (!submitResp.ok) throw new Error(`API ${submitResp.status}: ${(await submitResp.text()).slice(0, 300)}`);
  const submitData = await submitResp.json();
  const predictionId = submitData?.id;
  if (!predictionId) throw new Error("NanoBanana 未返回任务 ID");

  const maxWaitMs = 60_000;
  const intervalMs = 3_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const fetchResp = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        "X-Target-Path": `/replicate/v1/predictions/${predictionId}`,
      },
    });
    if (!fetchResp.ok) throw new Error(`API ${fetchResp.status}: ${(await fetchResp.text()).slice(0, 300)}`);
    const prediction = await fetchResp.json();

    if (prediction.status === "succeeded" || prediction.status === "success") {
      const out = prediction.output || [];
      const urls = Array.isArray(out) ? out : [out];
      return urls.filter(Boolean);
    }
    if (prediction.status === "failed") {
      throw new Error(prediction.error || "NanoBanana 任务失败");
    }
  }

  throw new Error("NanoBanana 任务超时");
}

async function generateImage(proxyUrl, model, prompt, imageBase64) {
  switch (model.apiType) {
    case "chat":
      return callChatAPI(proxyUrl, model, prompt, imageBase64);
    case "images":
      return callImagesAPI(proxyUrl, model, prompt, imageBase64);
    case "gemini":
      return callGeminiAPI(proxyUrl, model, prompt, imageBase64);
    case "midjourney":
      return callMidjourneyAPI(proxyUrl, model, prompt, imageBase64);
    case "replicate":
      return callReplicateNanoBananaAPI(proxyUrl, model, prompt, imageBase64);
    default:
      throw new Error(`Unknown apiType: ${model.apiType}`);
  }
}

// ─── Components ───
function SettingsModal({ show, onClose, proxyUrl, setProxyUrl }) {
  const [showWorkerCode, setShowWorkerCode] = useState(false);
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>⚙ Configuration</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>Cloudflare Worker Proxy URL</label>
        <input style={S.proxyInput} value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="https://your-worker.workers.dev" />
        <p style={S.hint}>Deploy the Worker below. Set <code style={{ color: "#a78bfa" }}>DEERAPI_KEY</code> (your DeerAPI key <code style={{ color: "#a78bfa" }}>sk-...</code>) as environment variable.</p>
        <button style={{ ...S.toggleCodeBtn, marginTop: 16 }} onClick={() => setShowWorkerCode(!showWorkerCode)}>
          {showWorkerCode ? "Hide" : "Show"} Worker Code
        </button>
        {showWorkerCode && <pre style={S.codeBlock}>{CF_WORKER_CODE}</pre>}
      </div>
    </div>
  );
}

function ModelChip({ model, selected, onToggle, disabled }) {
  const prov = PROVIDER_COLORS[model.provider] || { bg: "#666" };
  const apiLabel = { chat: "Chat", images: "Images", gemini: "Gemini", midjourney: "MJ", replicate: "Replicate" }[model.apiType];
  return (
    <button onClick={() => onToggle(model.id)} disabled={disabled && !selected}
      style={{ ...S.modelChip, background: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)", borderColor: selected ? prov.bg : "rgba(255,255,255,0.08)", opacity: disabled && !selected ? 0.35 : 1, cursor: disabled && !selected ? "not-allowed" : "pointer" }}>
      <span style={{ ...S.dot, background: prov.bg }} />
      <span style={S.chipName}>{model.name}</span>
      {model.badge && <span style={{ ...S.badge, background: model.badge === "NEW" ? "#22c55e" : model.badge === "HOT" ? "#f97316" : "#a855f7" }}>{model.badge}</span>}
      <span style={S.apiTag}>{apiLabel}</span>
      {selected && <span style={S.check}>✓</span>}
    </button>
  );
}

function ImagePreviewModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ ...S.closeBtn, position: "absolute", top: 12, right: 12, zIndex: 10 }}>✕</button>
        <img src={src} alt="Full" style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8 }} />
      </div>
    </div>
  );
}

function ResultColumn({ result, onPreview }) {
  const model = IMAGE_MODELS.find((m) => m.id === result.modelId);
  const prov = PROVIDER_COLORS[model?.provider] || { bg: "#666" };
  const sc = result.status === "success" ? "#22c55e" : result.status === "loading" ? "#eab308" : "#ef4444";
  return (
    <div style={S.resultCol}>
      <div style={S.resultHeader}>
        <span style={{ ...S.dot, background: prov.bg, width: 8, height: 8 }} />
        <span style={S.resultName}>{model?.name || result.modelId}</span>
        <span style={{ ...S.statusBadge, background: sc + "22", color: sc }}>
          {result.status === "loading" ? "⏳" : result.status === "success" ? "✓" : "✗"} {result.status}
        </span>
      </div>
      {result.status === "loading" && <div style={S.loadingArea}><div style={S.spinner} /><p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>Generating...</p></div>}
      {result.status === "error" && <div style={S.errArea}><p style={{ color: "#ef4444", fontSize: 13, wordBreak: "break-word" }}>{result.error}</p></div>}
      {result.status === "success" && result.images?.length > 0 && (
        <div style={S.imgGrid}>{result.images.map((img, i) => (
          <div key={i} style={S.imgCard}>
            <img src={img} alt={`Gen ${i + 1}`} style={S.thumb} onClick={() => onPreview(img)} />
            <button
              style={S.dlBtn}
              onClick={() =>
                img.startsWith("data:image/")
                  ? downloadDataUrl(img, `${model?.name || "img"}_${i + 1}.png`)
                  : downloadImageUrl(img, `${model?.name || "img"}_${i + 1}.png`)
              }
            >
              ↓ Save
            </button>
          </div>
        ))}</div>
      )}
      {result.status === "success" && (!result.images || !result.images.length) && <div style={S.errArea}><p style={{ color: "#f59e0b", fontSize: 13 }}>No images returned.</p></div>}
    </div>
  );
}

function TurnPanel({ turn, onPreview }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: mono }}>
          #{turn.seq} · {new Date(turn.createdAt).toLocaleString()} · {turn.status}
        </div>
        <div style={{ fontSize: 12, color: "#71717a", fontFamily: mono }}>
          {turn.selectedModelIds.join(" · ")}
        </div>
      </div>
      <div style={{ marginBottom: 10, fontSize: 13, color: "#e4e4e7", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {turn.prompt || "(no prompt)"}
      </div>
      {turn.referenceImage && (
        <div style={{ marginBottom: 10 }}>
          <img src={turn.referenceImage} alt="Reference" style={{ width: 96, height: 96, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)" }} />
        </div>
      )}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: turn.results.length === 1 ? "1fr" : turn.results.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr" }}>
        {turn.results.map((r, i) => <ResultColumn key={`${turn.id}-${r.modelId}-${i}`} result={r} onPreview={onPreview} />)}
      </div>
    </section>
  );
}

// ─── Main App ───
export default function App() {
  const [prompt, setPrompt] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [selectedModels, setSelectedModels] = useState(["gemini-2.5-flash-image"]);
  const [turns, setTurns] = useState([]);
  const [activeTurnId, setActiveTurnId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(4);
  const [previewImage, setPreviewImage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");
  const fileRef = useRef(null);
  const seqRef = useRef(1);

  useEffect(() => { try { const s = window.__proxyUrl; if (s) setProxyUrl(s); } catch(e){} }, []);
  useEffect(() => { window.__proxyUrl = proxyUrl; }, [proxyUrl]);

  const toggleModel = useCallback((id) => {
    setSelectedModels((prev) =>
      prev.includes(id)
        ? prev.filter((m) => m !== id)
        : prev.length >= 6
        ? prev
        : [...prev, id]
    );
  }, []);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedImage(await fileToBase64(file));
    setUploadedPreview(URL.createObjectURL(file));
  }, []);

  const removeImage = useCallback(() => { setUploadedImage(null); setUploadedPreview(null); if (fileRef.current) fileRef.current.value = ""; }, []);

  const handleGenerate = useCallback(async () => {
    if (!proxyUrl.trim()) { setShowSettings(true); return; }
    if (!selectedModels.length || (!prompt.trim() && !uploadedImage)) return;

    const now = Date.now();
    const turn = {
      id: now + Math.floor(Math.random() * 1000),
      seq: seqRef.current,
      createdAt: now,
      prompt,
      referenceImage: uploadedImage,
      selectedModelIds: [...selectedModels],
      proxyUrl: proxyUrl.trim(),
      status: "queued",
      results: selectedModels.map((mid) => ({
        modelId: mid,
        modelName: IMAGE_MODELS.find((m) => m.id === mid)?.name || mid,
        status: "loading",
        images: [],
        error: null,
      })),
    };
    seqRef.current += 1;
    setActiveTurnId(turn.id);
    setTurns((prev) => [turn, ...prev]);
  }, [proxyUrl, selectedModels, prompt, uploadedImage]);

  useEffect(() => {
    if (isProcessing) return;
    const queued = turns.filter((t) => t.status === "queued").sort((a, b) => a.seq - b.seq);
    const next = queued[0];
    if (!next) return;

    (async () => {
      setIsProcessing(true);
      setTurns((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "running", startedAt: Date.now() } : t)));

      await Promise.allSettled(
        next.selectedModelIds.map(async (mid) => {
          const model = IMAGE_MODELS.find((m) => m.id === mid);
          try {
            const images = await generateImage(next.proxyUrl, model, next.prompt, next.referenceImage);
            setTurns((prev) =>
              prev.map((t) =>
                t.id !== next.id
                  ? t
                  : {
                      ...t,
                      results: t.results.map((r) => (r.modelId === mid ? { ...r, status: "success", images } : r)),
                    }
              )
            );
          } catch (err) {
            setTurns((prev) =>
              prev.map((t) =>
                t.id !== next.id
                  ? t
                  : {
                      ...t,
                      results: t.results.map((r) => (r.modelId === mid ? { ...r, status: "error", error: err.message } : r)),
                    }
              )
            );
          }
        })
      );

      setTurns((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "done", endedAt: Date.now() } : t)));
      setIsProcessing(false);
    })();
  }, [turns, isProcessing]);

  const activeTurn =
    turns.find((t) => t.id === activeTurnId) ||
    turns.filter((t) => t.status === "running" || t.status === "queued").sort((a, b) => a.seq - b.seq)[0] ||
    [...turns].sort((a, b) => b.seq - a.seq)[0] ||
    null;
  const historyTurns = turns.filter((t) => !activeTurn || t.id !== activeTurn.id).sort((a, b) => b.seq - a.seq);
  const visibleHistory = historyTurns.slice(0, historyLimit);
  const hasMoreHistory = historyTurns.length > historyLimit;
  const queueCount = turns.filter((t) => t.status === "queued").length;
  const runningCount = turns.filter((t) => t.status === "running").length;
  const hasAnySuccess = turns.some((t) => t.results?.some((r) => r.status === "success" && r.images?.length));

  return (
    <div style={S.root}>
      <div style={S.bgGrain} />
      <header style={S.header}>
        <div style={S.logoArea}>
          <div style={S.logoCube}><span style={{ fontSize: 20 }}>◈</span></div>
          <div>
            <h1 style={S.title}>POLYIMAGE</h1>
            <p style={S.subtitle}>Multi-Model Generation · DeerAPI</p>
          </div>
        </div>
        <button style={S.settingsBtn} onClick={() => setShowSettings(true)}>⚙</button>
      </header>

      <main style={S.main}>
        <section style={{ marginBottom: 24 }}>
          <div style={S.inputGrid}>
            <div>
              <label style={S.label}>PROMPT</label>
              <textarea style={S.textarea} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image you want to generate..." rows={4} />
            </div>
            <div>
              <label style={S.label}>REFERENCE IMAGE</label>
              {uploadedPreview ? (
                <div style={S.uploadedBox}>
                  <img src={uploadedPreview} alt="Ref" style={S.uploadedThumb} />
                  <button style={S.removeBtn} onClick={removeImage}>✕</button>
                </div>
              ) : (
                <div style={S.dropZone} onClick={() => fileRef.current?.click()}>
                  <span style={{ fontSize: 28, opacity: 0.4 }}>+</span>
                  <span style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Upload</span>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 24 }}>
          <label style={S.label}>SELECT MODELS <span style={{ color: "#888", fontWeight: 400 }}>({selectedModels.length}/6)</span></label>
          <div style={S.modelGrid}>{IMAGE_MODELS.map((m) => <ModelChip key={m.id} model={m} selected={selectedModels.includes(m.id)} onToggle={toggleModel} disabled={selectedModels.length >= 6} />)}</div>
          <p style={{ fontSize: 11, color: "#555", marginTop: 8, fontFamily: "monospace" }}>
            <span style={{ color: "#10a37f" }}>Chat</span>=chat/completions · <span style={{ color: "#a855f7" }}>Images</span>=images/generations · <span style={{ color: "#1a73e8" }}>Gemini</span>=generateContent · <span style={{ color: "#6d28d9" }}>MJ</span>=task API
          </p>
        </section>

        <div style={S.genRow}>
          <button style={{ ...S.genBtn, opacity: (!prompt.trim() && !uploadedImage) || !selectedModels.length ? 0.5 : 1 }}
            disabled={(!prompt.trim() && !uploadedImage) || !selectedModels.length} onClick={handleGenerate}>
            {isProcessing ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={S.btnSpin} /> Running {runningCount} · Queued {queueCount}</span> : "⬡ Enqueue Task"}
          </button>
          {hasAnySuccess && <button style={S.zipBtn} onClick={() => downloadAllAsZip(turns)}>↓ Download All Dialogs (.zip)</button>}
        </div>

        {activeTurn && (
          <section style={{ animation: "fadeIn 0.3s ease", marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              Current Dialog
            </h3>
            <TurnPanel turn={activeTurn} onPreview={setPreviewImage} />
          </section>
        )}

        {historyTurns.length > 0 && (
          <section style={{ marginTop: 8 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              History Dialogs
            </h3>
            <div style={{ maxHeight: 540, overflowY: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.4)", padding: 12 }}>
              {visibleHistory.map((turn) => (
                <div key={turn.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <TurnPanel turn={turn} onPreview={setPreviewImage} />
                </div>
              ))}
              {hasMoreHistory && (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                  <button style={S.zipBtn} onClick={() => setHistoryLimit((n) => n + 4)}>Load 4 More Dialogs</button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} proxyUrl={proxyUrl} setProxyUrl={setProxyUrl} />
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ─── Styles ───
const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', sans-serif";
const S = {
  root: { minHeight: "100vh", background: "#0a0a0b", color: "#e4e4e7", fontFamily: sans, position: "relative" },
  bgGrain: { position: "fixed", inset: 0, background: "radial-gradient(ellipse at 20% 0%, rgba(16,163,127,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(26,115,232,0.04) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 },
  header: { position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  logoArea: { display: "flex", alignItems: "center", gap: 14 },
  logoCube: { width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #10a37f, #1a73e8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 },
  title: { margin: 0, fontSize: 18, fontFamily: mono, fontWeight: 700, letterSpacing: 3, color: "#fff" },
  subtitle: { margin: 0, fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase" },
  settingsBtn: { width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  main: { position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "24px 20px 60px" },
  inputGrid: { display: "grid", gridTemplateColumns: "1fr 160px", gap: 16 },
  label: { display: "block", fontSize: 11, fontFamily: mono, fontWeight: 600, letterSpacing: 1.5, color: "#999", marginBottom: 8, textTransform: "uppercase" },
  textarea: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", color: "#e4e4e7", fontFamily: sans, fontSize: 14, resize: "vertical", outline: "none", lineHeight: 1.6 },
  dropZone: { width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  uploadedBox: { position: "relative", width: "100%", height: 120, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" },
  uploadedThumb: { width: "100%", height: "100%", objectFit: "cover" },
  removeBtn: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  modelGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  modelChip: { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, border: "1px solid", color: "#e4e4e7", fontSize: 13, fontFamily: sans, transition: "all 0.15s", whiteSpace: "nowrap" },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  chipName: { fontWeight: 500, fontSize: 13 },
  badge: { fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: "1px 5px", borderRadius: 3, color: "#fff" },
  apiTag: { fontSize: 10, color: "#666", fontFamily: mono, padding: "1px 4px", borderRadius: 3, border: "1px solid rgba(255,255,255,0.06)" },
  check: { marginLeft: "auto", color: "#10a37f", fontWeight: 700, fontSize: 14 },
  genRow: { display: "flex", gap: 12, marginBottom: 32, alignItems: "center" },
  genBtn: { padding: "12px 32px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #10a37f, #1a73e8)", color: "#fff", fontFamily: mono, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  zipBtn: { padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 13, cursor: "pointer" },
  btnSpin: { display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" },
  resultCol: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, minHeight: 200 },
  resultHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" },
  resultName: { fontFamily: mono, fontSize: 13, fontWeight: 600, flex: 1 },
  statusBadge: { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, textTransform: "capitalize" },
  loadingArea: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0" },
  spinner: { width: 32, height: 32, border: "3px solid rgba(16,163,127,0.2)", borderTopColor: "#10a37f", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  errArea: { padding: "20px 12px" },
  imgGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 },
  imgCard: { borderRadius: 8, overflow: "hidden", background: "#111", border: "1px solid rgba(255,255,255,0.06)" },
  thumb: { width: "100%", aspectRatio: "1", objectFit: "cover", cursor: "pointer", display: "block" },
  dlBtn: { width: "100%", padding: "8px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#aaa", fontSize: 12, fontFamily: mono, cursor: "pointer" },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.15s ease" },
  settingsModal: { width: "90%", maxWidth: 560, background: "#161618", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, maxHeight: "80vh", overflow: "auto" },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#aaa", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  fieldLabel: { display: "block", fontSize: 12, fontFamily: mono, fontWeight: 500, color: "#999", marginBottom: 6 },
  proxyInput: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 13, outline: "none" },
  hint: { fontSize: 12, color: "#888", marginTop: 8, lineHeight: 1.5 },
  toggleCodeBtn: { padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", fontSize: 12, fontFamily: mono, cursor: "pointer" },
  codeBlock: { marginTop: 12, padding: 16, background: "#0d0d0f", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 11, fontFamily: mono, color: "#a0a0b0", overflow: "auto", maxHeight: 300, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
};
