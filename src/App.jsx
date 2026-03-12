import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ─── DeerAPI Model Registry ───
// Each model has its own apiType defining which DeerAPI endpoint/format to use
const IMAGE_MODELS = [
  // Seedream — /v1/images/generations (豆包生图)
  { id: "doubao-seedream-4-0-250828", name: "Seedream 4.0", shortName: "Seed 4.0", provider: "ByteDance", apiType: "images" },
  { id: "doubao-seedream-4-5-251128", name: "Seedream 4.5", shortName: "Seed 4.5", provider: "ByteDance", apiType: "images", badge: "NEW" },
  // Midjourney via /mj
  { id: "midjourney-imagine", name: "Midjourney Imagine", shortName: "Midjourney", provider: "Midjourney", apiType: "midjourney", badge: "BETA" },
  // GPT‑1.5 image — 依旧走 /v1/images/generations
  { id: "gpt-image-1.5", name: "GPT‑1.5 Image", shortName: "GPT-1.5", provider: "OpenAI", apiType: "images", badge: "HOT" },
  // NanoBanana 系列：本质调用 Gemini 图像模型
  { id: "gemini-2.5-flash-image", name: "NanoBanana", shortName: "Nano", provider: "Google", apiType: "gemini", badge: "HOT" },
  { id: "nano-banana-pro-all", name: "NanoBanana Pro", shortName: "Nano Pro", provider: "Google", apiType: "gemini", badge: "PRO" },
];

const PROVIDER_COLORS = {
  OpenAI: { bg: "#10a37f", text: "#fff" },
  Google: { bg: "#1a73e8", text: "#fff" },
  ByteDance: { bg: "#fe2c55", text: "#fff" },
  Midjourney: { bg: "#6d28d9", text: "#fff" },
};

const LOCAL_STATE_KEY = "polyimage_local_state_v1";
const DEFAULT_SELECTED_MODELS = [
  "doubao-seedream-4-0-250828",
  "doubao-seedream-4-5-251128",
  "gemini-2.5-flash-image",
  "nano-banana-pro-all",
];
const DEFAULT_MODEL_COUNTS = Object.fromEntries(IMAGE_MODELS.map((m) => [m.id, 1]));
const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const ASPECT_RATIO_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "21:9", label: "21:9" },
];
const DEFAULT_TASK_MODE = "single";
const DEFAULT_COMPARE_PROMPTS = { a: "", b: "" };
const DEFAULT_LAST_EDITED_COUNT = 1;
const DEFAULT_ASPECT_RATIO = "auto";
const DEFAULT_API_BASE_URL = "https://api.deerapi.com";
const DEFAULT_API_KEY = "";
const DEFAULT_GPT_ASSIST_MODEL = "gpt-4o-mini";
const DEFAULT_GPT_ASSIST_PROMPT = "你是一个提示词优化助手。你只改写 {{ }} 里的内容，保持用户原有写作风格、长度和随机感，不要改动大括号外的任何字符。";
const MAX_TEMPLATES = 8;
const TEMPLATE_FILE_NAME = "templates.json";
const GPT_ASSIST_FILE_NAME = "gpt-assist.json";
const API_CONFIG_FILE_NAME = "api-config.json";
const DEFAULT_TEMPLATES = Array.from({ length: MAX_TEMPLATES }, (_, index) => ({
  id: `template-${index + 1}`,
  title: `Preset ${index + 1}`,
  body: "",
  backup: "",
}));

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
          "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url, X-Upstream-Base, X-Api-Key",
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
          "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url, X-Upstream-Base, X-Api-Key",
        },
      });
    }

    // The frontend sends the target path in a header
    const targetPath = request.headers.get("X-Target-Path") || "/v1/chat/completions";
    const upstreamBase = resolveUpstreamBase(request.headers.get("X-Upstream-Base"));
    if (!upstreamBase) {
      return new Response(JSON.stringify({ error: "Invalid X-Upstream-Base" }), { status: 400 });
    }
    const body = await request.text();

    const requestApiKey = (request.headers.get("X-Api-Key") || "").trim();
    const fallbackApiKey = (env.DEERAPI_KEY || "").trim();
    const apiKey = requestApiKey || fallbackApiKey;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key missing. Provide X-Api-Key or configure DEERAPI_KEY." }), { status: 400 });
    }

    // Determine auth format: Gemini endpoints use plain key, others use Bearer
    const isGemini = targetPath.includes("/v1beta/");
    const authHeader = isGemini
      ? apiKey
      : \`Bearer \${apiKey}\`;

    const resp = await fetch(\`\${upstreamBase}\${targetPath}\`, {
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
        "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url, X-Upstream-Base, X-Api-Key",
      },
    });
  },
};

const DEFAULT_UPSTREAM_BASE = "https://api.deerapi.com";

function resolveUpstreamBase(value) {
  if (!value) return DEFAULT_UPSTREAM_BASE;
  try {
    const url = new URL(value);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return \`\${url.origin}\${url.pathname}\`.replace(/\\/+$/, "");
  } catch {
    return null;
  }
}`;

// ─── Helpers ───
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function useUndoRedoText(initialValue = "") {
  const [value, setValue] = useState(initialValue);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const setText = useCallback((nextValue, options = {}) => {
    const { record = true } = options;
    setValue((prev) => {
      const resolved = typeof nextValue === "function" ? nextValue(prev) : nextValue;
      const normalized = typeof resolved === "string" ? resolved : String(resolved ?? "");
      if (record && normalized !== prev) {
        undoStackRef.current.push(prev);
        if (undoStackRef.current.length > 200) undoStackRef.current.shift();
        redoStackRef.current = [];
      }
      return normalized;
    });
  }, []);

  const resetText = useCallback((nextValue = "") => {
    const normalized = typeof nextValue === "string" ? nextValue : String(nextValue ?? "");
    undoStackRef.current = [];
    redoStackRef.current = [];
    setValue(normalized);
  }, []);

  const undo = useCallback(() => {
    setValue((prev) => {
      if (!undoStackRef.current.length) return prev;
      const next = undoStackRef.current.pop();
      redoStackRef.current.push(prev);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setValue((prev) => {
      if (!redoStackRef.current.length) return prev;
      const next = redoStackRef.current.pop();
      undoStackRef.current.push(prev);
      return next;
    });
  }, []);

  const handleKeyDown = useCallback((event) => {
    const withMeta = event.metaKey || event.ctrlKey;
    if (!withMeta || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  }, [redo, undo]);

  return { value, setText, resetText, undo, redo, handleKeyDown };
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

function isAbortError(err) {
  const msg = String(err?.message || "");
  return err?.name === "AbortError" || /abort|cancel/i.test(msg);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function shouldRetryApiFailure(status, text = "") {
  if (status === 408 || status === 409 || status === 425 || status === 429) return true;
  if (status >= 500) return true;
  return /未接收到上游响应内容|upstream|timeout|temporarily unavailable|traceid/i.test(text);
}

function normalizeApiBaseUrl(value) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  if (next.startsWith("//")) next = `https:${next}`;
  if (!/^[a-z]+:\/\//i.test(next)) next = `https://${next}`;
  try {
    const url = new URL(next);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function resolveApiBaseUrl(value) {
  return normalizeApiBaseUrl(value) || DEFAULT_API_BASE_URL;
}

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeAspectRatio(value) {
  if (typeof value !== "string") return DEFAULT_ASPECT_RATIO;
  const normalized = value.trim();
  if (!normalized) return DEFAULT_ASPECT_RATIO;
  return ASPECT_RATIO_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_ASPECT_RATIO;
}

function mergePromptWithAspectRatio(prompt, aspectRatio, model) {
  const safePrompt = (prompt || "").trim();
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  if (normalizedRatio === "auto") return safePrompt || "Generate a creative image";
  if (model?.apiType === "midjourney") {
    if (/--ar\s+\d+:\d+/i.test(safePrompt)) return safePrompt;
    return `${safePrompt || "Generate a creative image"} --ar ${normalizedRatio}`.trim();
  }
  const suffix = `Aspect ratio: ${normalizedRatio}`;
  if (safePrompt.toLowerCase().includes(suffix.toLowerCase())) return safePrompt || "Generate a creative image";
  return `${safePrompt || "Generate a creative image"}\n${suffix}`.trim();
}

function normalizeGptAssistPrompt(value) {
  if (typeof value !== "string") return DEFAULT_GPT_ASSIST_PROMPT;
  const next = value.trim();
  return next || DEFAULT_GPT_ASSIST_PROMPT;
}

function extractPlaceholderTokens(input = "") {
  const text = typeof input === "string" ? input : "";
  const matches = [];
  const regex = /\{\{([^{}]*)\}\}/g;
  let found = regex.exec(text);
  while (found) {
    matches.push(typeof found[1] === "string" ? found[1] : "");
    found = regex.exec(text);
  }
  return matches;
}

function applyPlaceholderReplacements(input = "", replacements = []) {
  const text = typeof input === "string" ? input : "";
  let cursor = 0;
  return text.replace(/\{\{([^{}]*)\}\}/g, () => {
    const next = replacements[cursor];
    cursor += 1;
    return `{{${typeof next === "string" ? next.trim() : ""}}}`;
  });
}

function assistantMessageToText(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text") return part?.text || "";
      if (typeof part?.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseJsonFromText(rawText = "") {
  const raw = String(rawText || "").trim();
  if (!raw) return null;

  const candidates = [];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(raw);
  const objectLike = raw.match(/\{[\s\S]*\}/);
  if (objectLike?.[0]) candidates.push(objectLike[0].trim());

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

function buildProxyHeaders(targetPath, apiBaseUrl, apiKey, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (targetPath) headers["X-Target-Path"] = targetPath;
  headers["X-Upstream-Base"] = resolveApiBaseUrl(apiBaseUrl);
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (normalizedApiKey) headers["X-Api-Key"] = normalizedApiKey;
  return headers;
}

async function postJsonWithRetry(proxyUrl, targetPath, body, options = {}) {
  const {
    signal,
    maxAttempts = 3,
    baseDelayMs = 900,
  } = options;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const resp = await fetch(proxyUrl, {
      method: "POST",
      headers: buildProxyHeaders(targetPath, options.apiBaseUrl, options.apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
    });

    if (resp.ok) return resp.json();

    const text = (await resp.text()).slice(0, 600);
    lastError = new Error(`API ${resp.status}: ${text}`);
    const canRetry = shouldRetryApiFailure(resp.status, text);
    if (!canRetry || attempt >= maxAttempts) break;
    const jitter = Math.floor(Math.random() * 250);
    await sleep(baseDelayMs * attempt + jitter, signal);
  }

  throw lastError || new Error("Request failed");
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

function normalizeImageValue(value, apiBaseUrl) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("/")) return `${resolveApiBaseUrl(apiBaseUrl || (typeof window !== "undefined" ? window.__apiBaseUrl : ""))}${v}`;
  const mdUrl = v.match(/\((https?:\/\/[^)]+)\)/)?.[1] || v.match(/https?:\/\/\S+/)?.[0];
  if (mdUrl) return mdUrl.replace(/[),.;]+$/, "");
  if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 128) {
    return `data:image/png;base64,${v}`;
  }
  return null;
}

function extractImageCandidates(input, out = [], apiBaseUrl) {
  if (input == null) return out;
  if (typeof input === "string") {
    const direct = normalizeImageValue(input, apiBaseUrl);
    if (direct) out.push(direct);
    const urlMatches = input.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    urlMatches.forEach((u) => {
      const normalized = normalizeImageValue(u, apiBaseUrl);
      if (normalized) out.push(normalized);
    });
    return out;
  }
  if (Array.isArray(input)) {
    input.forEach((item) => extractImageCandidates(item, out, apiBaseUrl));
    return out;
  }
  if (typeof input === "object") {
    Object.entries(input).forEach(([k, v]) => {
      if (/url|image|img|uri|link/i.test(k)) extractImageCandidates(v, out, apiBaseUrl);
      else if (typeof v === "object" || typeof v === "string") extractImageCandidates(v, out, apiBaseUrl);
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

function normalizePromptVariant(variant, index = 0) {
  const fallbackKey = index === 0 ? "single" : index === 1 ? "a" : index === 2 ? "b" : `variant-${index}`;
  const key = typeof variant?.key === "string" && variant.key ? variant.key : fallbackKey;
  let label = typeof variant?.label === "string" && variant.label ? variant.label : "";
  if (!label) {
    if (key === "single") label = "PROMPT";
    else if (key === "a") label = "PROMPT A";
    else if (key === "b") label = "PROMPT B";
    else label = `PROMPT ${index + 1}`;
  }
  return {
    key,
    label,
    prompt: typeof variant?.prompt === "string" ? variant.prompt : "",
  };
}

function getComposerPromptVariants(taskMode, prompt, comparePrompts) {
  if (taskMode === "compare") {
    return [
      normalizePromptVariant({ key: "a", label: "PROMPT A", prompt: comparePrompts?.a || "" }, 1),
      normalizePromptVariant({ key: "b", label: "PROMPT B", prompt: comparePrompts?.b || "" }, 2),
    ];
  }
  return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: prompt || "" }, 0)];
}

function getTurnPromptVariants(turn) {
  if (Array.isArray(turn?.promptVariants) && turn.promptVariants.length) {
    return turn.promptVariants.map((variant, index) => normalizePromptVariant(variant, index));
  }
  return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: turn?.prompt || "" }, 0)];
}

function getTurnMode(turn) {
  if (turn?.mode === "compare") return "compare";
  return getTurnPromptVariants(turn).length > 1 ? "compare" : "single";
}

function getResultPromptKey(result) {
  return typeof result?.promptKey === "string" && result.promptKey ? result.promptKey : "single";
}

function toPersistableTurns(turns) {
  return turns.slice(0, 30);
}

function toLightweightTurns(turns) {
  return turns.slice(0, 30).map((t) => ({
    ...t,
    results: (t.results || []).map((r) => ({
      ...r,
      images: (r.images || []).filter((img) => typeof img === "string" && img.startsWith("http")).slice(0, 1),
    })),
  }));
}

function safeName(input) {
  return String(input || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildResultFileStem(result) {
  const promptKey = getResultPromptKey(result);
  const promptPrefix = promptKey !== "single" ? `${safeName(result?.promptLabel || promptKey)}_` : "";
  return `${promptPrefix}${safeName(result?.modelName || result?.modelId || "model")}`;
}

function isSameResultTask(result, modelId, promptKey = "single") {
  return result?.modelId === modelId && getResultPromptKey(result) === (promptKey || "single");
}

function normalizeTemplate(input, index = 0) {
  const fallbackId = `template-${index + 1}`;
  const id = typeof input?.id === "string" && input.id ? input.id : fallbackId;
  const title = typeof input?.title === "string" && input.title.trim()
    ? input.title.trim()
    : `Template ${index + 1}`;
  return {
    id,
    title,
    body: typeof input?.body === "string" ? input.body : "",
    backup: typeof input?.backup === "string" ? input.backup : "",
  };
}

function normalizeTemplates(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_TEMPLATES.map((preset, index) => {
    const found = list.find((item) => item?.id === preset.id);
    return normalizeTemplate(found || preset, index);
  });
}

function pickTemplateId(templates, preferredId) {
  if (!templates.length) return null;
  if (typeof preferredId === "string" && preferredId && templates.some((item) => item.id === preferredId)) return preferredId;
  return null;
}

function getTurnDirName(turn) {
  return `turn-${String(turn?.seq || 0).padStart(4, "0")}-${turn?.id}`;
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

function supportsFileSystemAccess() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function ensureDirectoryPermission(handle, write = false) {
  if (!handle?.queryPermission || !handle?.requestPermission) return false;
  const mode = write ? "readwrite" : "read";
  let permission = await handle.queryPermission({ mode });
  if (permission === "granted") return true;
  permission = await handle.requestPermission({ mode });
  return permission === "granted";
}

async function writeTextFile(dirHandle, fileName, text) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function writeBinaryFile(dirHandle, fileName, content) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function saveTurnToLocalFolder(rootHandle, turn) {
  const dirName = getTurnDirName(turn);
  const turnDir = await rootHandle.getDirectoryHandle(dirName, { create: true });
  const promptVariants = getTurnPromptVariants(turn);
  let referenceImageFile = null;
  if (typeof turn.referenceImage === "string" && turn.referenceImage) {
    const fromData = dataUrlToBytes(turn.referenceImage);
    if (fromData) {
      referenceImageFile = `reference_image.${fromData.ext}`;
      await writeBinaryFile(turnDir, referenceImageFile, fromData.bytes);
    } else if (/^https?:\/\//i.test(turn.referenceImage)) {
      try {
        const remote = await fetchImageBytes(turn.referenceImage);
        referenceImageFile = `reference_image.${remote.ext}`;
        await writeBinaryFile(turnDir, referenceImageFile, remote.bytes);
      } catch {
        referenceImageFile = "reference_image.txt";
        await writeTextFile(turnDir, referenceImageFile, turn.referenceImage);
      }
    }
  }
  const manifest = {
    id: turn.id,
    seq: turn.seq,
    createdAt: turn.createdAt,
    mode: getTurnMode(turn),
    prompt: turn.prompt || promptVariants[0]?.prompt || "",
    promptVariants,
    apiBaseUrl: resolveApiBaseUrl(turn.apiBaseUrl),
    apiKey: normalizeApiKey(turn.apiKey),
    aspectRatio: normalizeAspectRatio(turn.aspectRatio ?? turn.geminiAspectRatio),
    referenceImageFile,
    selectedModelIds: turn.selectedModelIds || [],
    modelCounts: turn.modelCounts || {},
    status: turn.status || "done",
    results: [],
  };

  const results = Array.isArray(turn.results) ? turn.results : [];
  for (const r of results) {
    const files = [];
    if (r.status === "success" && Array.isArray(r.images) && r.images.length > 0) {
      for (let i = 0; i < r.images.length; i += 1) {
        const img = r.images[i];
        const index = i + 1;
        const base = `${buildResultFileStem(r)}_${index}`;
        const fromData = typeof img === "string" ? dataUrlToBytes(img) : null;
        if (fromData) {
          const fileName = `${base}.${fromData.ext}`;
          await writeBinaryFile(turnDir, fileName, fromData.bytes);
          files.push(fileName);
          continue;
        }
        if (typeof img === "string" && /^https?:\/\//i.test(img)) {
          try {
            const remote = await fetchImageBytes(img);
            const fileName = `${base}.${remote.ext}`;
            await writeBinaryFile(turnDir, fileName, remote.bytes);
            files.push(fileName);
          } catch {
            const fileName = `${base}.txt`;
            await writeTextFile(turnDir, fileName, img);
            files.push(fileName);
          }
        }
      }
    }
    manifest.results.push({
      modelId: r.modelId,
      modelName: r.modelName,
      promptKey: getResultPromptKey(r),
      promptLabel: r.promptLabel || "",
      requestedCount: r.requestedCount || 1,
      status: r.status,
      error: r.error || null,
      files,
    });
  }

  await writeTextFile(turnDir, "prompt.json", JSON.stringify(manifest, null, 2));
}

async function fileToDataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadTurnsFromLocalFolder(rootHandle) {
  const turns = [];
  for await (const [entryName, entryHandle] of rootHandle.entries()) {
    if (entryHandle.kind !== "directory" || !entryName.startsWith("turn-")) continue;
    try {
      const promptHandle = await entryHandle.getFileHandle("prompt.json");
      const promptFile = await promptHandle.getFile();
      const meta = JSON.parse(await promptFile.text());
      const promptVariants = Array.isArray(meta.promptVariants) && meta.promptVariants.length
        ? meta.promptVariants.map((variant, index) => normalizePromptVariant(variant, index))
        : [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: meta.prompt || "" }, 0)];
      const promptLookup = new Map(promptVariants.map((variant) => [variant.key, variant]));
      let referenceImage = meta.referenceImage || null;
      if (!referenceImage && typeof meta.referenceImageFile === "string" && meta.referenceImageFile) {
        try {
          const rf = await entryHandle.getFileHandle(meta.referenceImageFile);
          const refFile = await rf.getFile();
          if (/\.txt$/i.test(meta.referenceImageFile)) {
            referenceImage = (await refFile.text()).trim();
          } else {
            const dataUrl = await fileToDataUrlFromFile(refFile);
            if (typeof dataUrl === "string") referenceImage = dataUrl;
          }
        } catch {}
      }
      const loadedResults = [];

      const metaResults = Array.isArray(meta.results) ? meta.results : [];
      for (const r of metaResults) {
        const images = [];
        const files = Array.isArray(r.files) ? r.files : [];
        for (const fileName of files) {
          try {
            const fh = await entryHandle.getFileHandle(fileName);
            const f = await fh.getFile();
            if (/\.txt$/i.test(fileName)) {
              images.push((await f.text()).trim());
            } else {
              const dataUrl = await fileToDataUrlFromFile(f);
              if (typeof dataUrl === "string") images.push(dataUrl);
            }
          } catch {}
        }
        loadedResults.push({
          modelId: r.modelId || "unknown-model",
          modelName: r.modelName || r.modelId || "Unknown",
          promptKey: getResultPromptKey(r),
          promptLabel:
            r.promptLabel ||
            promptLookup.get(getResultPromptKey(r))?.label ||
            promptVariants[0]?.label ||
            "PROMPT",
          promptText:
            promptLookup.get(getResultPromptKey(r))?.prompt ||
            promptVariants[0]?.prompt ||
            meta.prompt ||
            "",
          requestedCount: r.requestedCount || Math.max(1, images.length || 1),
          status: r.status || (images.length ? "success" : "error"),
          images,
          error: r.error || null,
        });
      }

      turns.push({
        id: meta.id || Date.now() + Math.floor(Math.random() * 1000),
        seq: Number(meta.seq) || 0,
        createdAt: Number(meta.createdAt) || Date.now(),
        mode: meta.mode === "compare" || promptVariants.length > 1 ? "compare" : "single",
        prompt: meta.prompt || promptVariants[0]?.prompt || "",
        promptVariants,
        apiBaseUrl: resolveApiBaseUrl(meta.apiBaseUrl),
        apiKey: normalizeApiKey(meta.apiKey),
        aspectRatio: normalizeAspectRatio(meta.aspectRatio ?? meta.geminiAspectRatio),
        referenceImage,
        selectedModelIds: Array.isArray(meta.selectedModelIds) ? meta.selectedModelIds : loadedResults.map((r) => r.modelId),
        modelCounts: meta.modelCounts || {},
        proxyUrl: "",
        status: "done",
        results: loadedResults,
        folderSyncedAt: Date.now(),
      });
    } catch {
      // Ignore malformed or incomplete directories.
    }
  }
  return turns.sort((a, b) => b.seq - a.seq);
}

async function loadTemplatesFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(TEMPLATE_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    const templates = normalizeTemplates(raw?.templates);
    const activeTemplateId = pickTemplateId(templates, raw?.activeTemplateId);
    return { templates, activeTemplateId };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") return null;
    const templates = normalizeTemplates(DEFAULT_TEMPLATES);
    return { templates, activeTemplateId: null };
  }
}

async function saveTemplatesToLocalFolder(rootHandle, templates, activeTemplateId) {
  const normalized = normalizeTemplates(templates);
  const safeActiveId = pickTemplateId(normalized, activeTemplateId);
  await writeTextFile(
    rootHandle,
    TEMPLATE_FILE_NAME,
    JSON.stringify(
      {
        activeTemplateId: safeActiveId,
        templates: normalized,
      },
      null,
      2
    )
  );
}

async function loadGptAssistFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(GPT_ASSIST_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    return normalizeGptAssistPrompt(raw?.prompt);
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") return DEFAULT_GPT_ASSIST_PROMPT;
    return DEFAULT_GPT_ASSIST_PROMPT;
  }
}

async function saveGptAssistToLocalFolder(rootHandle, prompt) {
  const normalizedPrompt = normalizeGptAssistPrompt(prompt);
  await writeTextFile(
    rootHandle,
    GPT_ASSIST_FILE_NAME,
    JSON.stringify(
      {
        prompt: normalizedPrompt,
      },
      null,
      2
    )
  );
}

async function loadApiConfigFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(API_CONFIG_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    return {
      apiKey: normalizeApiKey(raw?.apiKey),
      exists: true,
    };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") {
      return {
        apiKey: DEFAULT_API_KEY,
        exists: false,
      };
    }
    return {
      apiKey: DEFAULT_API_KEY,
      exists: false,
    };
  }
}

async function saveApiConfigToLocalFolder(rootHandle, apiKey) {
  await writeTextFile(
    rootHandle,
    API_CONFIG_FILE_NAME,
    JSON.stringify(
      {
        apiKey: normalizeApiKey(apiKey),
      },
      null,
      2
    )
  );
}

async function downloadAllAsZip(turns) {
  const JSZip = (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
  const zip = new JSZip();

  const ordered = [...turns].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < ordered.length; i += 1) {
    const turn = ordered[i];
    const folder = zip.folder(String(i + 1));
    const promptVariants = getTurnPromptVariants(turn);
    folder.file(
      "prompt.json",
      JSON.stringify(
        {
          seq: turn.seq,
          createdAt: new Date(turn.createdAt).toISOString(),
          mode: getTurnMode(turn),
          prompt: turn.prompt || promptVariants[0]?.prompt || "",
          promptVariants,
          apiBaseUrl: resolveApiBaseUrl(turn.apiBaseUrl),
          apiKey: normalizeApiKey(turn.apiKey),
          selectedModels: turn.selectedModelIds,
          selectedModelCounts: turn.modelCounts || {},
          status: turn.status,
        },
        null,
        2
      )
    );

    const okResults = (turn.results || []).filter((r) => r.status === "success" && r.images?.length);
    for (const r of okResults) {
      const resultBase = buildResultFileStem(r);
      for (let j = 0; j < r.images.length; j += 1) {
        const img = r.images[j];
        const index = j + 1;
        const fromDataUrl = dataUrlToBytes(img);
        if (fromDataUrl) {
          folder.file(`${resultBase}_${index}.${fromDataUrl.ext}`, fromDataUrl.bytes);
          continue;
        }
        if (/^https?:\/\//i.test(img)) {
          try {
            const remote = await fetchImageBytes(img);
            folder.file(`${resultBase}_${index}.${remote.ext}`, remote.bytes);
          } catch {
            // Keep URL fallback if remote download is blocked.
            folder.file(`${resultBase}_${index}.txt`, img);
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

async function callTextAssistAPI(proxyUrl, sourcePrompt, imageBase64, assistPrompt, options = {}) {
  const { signal } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const placeholders = extractPlaceholderTokens(sourcePrompt);
  if (!placeholders.length) return sourcePrompt;

  const textInstruction = [
    "只改写 {{ }} 内的内容，不改动大括号外内容。",
    "输出严格 JSON：{\"replacements\":[\"...\", \"...\"]}。",
    "replacements 数组长度必须与占位符数量一致。",
    "改写要保留用户原有语气和随机感，不要模板化。",
    "",
    `原始 prompt: ${sourcePrompt}`,
    `占位符数量: ${placeholders.length}`,
    `占位符原文: ${JSON.stringify(placeholders)}`,
  ].join("\n");

  const userContent = [{ type: "text", text: textInstruction }];
  if (imageBase64) {
    userContent.push({ type: "image_url", image_url: { url: imageBase64 } });
  }

  const body = {
    model: DEFAULT_GPT_ASSIST_MODEL,
    stream: false,
    temperature: 1.15,
    messages: [
      { role: "system", content: normalizeGptAssistPrompt(assistPrompt) },
      { role: "user", content: userContent },
    ],
  };

  const data = await postJsonWithRetry(proxyUrl, "/v1/chat/completions", body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
  });

  const rawText = assistantMessageToText(data?.choices?.[0]?.message?.content);
  const parsed = parseJsonFromText(rawText);
  const parsedList = Array.isArray(parsed?.replacements)
    ? parsed.replacements
    : Array.isArray(parsed)
    ? parsed
    : [];
  if (!parsedList.length) {
    throw new Error("GPT 返回格式错误，请检查 GPT Prompt。");
  }
  const replacements = placeholders.map((original, index) => {
    const next = parsedList[index];
    if (typeof next !== "string") return original;
    const normalized = next.trim();
    return normalized || original;
  });
  return applyPlaceholderReplacements(sourcePrompt, replacements);
}

// 1. OpenAI Chat Completions format (gpt-4o-image, gpt-5-image)
async function callChatAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
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

  const data = await postJsonWithRetry(proxyUrl, "/v1/chat/completions", body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
  });

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
  return Array.from(new Set(images.map((value) => normalizeImageValue(value, apiBaseUrl)).filter(Boolean)));
}

// 2. OpenAI Images / Seedream format (gpt-image-1, gpt-image-1.5, seedream)
async function callImagesAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const isSeedream = model.provider === "ByteDance";
  const body = {
    model: model.id,
    prompt: prompt || "Generate a creative image",
    n: Math.max(1, Number(count) || 1),
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

  const data = await postJsonWithRetry(proxyUrl, "/v1/images/generations", body, {
    signal,
    maxAttempts: 4,
    baseDelayMs: 1200,
    apiBaseUrl,
    apiKey,
  });

  const images = [];
  // OpenAI-style: { data: [ { b64_json, url } ] }
  if (Array.isArray(data.data)) {
    data.data.forEach((item) => {
      const normalized =
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.b64_json, apiBaseUrl) ||
        normalizeImageValue(item?.image_base64, apiBaseUrl) ||
        normalizeImageValue(item?.base64, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  // 某些实现可能直接返回 { image_base64: "...", url: "..." }
  if (!images.length) {
    const normalized = normalizeImageValue(data.image_base64, apiBaseUrl) || normalizeImageValue(data.url, apiBaseUrl);
    if (normalized) images.push(normalized);
  }
  if (!images.length && Array.isArray(data.images)) {
    data.images.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.b64_json, apiBaseUrl) ||
        normalizeImageValue(item?.image_base64, apiBaseUrl) ||
        normalizeImageValue(item?.base64, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length && Array.isArray(data.result)) {
    data.result.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.b64_json, apiBaseUrl) ||
        normalizeImageValue(item?.image_base64, apiBaseUrl) ||
        normalizeImageValue(item?.base64, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length) {
    extractImageCandidates(data, images, apiBaseUrl);
  }

  const deduped = Array.from(new Set(images));
  const resolved = await Promise.all(deduped.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
  const finalImages = resolved
    .map((v) => normalizeImageValue(v, apiBaseUrl))
    .filter(Boolean)
    .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);

  return finalImages;
}

// 3. Gemini generateContent format
async function callGeminiAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const aspectRatio = normalizeAspectRatio(options.aspectRatio);
  const parts = [];
  if (prompt) parts.push({ text: prompt });
  if (!prompt && !imageBase64) parts.push({ text: "Generate a creative image" });
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: getMimeFromDataUrl(imageBase64), data: stripBase64Prefix(imageBase64) } });
  }

  const generationConfig = { responseModalities: ["IMAGE"] };
  if (aspectRatio !== "auto") {
    generationConfig.imageConfig = { aspectRatio };
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig,
  };

  function extractGeminiImages(data) {
    const raw = [];
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    candidates.forEach((candidate) => {
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
      parts.forEach((part) => {
        const camelData = part?.inlineData?.data;
        const camelMime = part?.inlineData?.mimeType || "image/png";
        if (camelData) raw.push(`data:${camelMime};base64,${camelData}`);

        const snakeData = part?.inline_data?.data;
        const snakeMime = part?.inline_data?.mime_type || "image/png";
        if (snakeData) raw.push(`data:${snakeMime};base64,${snakeData}`);

        const camelFile = part?.fileData?.fileUri;
        if (camelFile) raw.push(camelFile);
        const snakeFile = part?.file_data?.file_uri;
        if (snakeFile) raw.push(snakeFile);
      });
    });
    if (!raw.length) extractImageCandidates(data, raw, apiBaseUrl);
    return Array.from(new Set(raw.map((v) => normalizeImageValue(v, apiBaseUrl)).filter(Boolean)));
  }

  let lastErr = null;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const resp = await fetch(proxyUrl, {
      method: "POST",
      headers: buildProxyHeaders(`/v1beta/models/${model.id}:generateContent`, apiBaseUrl, apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
    });
    if (resp.ok) {
      const data = await resp.json();
      const extracted = extractGeminiImages(data);
      if (extracted.length) {
        const resolved = await Promise.all(extracted.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
        const finalImages = resolved
          .map((v) => normalizeImageValue(v, apiBaseUrl))
          .filter(Boolean)
          .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
        if (finalImages.length) return finalImages;
      }
      lastErr = new Error("API 200: No images returned");
      if (attempt < maxAttempts) {
        await sleep(1000 * attempt, signal);
        continue;
      }
      break;
    }
    const text = (await resp.text()).slice(0, 300);
    lastErr = new Error(`API ${resp.status}: ${text}`);
    if (resp.status !== 524 || attempt >= maxAttempts) break;
    await sleep(1000 * attempt, signal);
  }
  throw lastErr || new Error("Gemini request failed");
}
// 4. Midjourney imagine + fetch（按接口文档，只显示 1 张）
async function callMidjourneyAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  if (!prompt) throw new Error("Midjourney 需要文字 prompt");

  function extractTaskId(payload) {
    if (!payload) return null;
    const candidate = payload.result;
    if (typeof candidate === "string") return candidate;
    if (typeof candidate === "object" && candidate) {
      return candidate.taskId || candidate.task_id || candidate.id || candidate.uuid || null;
    }
    return (
      payload.taskId ||
      payload.task_id ||
      payload.id ||
      payload.uuid ||
      payload.properties?.taskId ||
      payload.properties?.task_id ||
      payload.data?.taskId ||
      payload.data?.task_id ||
      null
    );
  }

  async function submitWithBotType(botType) {
    const submitBody = {
      botType,
      prompt,
      accountFilter: { modes: ["FAST"] },
    };
    if (imageBase64) submitBody.base64Array = [stripBase64Prefix(imageBase64)];

    const submitResp = await fetch(proxyUrl, {
      method: "POST",
      headers: buildProxyHeaders("/mj/submit/imagine", apiBaseUrl, apiKey, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(submitBody),
      signal,
    });
    if (!submitResp.ok) throw new Error(`API ${submitResp.status}: ${(await submitResp.text()).slice(0, 300)}`);
    const submitData = await submitResp.json();
    return { submitData, taskId: extractTaskId(submitData) };
  }

  const requested = Math.max(1, Number(count) || 1);
  const allImages = [];
  for (let idx = 0; idx < requested; idx += 1) {
    let submitData;
    let taskId;
    ({ submitData, taskId } = await submitWithBotType("MID_JOURNEY"));
    if (!taskId) {
      ({ submitData, taskId } = await submitWithBotType("mj"));
    }
    if (!taskId) throw new Error(`Midjourney 未返回任务 ID: ${JSON.stringify(submitData).slice(0, 500)}`);

    const maxWaitMs = 480_000;
    const intervalMs = 5_000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await sleep(intervalMs, signal);

      const fetchResp = await fetch(proxyUrl, {
        method: "GET",
        headers: buildProxyHeaders(`/mj/task/${taskId}/fetch`, apiBaseUrl, apiKey),
        signal,
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
          ...(extractImageCandidates(task, [], apiBaseUrl) || []),
          ...(extractImageCandidates(taskRaw, [], apiBaseUrl) || []),
          ...(extractImageCandidates(task?.properties, [], apiBaseUrl) || []),
          ...(extractImageCandidates(taskRaw?.properties, [], apiBaseUrl) || []),
        ];
        const normalized = Array.from(new Set(candidates.map((v) => normalizeImageValue(v, apiBaseUrl)).filter(Boolean)));
        if (!normalized.length) throw new Error("Midjourney 任务成功但未返回图片地址");
        const resolved = await Promise.all(normalized.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
        const finalImages = resolved
          .map((v) => normalizeImageValue(v, apiBaseUrl))
          .filter(Boolean)
          .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
        if (!finalImages.length) throw new Error("Midjourney 任务成功但图片地址不可访问");
        allImages.push(finalImages[0]);
        break;
      }
      if (statusText === "FAILURE" || statusText === "FAILED" || statusText === "CANCEL" || status === -1) {
        throw new Error(task?.failReason || task?.message || taskRaw?.description || "Midjourney 任务失败");
      }
    }
  }
  if (!allImages.length) throw new Error("Midjourney 任务超时");
  return allImages;
}

// 5. NanoBanana via replicate
async function callReplicateNanoBananaAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  if (!prompt) throw new Error("NanoBanana 需要文字 prompt");

  const models = "nanobanana";

  const submitBody = {
    input: {
      prompt,
      num_outputs: Math.max(1, Number(count) || 1),
    },
  };
  if (imageBase64) {
    submitBody.input.image = imageBase64;
  }

  const submitResp = await fetch(proxyUrl, {
    method: "POST",
    headers: buildProxyHeaders(`/replicate/v1/models/${models}/predictions`, apiBaseUrl, apiKey, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(submitBody),
    signal,
  });
  if (!submitResp.ok) throw new Error(`API ${submitResp.status}: ${(await submitResp.text()).slice(0, 300)}`);
  const submitData = await submitResp.json();
  const predictionId = submitData?.id;
  if (!predictionId) throw new Error("NanoBanana 未返回任务 ID");

  const maxWaitMs = 60_000;
  const intervalMs = 3_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await sleep(intervalMs, signal);

    const fetchResp = await fetch(proxyUrl, {
      method: "GET",
      headers: buildProxyHeaders(`/replicate/v1/predictions/${predictionId}`, apiBaseUrl, apiKey),
      signal,
    });
    if (!fetchResp.ok) throw new Error(`API ${fetchResp.status}: ${(await fetchResp.text()).slice(0, 300)}`);
    const prediction = await fetchResp.json();

    if (prediction.status === "succeeded" || prediction.status === "success") {
      const out = prediction.output || [];
      const urls = Array.isArray(out) ? out : [out];
      return urls.map((value) => normalizeImageValue(value, apiBaseUrl)).filter(Boolean);
    }
    if (prediction.status === "failed") {
      throw new Error(prediction.error || "NanoBanana 任务失败");
    }
  }

  throw new Error("NanoBanana 任务超时");
}

async function generateImage(proxyUrl, model, prompt, imageBase64, options = {}) {
  const requested = Math.max(1, Number(options.count) || 1);
  const aspectRatio = normalizeAspectRatio(options.aspectRatio);
  const promptWithAspectRatio =
    model.apiType === "gemini"
      ? (prompt || "").trim()
      : mergePromptWithAspectRatio(prompt, aspectRatio, model);
  const nextOptions = { ...options, aspectRatio };
  switch (model.apiType) {
    case "chat": {
      const all = [];
      for (let i = 0; i < requested; i += 1) {
        const one = await callChatAPI(proxyUrl, model, promptWithAspectRatio, imageBase64, nextOptions);
        if (Array.isArray(one) && one.length) all.push(...one.slice(0, 1));
      }
      return all;
    }
    case "images":
      return callImagesAPI(proxyUrl, model, promptWithAspectRatio, imageBase64, { ...nextOptions, count: requested });
    case "gemini": {
      // Gemini image responses only support one candidate per request.
      const all = [];
      for (let i = 0; i < requested; i += 1) {
        const one = await callGeminiAPI(proxyUrl, model, promptWithAspectRatio, imageBase64, nextOptions);
        if (Array.isArray(one) && one.length) all.push(...one.slice(0, 1));
      }
      return all;
    }
    case "midjourney":
      return callMidjourneyAPI(proxyUrl, model, promptWithAspectRatio, imageBase64, { ...nextOptions, count: requested });
    case "replicate":
      return callReplicateNanoBananaAPI(proxyUrl, model, promptWithAspectRatio, imageBase64, { ...nextOptions, count: requested });
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

function ApiKeyModal({ show, onClose, apiKey, draftApiKey, setDraftApiKey, onSave, saveStateText }) {
  if (!show) return null;
  const isDirty = normalizeApiKey(draftApiKey) !== normalizeApiKey(apiKey);
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>🔑 API Key</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>Deer API Key</label>
        <input
          style={S.proxyInput}
          value={draftApiKey}
          onChange={(e) => setDraftApiKey(e.target.value)}
          placeholder="sk-..."
        />
        <div style={S.apiModalActions}>
          <span style={S.apiModalState}>{saveStateText}</span>
          <button
            style={{ ...S.apiSaveBtn, opacity: isDirty ? 1 : 0.5, cursor: isDirty ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!isDirty}
          >
            Save
          </button>
        </div>
        <p style={S.hint}>点 Save 后才会用于请求。留空后保存，将回退 Worker 环境变量。</p>
      </div>
    </div>
  );
}

function GptAssistModal({ show, onClose, prompt, draftPrompt, setDraftPrompt, onSave, saveStateText, canSave }) {
  if (!show) return null;
  const isDirty = normalizeGptAssistPrompt(draftPrompt) !== normalizeGptAssistPrompt(prompt);
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>👤 GPT Prompt</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>GPT Rewrite Instruction</label>
        <textarea
          style={S.textarea}
          value={draftPrompt}
          onChange={(event) => setDraftPrompt(event.target.value)}
          placeholder="告诉 GPT 如何改写 {{ }} 内文字..."
          rows={6}
        />
        <div style={S.apiModalActions}>
          <span style={S.apiModalState}>{saveStateText}</span>
          <button
            style={{ ...S.apiSaveBtn, opacity: isDirty && canSave ? 1 : 0.5, cursor: isDirty && canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!isDirty || !canSave}
          >
            Save
          </button>
        </div>
        <p style={S.hint}>该提示词会存到历史文件夹（与模板相同），不会保存输入图。</p>
      </div>
    </div>
  );
}

function TemplateEditorModal({ show, onClose, draft, setDraft, onSave, canSave }) {
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>Template Modify</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>Title</label>
        <input
          style={S.proxyInput}
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Template title"
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>Body</label>
        <textarea
          style={S.textarea}
          value={draft.body}
          onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
          placeholder="Main template content"
          rows={4}
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>Backup</label>
        <textarea
          style={S.textarea}
          value={draft.backup}
          onChange={(e) => setDraft((prev) => ({ ...prev, backup: e.target.value }))}
          placeholder="Backup template content"
          rows={4}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            style={{ ...S.apiSaveBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!canSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelChip({ model, selected, onToggle, disabled, count, onCountChange }) {
  const displayName = model.shortName || model.name;
  return (
    <div style={{ ...S.modelChipWrap, opacity: disabled && !selected ? 0.35 : 1 }}>
      <div style={S.modelRow}>
        <button
          onClick={() => onToggle(model.id)}
          disabled={disabled && !selected}
          style={{
            ...S.modelChip,
            background: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
            borderColor: selected ? "#facc15" : "rgba(255,255,255,0.08)",
            cursor: disabled && !selected ? "not-allowed" : "pointer",
          }}
        >
          <span style={S.chipName} title={model.name}>{displayName}</span>
          {selected && <span style={S.check}>✓</span>}
        </button>
        <label style={S.countRow}>
          <span style={S.countLabel}>x</span>
          <select
            value={count}
            onChange={(e) => onCountChange(model.id, e.target.value)}
            style={S.countSelect}
            disabled={!selected}
          >
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
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

function ResultColumn({ result, onPreview, onCancel }) {
  const model = IMAGE_MODELS.find((m) => m.id === result.modelId);
  const prov = PROVIDER_COLORS[model?.provider] || { bg: "#666" };
  const sc =
    result.status === "success"
      ? "#22c55e"
      : result.status === "loading"
      ? "#eab308"
      : result.status === "cancelled"
      ? "#9ca3af"
      : "#ef4444";
  return (
    <div style={S.resultCol}>
      <div style={S.resultHeader}>
        <span style={{ ...S.dot, background: prov.bg, width: 8, height: 8 }} />
        <span style={S.resultName}>{model?.name || result.modelId}</span>
        {getResultPromptKey(result) !== "single" && (
          <span style={{ ...S.statusBadge, background: "rgba(59,130,246,0.14)", color: "#93c5fd" }}>
            {result.promptLabel || getResultPromptKey(result)}
          </span>
        )}
        {!!result.requestedCount && <span style={{ ...S.statusBadge, background: "rgba(250,204,21,0.14)", color: "#facc15" }}>x{result.requestedCount}</span>}
        <span style={{ ...S.statusBadge, background: sc + "22", color: sc }}>
          {result.status === "loading" ? "⏳" : result.status === "success" ? "✓" : "✗"} {result.status}
        </span>
      </div>
      {result.status === "loading" && (
        <div style={S.loadingArea}>
          <div style={S.spinner} />
          <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>Generating...</p>
          <button style={{ ...S.dlBtn, marginTop: 10, borderRadius: 8, width: 120 }} onClick={onCancel}>Stop</button>
        </div>
      )}
      {result.status === "error" && <div style={S.errArea}><p style={{ color: "#ef4444", fontSize: 13, wordBreak: "break-word" }}>{result.error}</p></div>}
      {result.status === "cancelled" && <div style={S.errArea}><p style={{ color: "#9ca3af", fontSize: 13 }}>Cancelled by user</p></div>}
      {result.status === "success" && result.images?.length > 0 && (
        <div style={S.imgGrid}>{result.images.map((img, i) => (
          <ImageCard key={i} img={img} fileStem={buildResultFileStem(result)} index={i + 1} onPreview={onPreview} />
        ))}</div>
      )}
      {result.status === "success" && (!result.images || !result.images.length) && <div style={S.errArea}><p style={{ color: "#f59e0b", fontSize: 13 }}>No images returned.</p></div>}
    </div>
  );
}

function ImageCard({ img, fileStem, index, onPreview }) {
  const [src, setSrc] = useState(img);
  const [triedProxy, setTriedProxy] = useState(false);

  useEffect(() => {
    setSrc(img);
    setTriedProxy(false);
  }, [img]);

  const onImgError = useCallback(() => {
    if (triedProxy) return;
    const proxyFromGlobal = typeof window !== "undefined" ? window.__proxyUrl : "";
    const proxied = buildWorkerImageProxyUrl(proxyFromGlobal, src);
    if (proxied && proxied !== src) {
      setTriedProxy(true);
      setSrc(proxied);
    }
  }, [src, triedProxy]);

  return (
    <div style={S.imgCard}>
      <img src={src} alt={`Gen ${index}`} style={S.thumb} onClick={() => onPreview(src)} onError={onImgError} />
      <button
        style={S.dlBtn}
        onClick={() =>
          src.startsWith("data:image/")
            ? downloadDataUrl(src, `${fileStem}_${index}.png`)
            : downloadImageUrl(src, `${fileStem}_${index}.png`)
        }
      >
        ↓ Save
      </button>
    </div>
  );
}

function TurnPanel({ turn, onPreview, onCancelModel, onDelete, onReuse, onHide, onSyncTemplate, canSyncTemplate }) {
  const promptVariants = getTurnPromptVariants(turn);
  const isCompareMode = getTurnMode(turn) === "compare";
  const selectedModelIds = Array.isArray(turn?.selectedModelIds) ? turn.selectedModelIds : [];
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: mono }}>
          #{turn.seq} · {new Date(turn.createdAt).toLocaleString()} · {turn.status}
          {isCompareMode && <span style={S.turnModeBadge}>Compare</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#71717a", fontFamily: mono }}>
            {selectedModelIds.length ? selectedModelIds.join(" · ") : "-"}
          </div>
          {onSyncTemplate && (
            <button
              style={{ ...S.turnActionBtn, opacity: canSyncTemplate ? 1 : 0.45, cursor: canSyncTemplate ? "pointer" : "not-allowed" }}
              onClick={() => onSyncTemplate(turn)}
              disabled={!canSyncTemplate}
            >
              Sync Template
            </button>
          )}
          {onReuse && <button style={S.turnActionBtn} onClick={() => onReuse(turn)}>Reuse</button>}
          {onHide && <button style={{ ...S.turnActionBtn, width: 28, padding: 0 }} onClick={() => onHide(turn.id)}>x</button>}
          {onDelete && <button style={{ ...S.turnActionBtn, color: "#fca5a5", borderColor: "rgba(252,165,165,0.4)" }} onClick={() => onDelete(turn.id)}>Delete</button>}
        </div>
      </div>
      <div style={S.turnPromptRow}>
        <div
          style={{
            ...S.turnPromptCards,
            gridTemplateColumns: isCompareMode ? "repeat(2, minmax(0, 1fr))" : "1fr",
          }}
        >
          {promptVariants.map((variant) => (
            <div key={variant.key} style={S.turnPromptCard}>
              {isCompareMode && <div style={S.turnPromptBadge}>{variant.label}</div>}
              <div style={S.turnPromptText}>{variant.prompt || "(no prompt)"}</div>
            </div>
          ))}
        </div>
        {turn.referenceImage && (
          <button
            type="button"
            style={S.turnRefImageBtn}
            onClick={() => onPreview?.(turn.referenceImage)}
            title="Preview reference image"
          >
            <img src={turn.referenceImage} alt="Reference" style={S.turnRefImage} />
          </button>
        )}
      </div>
      <div style={isCompareMode ? S.turnCompareResultsGrid : undefined}>
        {promptVariants.map((variant) => {
        const groupResults = (turn.results || []).filter((result) => getResultPromptKey(result) === variant.key);
        if (!groupResults.length) return null;
        return (
          <div key={variant.key} style={isCompareMode ? S.turnResultGroup : undefined}>
            {isCompareMode && (
              <div style={S.turnResultGroupHead}>
                <span style={S.turnPromptBadge}>{variant.label}</span>
                <span style={S.turnResultMeta}>{groupResults.length} model tasks</span>
              </div>
            )}
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, groupResults.length))}, minmax(0, 1fr))`,
              }}
            >
              {groupResults.map((r, i) => (
                <ResultColumn
                  key={`${turn.id}-${r.modelId}-${getResultPromptKey(r)}-${i}`}
                  result={r}
                  onPreview={onPreview}
                  onCancel={() => onCancelModel?.(turn.id, r.modelId, getResultPromptKey(r))}
                />
              ))}
            </div>
          </div>
        );
        })}
      </div>
    </section>
  );
}

// ─── Main App ───
export default function App() {
  const promptEditor = useUndoRedoText("");
  const compareAEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS.a);
  const compareBEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS.b);
  const prompt = promptEditor.value;
  const comparePrompts = useMemo(
    () => ({ a: compareAEditor.value, b: compareBEditor.value }),
    [compareAEditor.value, compareBEditor.value]
  );
  const [taskMode, setTaskMode] = useState(DEFAULT_TASK_MODE);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [draftApiKey, setDraftApiKey] = useState(DEFAULT_API_KEY);
  const [apiKeySavedAt, setApiKeySavedAt] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [gptAssistPrompt, setGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [draftGptAssistPrompt, setDraftGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [gptAssistSavedAt, setGptAssistSavedAt] = useState(null);
  const [showGptAssistModal, setShowGptAssistModal] = useState(false);
  const [gptAssistBusy, setGptAssistBusy] = useState(false);
  const [templates, setTemplates] = useState(normalizeTemplates(DEFAULT_TEMPLATES));
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({ title: "", body: "", backup: "" });
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [selectedModels, setSelectedModels] = useState(DEFAULT_SELECTED_MODELS);
  const [modelCounts, setModelCounts] = useState(DEFAULT_MODEL_COUNTS);
  const [lastEditedCount, setLastEditedCount] = useState(DEFAULT_LAST_EDITED_COUNT);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [turns, setTurns] = useState([]);
  const [activeTurnId, setActiveTurnId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(4);
  const [previewImage, setPreviewImage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("https://a.adelineazures.workers.dev/");
  const [historyDirHandle, setHistoryDirHandle] = useState(null);
  const [historyDirName, setHistoryDirName] = useState("");
  const [historyFolderMsg, setHistoryFolderMsg] = useState("");
  const [hiddenTurnIds, setHiddenTurnIds] = useState([]);
  const fileRef = useRef(null);
  const seqRef = useRef(1);
  const controllersRef = useRef({});
  const savingToFolderRef = useRef(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.turns)) setTurns(saved.turns);
        if (typeof saved.activeTurnId === "number") setActiveTurnId(saved.activeTurnId);
        if (typeof saved.historyLimit === "number") setHistoryLimit(saved.historyLimit);
        if (Array.isArray(saved.selectedModels) && saved.selectedModels.length) {
          const migrated = saved.selectedModels.map((id) => (id === "gemini-3-pro-image" ? "nano-banana-pro-all" : id));
          setSelectedModels(migrated);
        }
        if (saved.modelCounts && typeof saved.modelCounts === "object") {
          const migratedCounts = { ...saved.modelCounts };
          if (typeof migratedCounts["gemini-3-pro-image"] === "number" && typeof migratedCounts["nano-banana-pro-all"] !== "number") {
            migratedCounts["nano-banana-pro-all"] = migratedCounts["gemini-3-pro-image"];
          }
          setModelCounts((prev) => ({ ...prev, ...migratedCounts }));
        }
        if (saved.taskMode === "single" || saved.taskMode === "compare") setTaskMode(saved.taskMode);
        if (saved.comparePrompts && typeof saved.comparePrompts === "object") {
          compareAEditor.resetText(typeof saved.comparePrompts.a === "string" ? saved.comparePrompts.a : DEFAULT_COMPARE_PROMPTS.a);
          compareBEditor.resetText(typeof saved.comparePrompts.b === "string" ? saved.comparePrompts.b : DEFAULT_COMPARE_PROMPTS.b);
        }
        if (typeof saved.prompt === "string") promptEditor.resetText(saved.prompt);
        if (typeof saved.apiBaseUrl === "string" && saved.apiBaseUrl.trim()) {
          setApiBaseUrl(resolveApiBaseUrl(saved.apiBaseUrl));
        }
        if (typeof saved.lastEditedCount === "number") {
          setLastEditedCount(Math.max(1, Math.min(8, Number(saved.lastEditedCount) || 1)));
        }
        if (typeof saved.aspectRatio === "string" || typeof saved.geminiAspectRatio === "string") {
          setAspectRatio(normalizeAspectRatio(saved.aspectRatio ?? saved.geminiAspectRatio));
        }
        if (Array.isArray(saved.hiddenTurnIds)) {
          setHiddenTurnIds(saved.hiddenTurnIds.filter((id) => typeof id === "number"));
        }
        if (typeof saved.proxyUrl === "string" && saved.proxyUrl.trim()) setProxyUrl(saved.proxyUrl);
        if (typeof saved.nextSeq === "number" && Number.isFinite(saved.nextSeq)) seqRef.current = saved.nextSeq;
      } else {
        const s = window.__proxyUrl;
        if (s) setProxyUrl(s);
      }
    } catch {}
  }, []);
  useEffect(() => { window.__proxyUrl = proxyUrl; }, [proxyUrl]);
  useEffect(() => { window.__apiBaseUrl = apiBaseUrl; }, [apiBaseUrl]);
  useEffect(() => { window.__apiKey = apiKey; }, [apiKey]);
  useEffect(() => {
    const state = {
      turns: toPersistableTurns(turns),
      activeTurnId,
      historyLimit,
      selectedModels,
      modelCounts,
      prompt,
      taskMode,
      comparePrompts,
      apiBaseUrl,
      hiddenTurnIds,
      lastEditedCount,
      aspectRatio,
      proxyUrl,
      nextSeq: seqRef.current,
    };
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    } catch {
      try {
        localStorage.setItem(
          LOCAL_STATE_KEY,
          JSON.stringify({ ...state, turns: toLightweightTurns(turns) })
        );
      } catch {}
    }
  }, [turns, activeTurnId, historyLimit, selectedModels, modelCounts, prompt, taskMode, comparePrompts, apiBaseUrl, hiddenTurnIds, lastEditedCount, aspectRatio, proxyUrl]);

  const handleSaveApiKey = useCallback(() => {
    const nextKey = normalizeApiKey(draftApiKey);
    setApiKey(nextKey);
    setApiKeySavedAt(Date.now());
  }, [draftApiKey]);

  const handleSaveGptAssistPrompt = useCallback(() => {
    if (!historyDirHandle) {
      setHistoryFolderMsg("请先选择 History Folder，再保存 GPT Prompt。");
      return;
    }
    const nextPrompt = normalizeGptAssistPrompt(draftGptAssistPrompt);
    setGptAssistPrompt(nextPrompt);
    setDraftGptAssistPrompt(nextPrompt);
    setGptAssistSavedAt(Date.now());
    setShowGptAssistModal(false);
  }, [draftGptAssistPrompt, historyDirHandle]);

  const openTemplateEditor = useCallback((templateId) => {
    if (!historyDirHandle) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(template.id);
    setTemplateDraft({
      title: template.title || "",
      body: template.body || "",
      backup: template.backup || "",
    });
    setShowTemplateModal(true);
  }, [templates, historyDirHandle]);

  const saveTemplateDraft = useCallback(() => {
    if (!editingTemplateId || !historyDirHandle) return;
    const title = templateDraft.title.trim() || editingTemplateId.replace("template-", "Preset ");
    const body = templateDraft.body || "";
    const backup = templateDraft.backup || "";
    setTemplates((prev) => {
      return prev.map((item) => (item.id === editingTemplateId ? { ...item, title, body, backup } : item));
    });
    if (activeTemplateId === editingTemplateId) {
      const promptA = body;
      const promptB = backup.trim() ? backup : promptA;
      if (taskMode === "compare") {
        if (comparePrompts.a !== promptA) compareAEditor.setText(promptA, { record: false });
        if (comparePrompts.b !== promptB) compareBEditor.setText(promptB, { record: false });
      } else if (prompt !== promptA) {
        promptEditor.setText(promptA, { record: false });
      }
    }
    setShowTemplateModal(false);
  }, [templateDraft, editingTemplateId, historyDirHandle, activeTemplateId, taskMode, comparePrompts.a, comparePrompts.b, prompt, compareAEditor, compareBEditor, promptEditor]);

  const selectTemplateUsage = useCallback((templateId) => {
    if (!historyDirHandle) return;
    if (activeTemplateId === templateId) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setActiveTemplateId(template.id);
    const promptA = template.body || "";
    const promptB = template.backup?.trim() ? template.backup : promptA;
    if (taskMode === "compare") {
      if (comparePrompts.a !== promptA) compareAEditor.setText(promptA, { record: false });
      if (comparePrompts.b !== promptB) compareBEditor.setText(promptB, { record: false });
      return;
    }
    if (prompt !== promptA) promptEditor.setText(promptA, { record: false });
  }, [templates, taskMode, compareAEditor, compareBEditor, promptEditor, activeTemplateId, comparePrompts.a, comparePrompts.b, prompt, historyDirHandle]);

  const syncTurnToTemplate = useCallback((turn) => {
    if (!activeTemplateId || !historyDirHandle) return;
    const variants = getTurnPromptVariants(turn);
    const primary = variants[0]?.prompt || "";
    const backup = variants[1]?.prompt || "";
    setTemplates((prev) =>
      prev.map((item) =>
        item.id === activeTemplateId
          ? { ...item, body: primary, backup }
          : item
      )
    );
  }, [activeTemplateId, historyDirHandle]);

  const runGptAssist = useCallback(async () => {
    if (gptAssistBusy) return;
    if (!proxyUrl.trim()) {
      setShowSettings(true);
      return;
    }

    const items = taskMode === "compare"
      ? [
          { key: "a", prompt: comparePrompts.a },
          { key: "b", prompt: comparePrompts.b },
        ]
      : [{ key: "single", prompt }];
    const targetItems = items.filter((item) => extractPlaceholderTokens(item.prompt).length > 0);
    if (!targetItems.length) {
      setHistoryFolderMsg("未找到 {{ }} 占位符，GPT 未执行。");
      return;
    }

    setGptAssistBusy(true);
    try {
      const rewritten = {};
      for (const item of targetItems) {
        rewritten[item.key] = await callTextAssistAPI(
          proxyUrl,
          item.prompt,
          uploadedImage,
          gptAssistPrompt,
          { apiBaseUrl, apiKey }
        );
      }

      if (taskMode === "compare") {
        if (typeof rewritten.a === "string" && rewritten.a !== comparePrompts.a) {
          compareAEditor.setText(rewritten.a, { record: false });
        }
        if (typeof rewritten.b === "string" && rewritten.b !== comparePrompts.b) {
          compareBEditor.setText(rewritten.b, { record: false });
        }
      } else if (typeof rewritten.single === "string" && rewritten.single !== prompt) {
        promptEditor.setText(rewritten.single, { record: false });
      }

      setHistoryFolderMsg(`GPT 已改写 ${Object.keys(rewritten).length} 个提示词。`);
    } catch (err) {
      if (!isAbortError(err)) {
        setHistoryFolderMsg(`GPT 改写失败：${err?.message || "未知错误"}`);
      }
    } finally {
      setGptAssistBusy(false);
    }
  }, [gptAssistBusy, proxyUrl, taskMode, comparePrompts.a, comparePrompts.b, prompt, uploadedImage, gptAssistPrompt, apiBaseUrl, apiKey, compareAEditor, compareBEditor, promptEditor]);

  const toggleModel = useCallback((id) => {
    setSelectedModels((prev) =>
      prev.includes(id)
        ? prev.filter((m) => m !== id)
        : prev.length >= 6
        ? prev
        : [...prev, id]
    );
  }, []);

  const setModelCount = useCallback((id, value) => {
    const n = Math.max(1, Math.min(8, Number(value) || 1));
    setModelCounts((prev) => ({ ...prev, [id]: n }));
    setLastEditedCount(n);
  }, []);

  const syncSelectedCounts = useCallback(() => {
    if (!selectedModels.length) return;
    const targetCount = Math.max(1, Math.min(8, Number(lastEditedCount) || 1));
    setModelCounts((prev) => {
      const next = { ...prev };
      selectedModels.forEach((id) => {
        next[id] = targetCount;
      });
      return next;
    });
  }, [selectedModels, lastEditedCount]);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedImage(await fileToBase64(file));
    setUploadedPreview(URL.createObjectURL(file));
  }, []);

  const removeImage = useCallback(() => { setUploadedImage(null); setUploadedPreview(null); if (fileRef.current) fileRef.current.value = ""; }, []);

  const updateComparePrompt = useCallback((key, value) => {
    if (key === "a") compareAEditor.setText(value);
    if (key === "b") compareBEditor.setText(value);
  }, [compareAEditor, compareBEditor]);

  const loadHistoryFromFolder = useCallback(async (dirHandle) => {
    if (!dirHandle) return false;
    const canRead = await ensureDirectoryPermission(dirHandle, false);
    if (!canRead) {
      setHistoryFolderMsg("文件夹读取权限未授权，无法加载历史。");
      return false;
    }
    const apiConfig = await loadApiConfigFromLocalFolder(dirHandle);
    const loadedApiKey = normalizeApiKey(apiConfig.apiKey);
    setApiKey(loadedApiKey);
    setDraftApiKey(loadedApiKey);
    setApiKeySavedAt(apiConfig.exists ? Date.now() : null);
    const loadedGptAssistPrompt = await loadGptAssistFromLocalFolder(dirHandle);
    setGptAssistPrompt(loadedGptAssistPrompt);
    setDraftGptAssistPrompt(loadedGptAssistPrompt);
    setGptAssistSavedAt(Date.now());
    const templatePayload = await loadTemplatesFromLocalFolder(dirHandle);
    if (templatePayload) {
      setTemplates(templatePayload.templates);
      setActiveTemplateId(templatePayload.activeTemplateId);
    } else {
      const fallbackTemplates = normalizeTemplates(DEFAULT_TEMPLATES);
      setTemplates(fallbackTemplates);
      setActiveTemplateId(null);
    }
    const loadedTurns = await loadTurnsFromLocalFolder(dirHandle);
    setTurns((prev) => {
      const map = new Map();
      [...prev, ...loadedTurns].forEach((t) => {
        map.set(t.id, t);
      });
      return Array.from(map.values()).sort((a, b) => b.seq - a.seq);
    });
    if (loadedTurns.length) {
      const maxSeq = loadedTurns.reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
      seqRef.current = Math.max(seqRef.current, maxSeq + 1);
    }
    setHistoryFolderMsg(
      templatePayload
        ? `已读取文件夹历史：${loadedTurns.length} 条，模板：${templatePayload.templates.length} 个，API/GPT 配置已加载。`
        : `已读取文件夹历史：${loadedTurns.length} 条，模板：${MAX_TEMPLATES} 个（已初始化），API/GPT 配置已初始化。`
    );
    return true;
  }, []);

  const handlePickHistoryFolder = useCallback(async () => {
    if (!supportsFileSystemAccess()) {
      setHistoryFolderMsg("当前浏览器不支持文件夹读写（请使用较新版本 Chrome/Edge）。");
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const loaded = await loadHistoryFromFolder(dirHandle);
      if (!loaded) return;
      setHistoryDirHandle(dirHandle);
      setHistoryDirName(dirHandle.name || "");
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return;
      setHistoryFolderMsg(`选择文件夹失败：${err?.message || "未知错误"}`);
    }
  }, [loadHistoryFromFolder]);

  const handleGenerate = useCallback(async () => {
    if (!proxyUrl.trim()) { setShowSettings(true); return; }
    const promptVariants = getComposerPromptVariants(taskMode, prompt, comparePrompts);
    const hasPromptInput = promptVariants.some((variant) => variant.prompt.trim());
    if (!selectedModels.length || (!hasPromptInput && !uploadedImage)) return;

    const now = Date.now();
    const turnModelCounts = selectedModels.reduce((acc, mid) => {
      acc[mid] = Math.max(1, Math.min(8, Number(modelCounts[mid]) || 1));
      return acc;
    }, {});
    const normalizedPromptVariants = promptVariants.map((variant) => ({
      ...variant,
      prompt: variant.prompt || "",
    }));
    const turn = {
      id: now + Math.floor(Math.random() * 1000),
      seq: seqRef.current,
      createdAt: now,
      mode: taskMode,
      prompt: taskMode === "single" ? (prompt || "") : "",
      promptVariants: normalizedPromptVariants,
      apiBaseUrl: resolveApiBaseUrl(apiBaseUrl),
      apiKey: normalizeApiKey(apiKey),
      aspectRatio: normalizeAspectRatio(aspectRatio),
      referenceImage: uploadedImage,
      selectedModelIds: [...selectedModels],
      modelCounts: turnModelCounts,
      proxyUrl: proxyUrl.trim(),
      status: "queued",
      results: normalizedPromptVariants.flatMap((variant) =>
        selectedModels.map((mid) => ({
          modelId: mid,
          modelName: IMAGE_MODELS.find((m) => m.id === mid)?.name || mid,
          promptKey: variant.key,
          promptLabel: variant.label,
          promptText: variant.prompt || "",
          requestedCount: turnModelCounts[mid] || 1,
          status: "loading",
          images: [],
          error: null,
        }))
      ),
    };
    seqRef.current += 1;
    setActiveTurnId(turn.id);
    setTurns((prev) => [turn, ...prev]);
  }, [proxyUrl, selectedModels, modelCounts, taskMode, prompt, comparePrompts, apiBaseUrl, apiKey, aspectRatio, uploadedImage]);

  const cancelModelTask = useCallback((turnId, modelId, promptKey = "single") => {
    const key = `${turnId}:${modelId}:${promptKey}`;
    const ctl = controllersRef.current[key];
    if (ctl) {
      try { ctl.abort(); } catch {}
      delete controllersRef.current[key];
    }
    setTurns((prev) =>
      prev.map((t) =>
        t.id !== turnId
          ? t
          : {
              ...t,
              results: t.results.map((r) =>
                isSameResultTask(r, modelId, promptKey) && r.status === "loading"
                  ? { ...r, status: "cancelled", error: "Cancelled by user" }
                  : r
              ),
            }
      )
    );
  }, []);

  const removeTurnFromPage = useCallback((turnId) => {
    const targetTurn = turns.find((item) => item.id === turnId) || null;
    setTurns((prev) => prev.filter((t) => t.id !== turnId));
    setHiddenTurnIds((prev) => prev.filter((id) => id !== turnId));
    setActiveTurnId((prev) => (prev === turnId ? null : prev));
    Object.keys(controllersRef.current).forEach((key) => {
      if (!key.startsWith(`${turnId}:`)) return;
      try { controllersRef.current[key].abort(); } catch {}
      delete controllersRef.current[key];
    });
    return targetTurn;
  }, [turns]);

  const hideTurn = useCallback((turnId) => {
    removeTurnFromPage(turnId);
  }, [removeTurnFromPage]);

  const deleteTurn = useCallback(async (turnId) => {
    const targetTurn = removeTurnFromPage(turnId);

    if (!historyDirHandle || !targetTurn) return;
    try {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg("文件夹写入权限未授权，无法删除本地记录。");
        return;
      }
      const dirName = getTurnDirName(targetTurn);
      await historyDirHandle.removeEntry(dirName, { recursive: true });
      setHistoryFolderMsg(`已删除本地历史：#${targetTurn.seq}`);
    } catch (err) {
      setHistoryFolderMsg(`删除本地历史失败：#${targetTurn?.seq || "?"}（${err?.message || "未知错误"}）`);
    }
  }, [historyDirHandle, removeTurnFromPage]);

  const reuseTurn = useCallback((turn) => {
    const promptVariants = getTurnPromptVariants(turn);
    const primaryPrompt = promptVariants[0]?.prompt || turn.prompt || "";
    promptEditor.resetText(primaryPrompt);
    if (getTurnMode(turn) === "compare") {
      setTaskMode("compare");
      compareAEditor.resetText(promptVariants[0]?.prompt || "");
      compareBEditor.resetText(promptVariants[1]?.prompt || "");
    } else {
      setTaskMode("single");
      compareAEditor.resetText(DEFAULT_COMPARE_PROMPTS.a);
      compareBEditor.resetText(DEFAULT_COMPARE_PROMPTS.b);
    }
    setSelectedModels(Array.isArray(turn.selectedModelIds) && turn.selectedModelIds.length ? turn.selectedModelIds : DEFAULT_SELECTED_MODELS);
    if (turn.modelCounts && typeof turn.modelCounts === "object") {
      setModelCounts((prev) => ({ ...prev, ...turn.modelCounts }));
      const firstSelectedModel = Array.isArray(turn.selectedModelIds) ? turn.selectedModelIds[0] : null;
      if (firstSelectedModel && typeof turn.modelCounts[firstSelectedModel] === "number") {
        setLastEditedCount(Math.max(1, Math.min(8, Number(turn.modelCounts[firstSelectedModel]) || 1)));
      }
    }
    setAspectRatio(normalizeAspectRatio(turn.aspectRatio ?? turn.geminiAspectRatio));
    if (turn.referenceImage) {
      setUploadedImage(turn.referenceImage);
      setUploadedPreview(turn.referenceImage);
    } else {
      setUploadedImage(null);
      setUploadedPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [compareAEditor, compareBEditor, promptEditor]);

  useEffect(() => {
    if (isProcessing) return;
    const queued = turns.filter((t) => t.status === "queued").sort((a, b) => a.seq - b.seq);
    const next = queued[0];
    if (!next) return;

    (async () => {
      setIsProcessing(true);
      if (typeof window !== "undefined") window.__apiBaseUrl = next.apiBaseUrl || DEFAULT_API_BASE_URL;
      if (typeof window !== "undefined") window.__apiKey = next.apiKey || DEFAULT_API_KEY;
      setTurns((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "running", startedAt: Date.now() } : t)));
      const promptVariants = getTurnPromptVariants(next);
      const promptLookup = new Map(promptVariants.map((variant) => [variant.key, variant]));
      const resultSeeds =
        Array.isArray(next.results) && next.results.length
          ? next.results
          : promptVariants.flatMap((variant) =>
              (next.selectedModelIds || []).map((modelId) => ({
                modelId,
                promptKey: variant.key,
                promptLabel: variant.label,
                promptText: variant.prompt || "",
                requestedCount: next.modelCounts?.[modelId] || 1,
              }))
            );
      const queuedTasks = resultSeeds.map((result) => {
        const promptKey = getResultPromptKey(result);
        const promptVariant = promptLookup.get(promptKey) || promptVariants[0];
        return {
          modelId: result.modelId,
          promptKey,
          promptLabel: result.promptLabel || promptVariant?.label || "PROMPT",
          promptText: typeof result.promptText === "string" ? result.promptText : promptVariant?.prompt || next.prompt || "",
          requestedCount: result.requestedCount || next.modelCounts?.[result.modelId] || 1,
        };
      });

      await Promise.allSettled(
        queuedTasks.map(async (task) => {
          const model = IMAGE_MODELS.find((m) => m.id === task.modelId);
          if (!model) {
            throw new Error(`Model not found: ${task.modelId}`);
          }
          const key = `${next.id}:${task.modelId}:${task.promptKey}`;
          const controller = new AbortController();
          controllersRef.current[key] = controller;
          try {
            const images = await generateImage(next.proxyUrl, model, task.promptText, next.referenceImage, {
              signal: controller.signal,
              count: task.requestedCount || next.modelCounts?.[task.modelId] || 1,
              apiBaseUrl: next.apiBaseUrl || DEFAULT_API_BASE_URL,
              apiKey: next.apiKey || DEFAULT_API_KEY,
              aspectRatio: normalizeAspectRatio(next.aspectRatio ?? next.geminiAspectRatio),
            });
            setTurns((prev) =>
              prev.map((t) =>
                t.id !== next.id
                  ? t
                  : {
                      ...t,
                      results: t.results.map((r) =>
                        isSameResultTask(r, task.modelId, task.promptKey)
                          ? { ...r, promptLabel: task.promptLabel, promptText: task.promptText, status: "success", images }
                          : r
                      ),
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
                      results: t.results.map((r) =>
                        isSameResultTask(r, task.modelId, task.promptKey)
                          ? isAbortError(err)
                            ? { ...r, promptLabel: task.promptLabel, promptText: task.promptText, status: "cancelled", error: "Cancelled by user" }
                            : { ...r, promptLabel: task.promptLabel, promptText: task.promptText, status: "error", error: err.message }
                          : r
                      ),
                    }
              )
            );
          } finally {
            delete controllersRef.current[key];
          }
        })
      );

      setTurns((prev) => prev.map((t) => (t.id === next.id ? { ...t, status: "done", endedAt: Date.now() } : t)));
      setIsProcessing(false);
    })();
  }, [turns, isProcessing]);

  useEffect(() => {
    if (!historyDirHandle) return;
    const pending = turns.filter((t) => t.status === "done" && !t.folderSyncedAt && !savingToFolderRef.current.has(t.id));
    if (!pending.length) return;

    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg("文件夹写入权限未授权，自动保存已暂停。");
        return;
      }

      for (const turn of pending) {
        savingToFolderRef.current.add(turn.id);
        try {
          await saveTurnToLocalFolder(historyDirHandle, turn);
          setTurns((prev) => prev.map((t) => (t.id === turn.id ? { ...t, folderSyncedAt: Date.now(), folderSyncError: null } : t)));
          setHistoryFolderMsg(`已写入本地历史：#${turn.seq}`);
        } catch (err) {
          setTurns((prev) =>
            prev.map((t) => (t.id === turn.id ? { ...t, folderSyncError: err?.message || "write failed" } : t))
          );
          setHistoryFolderMsg(`写入本地历史失败：#${turn.seq}（${err?.message || "未知错误"}）`);
        } finally {
          savingToFolderRef.current.delete(turn.id);
        }
      }
    })();
  }, [turns, historyDirHandle]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveTemplatesToLocalFolder(historyDirHandle, templates, activeTemplateId);
      } catch {}
    })();
  }, [historyDirHandle, templates, activeTemplateId]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveGptAssistToLocalFolder(historyDirHandle, gptAssistPrompt);
      } catch {}
    })();
  }, [historyDirHandle, gptAssistPrompt]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveApiConfigToLocalFolder(historyDirHandle, apiKey);
      } catch {}
    })();
  }, [historyDirHandle, apiKey]);

  const visibleTurns = turns.filter((turn) => !hiddenTurnIds.includes(turn.id));
  const activeTurn =
    visibleTurns.find((t) => t.id === activeTurnId) ||
    visibleTurns.filter((t) => t.status === "running" || t.status === "queued").sort((a, b) => a.seq - b.seq)[0] ||
    [...visibleTurns].sort((a, b) => b.seq - a.seq)[0] ||
    null;
  const historyTurns = visibleTurns.filter((t) => !activeTurn || t.id !== activeTurn.id).sort((a, b) => b.seq - a.seq);
  const visibleHistory = historyTurns.slice(0, historyLimit);
  const hasMoreHistory = historyTurns.length > historyLimit;
  const queueCount = visibleTurns.filter((t) => t.status === "queued").length;
  const runningCount = visibleTurns.filter((t) => t.status === "running").length;
  const hasAnySuccess = visibleTurns.some((t) => t.results?.some((r) => r.status === "success" && r.images?.length));
  const folderSupported = supportsFileSystemAccess();
  const templatesEnabled = !!historyDirHandle;
  const composerPromptVariants = getComposerPromptVariants(taskMode, prompt, comparePrompts);
  const hasPromptInput = composerPromptVariants.some((variant) => variant.prompt.trim());
  const hasPlaceholderInComposer = composerPromptVariants.some((variant) => extractPlaceholderTokens(variant.prompt).length > 0);
  const canRunGptAssist = !gptAssistBusy && !!proxyUrl.trim() && hasPlaceholderInComposer;
  const canGenerate = selectedModels.length > 0 && (hasPromptInput || !!uploadedImage);
  const isApiKeyDirty = normalizeApiKey(draftApiKey) !== normalizeApiKey(apiKey);
  const isGptAssistPromptDirty = normalizeGptAssistPrompt(draftGptAssistPrompt) !== normalizeGptAssistPrompt(gptAssistPrompt);
  const canSaveGptAssistPrompt = !!historyDirHandle;
  const apiKeySaveStateText = isApiKeyDirty
    ? "Unsaved changes"
    : apiKeySavedAt
    ? `Saved at ${new Date(apiKeySavedAt).toLocaleTimeString()}`
    : "Saved";
  const gptAssistSaveStateText = !historyDirHandle
    ? "Select History Folder first"
    : isGptAssistPromptDirty
    ? "Unsaved changes"
    : gptAssistSavedAt
    ? `Saved at ${new Date(gptAssistSavedAt).toLocaleTimeString()}`
    : "Saved";

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
        <div style={S.headerActions}>
          <nav style={S.modeNav}>
            <button
              type="button"
              style={{ ...S.modeTab, ...(taskMode === "single" ? S.modeTabActive : null) }}
              onClick={() => setTaskMode("single")}
            >
              Single
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(taskMode === "compare" ? S.modeTabActive : null) }}
              onClick={() => setTaskMode("compare")}
            >
              Prompt Compare
            </button>
          </nav>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(showApiModal ? S.apiSwitchBtnActive : null) }}
              onClick={() => {
                setDraftApiKey(apiKey);
                setShowApiModal(true);
              }}
            >
              API
            </button>
          </div>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(showGptAssistModal ? S.apiSwitchBtnActive : null) }}
              onClick={() => {
                setDraftGptAssistPrompt(gptAssistPrompt);
                setShowGptAssistModal(true);
              }}
            >
              GPT Prompt
            </button>
          </div>
          <button style={S.settingsBtn} onClick={() => setShowSettings(true)}>⚙</button>
        </div>
      </header>

      <main style={S.main}>
        <section style={{ marginBottom: 24 }}>
          <div style={S.inputGrid}>
            <div>
              <div style={S.promptHead}>
                <label style={{ ...S.label, marginBottom: 0 }}>{taskMode === "compare" ? "PROMPTS" : "PROMPT"}</label>
                <div style={S.promptHeadActions}>
                  {taskMode === "compare" && <span style={S.inputHint}>Shared image, dual prompt runs</span>}
                  <button
                    type="button"
                    style={{ ...S.gptAssistBtn, opacity: canRunGptAssist ? 1 : 0.5, cursor: canRunGptAssist ? "pointer" : "not-allowed" }}
                    onClick={runGptAssist}
                    disabled={!canRunGptAssist}
                    title={hasPlaceholderInComposer ? "Rewrite {{ }} by GPT" : "No {{ }} placeholder found"}
                  >
                    👤
                  </button>
                </div>
              </div>
              {taskMode === "compare" ? (
                <div style={S.comparePromptGrid}>
                  <div>
                    <textarea
                      style={S.textarea}
                      value={comparePrompts.a}
                      onChange={(e) => updateComparePrompt("a", e.target.value)}
                      onKeyDown={compareAEditor.handleKeyDown}
                      placeholder="Describe prompt A..."
                      rows={4}
                    />
                  </div>
                  <div>
                    <textarea
                      style={S.textarea}
                      value={comparePrompts.b}
                      onChange={(e) => updateComparePrompt("b", e.target.value)}
                      onKeyDown={compareBEditor.handleKeyDown}
                      placeholder="Describe prompt B..."
                      rows={4}
                    />
                  </div>
                </div>
              ) : (
                <textarea
                  style={S.textarea}
                  value={prompt}
                  onChange={(e) => promptEditor.setText(e.target.value)}
                  onKeyDown={promptEditor.handleKeyDown}
                  placeholder="Describe the image you want to generate..."
                  rows={4}
                />
              )}
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
          <div style={S.modelTemplateGrid}>
            <div style={S.modelsPanel}>
              <div style={S.modelsHeadRow}>
                <label style={{ ...S.label, marginBottom: 0 }}>
                  SELECT MODELS <span style={{ color: "#888", fontWeight: 400 }}>({selectedModels.length}/6)</span>
                </label>
                <button style={S.syncBtn} onClick={syncSelectedCounts} disabled={!selectedModels.length}>
                  Sync Last Edited Count
                </button>
              </div>
              <div style={S.modelGrid}>
                {IMAGE_MODELS.map((m) => (
                  <ModelChip
                    key={m.id}
                    model={m}
                    selected={selectedModels.includes(m.id)}
                    onToggle={toggleModel}
                    disabled={selectedModels.length >= 6}
                    count={modelCounts[m.id] || 1}
                    onCountChange={setModelCount}
                  />
                ))}
              </div>
              <div style={S.imageSizePanel}>
                <label style={{ ...S.label, marginBottom: 6 }}>IMAGE RATIO</label>
                <div style={S.imageSizeGroup}>
                  <div style={S.imageSizeBtnRow}>
                    {ASPECT_RATIO_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        style={{ ...S.imageSizeBtn, ...(aspectRatio === option.value ? S.imageSizeBtnActive : null) }}
                        onClick={() => setAspectRatio(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <aside style={S.templatePanel}>
              <div style={S.templatePanelHead}>
                <label style={{ ...S.label, marginBottom: 0 }}>TEMPLATES</label>
              </div>
              <div style={S.templateList}>
                {templates.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      ...S.templateItem,
                      ...(item.id === activeTemplateId ? S.templateItemActive : null),
                      ...(!templatesEnabled ? S.templateItemDisabled : null),
                    }}
                    onClick={() => {
                      if (!templatesEnabled) return;
                      selectTemplateUsage(item.id);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.preventDefault()}
                  >
                    <span style={S.templateItemTitle}>{item.title}</span>
                    <span style={S.templateActions}>
                      <button
                        type="button"
                        style={S.templateEditBtn}
                        disabled={!templatesEnabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!templatesEnabled) return;
                          openTemplateEditor(item.id);
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        title="Edit template"
                      >
                        ✎
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <div style={S.genRow}>
          <button style={{ ...S.genBtn, opacity: canGenerate ? 1 : 0.5 }}
            disabled={!canGenerate} onClick={handleGenerate}>
            {isProcessing ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={S.btnSpin} /> Running {runningCount} · Queued {queueCount}</span> : taskMode === "compare" ? "⬡ Enqueue Compare Tasks" : "⬡ Enqueue Task"}
          </button>
          {hasAnySuccess && <button style={S.zipBtn} onClick={() => downloadAllAsZip(turns)}>↓ Download All Dialogs (.zip)</button>}
        </div>
        <div style={S.folderRow}>
          <button style={S.zipBtn} onClick={handlePickHistoryFolder} disabled={!folderSupported}>
            {historyDirHandle ? "Switch History Folder" : "Select History Folder"}
          </button>
          {historyDirHandle && (
            <button style={S.zipBtn} onClick={() => loadHistoryFromFolder(historyDirHandle)}>
              Reload Folder History
            </button>
          )}
          <span style={S.folderHint}>
            {folderSupported
              ? historyDirName
                ? `Connected: ${historyDirName}`
                : "No folder selected"
              : "Folder API unsupported in this browser"}
          </span>
        </div>
        {!!historyFolderMsg && <div style={S.folderMsg}>{historyFolderMsg}</div>}

        {activeTurn && (
          <section style={{ animation: "fadeIn 0.3s ease", marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              Current Dialog
            </h3>
            <TurnPanel
              turn={activeTurn}
              onPreview={setPreviewImage}
              onCancelModel={cancelModelTask}
              onDelete={deleteTurn}
              onReuse={reuseTurn}
              onHide={hideTurn}
              onSyncTemplate={syncTurnToTemplate}
              canSyncTemplate={templatesEnabled && !!activeTemplateId}
            />
          </section>
        )}

        {historyTurns.length > 0 && (
          <section style={{ marginTop: 8 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              History Dialogs
            </h3>
            <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.4)", padding: 12 }}>
              {visibleHistory.map((turn) => (
                <div key={turn.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <TurnPanel
                    turn={turn}
                    onPreview={setPreviewImage}
                    onCancelModel={cancelModelTask}
                    onDelete={deleteTurn}
                    onReuse={reuseTurn}
                    onHide={hideTurn}
                    onSyncTemplate={syncTurnToTemplate}
                    canSyncTemplate={templatesEnabled && !!activeTemplateId}
                  />
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
      <ApiKeyModal
        show={showApiModal}
        onClose={() => setShowApiModal(false)}
        apiKey={apiKey}
        draftApiKey={draftApiKey}
        setDraftApiKey={setDraftApiKey}
        onSave={handleSaveApiKey}
        saveStateText={apiKeySaveStateText}
      />
      <GptAssistModal
        show={showGptAssistModal}
        onClose={() => setShowGptAssistModal(false)}
        prompt={gptAssistPrompt}
        draftPrompt={draftGptAssistPrompt}
        setDraftPrompt={setDraftGptAssistPrompt}
        onSave={handleSaveGptAssistPrompt}
        saveStateText={gptAssistSaveStateText}
        canSave={canSaveGptAssistPrompt}
      />
      <TemplateEditorModal
        show={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        draft={templateDraft}
        setDraft={setTemplateDraft}
        onSave={saveTemplateDraft}
        canSave={!!templateDraft.title.trim() || !!templateDraft.body.trim() || !!templateDraft.backup.trim()}
      />
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
  headerActions: { display: "flex", alignItems: "center", gap: 12 },
  modeNav: { display: "flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" },
  modeTab: { padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", color: "#a1a1aa", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  modeTabActive: { background: "rgba(250,204,21,0.14)", color: "#facc15" },
  apiSwitchWrap: { position: "relative" },
  apiSwitchBtn: { height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#a1a1aa", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  apiSwitchBtnActive: { borderColor: "rgba(125,211,252,0.45)", color: "#7dd3fc", background: "rgba(125,211,252,0.08)" },
  settingsBtn: { width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  main: { position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "24px 20px 60px" },
  inputGrid: { display: "grid", gridTemplateColumns: "1fr 160px", gap: 16 },
  label: { display: "block", fontSize: 11, fontFamily: mono, fontWeight: 600, letterSpacing: 1.5, color: "#999", marginBottom: 8, textTransform: "uppercase" },
  promptHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" },
  promptHeadActions: { display: "flex", alignItems: "center", gap: 8 },
  inputHint: { fontSize: 12, color: "#71717a", fontFamily: mono },
  gptAssistBtn: { width: 16, height: 16, borderRadius: 4, border: "1px solid rgba(125,211,252,0.45)", background: "rgba(125,211,252,0.12)", color: "#7dd3fc", fontFamily: mono, fontSize: 10, lineHeight: "14px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  comparePromptGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  textarea: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", color: "#e4e4e7", fontFamily: sans, fontSize: 14, resize: "vertical", outline: "none", lineHeight: 1.6 },
  dropZone: { width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  uploadedBox: { position: "relative", width: "100%", height: 120, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" },
  uploadedThumb: { width: "100%", height: "100%", objectFit: "cover" },
  removeBtn: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  modelsPanel: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 10, height: "100%" },
  modelsHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  syncBtn: { padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(250,204,21,0.55)", background: "rgba(250,204,21,0.12)", color: "#fef08a", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  modelTemplateGrid: { display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 3fr)", gap: 12, alignItems: "stretch" },
  modelGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  imageSizePanel: { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 10px", background: "rgba(255,255,255,0.015)", marginTop: "auto" },
  imageSizeGroup: { display: "grid", gap: 6, marginBottom: 8 },
  imageSizeGroupTitle: { fontSize: 11, color: "#8b8b93", fontFamily: mono },
  imageSizeBtnRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  imageSizeBtn: { padding: "5px 8px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.03)", color: "#c4c4cc", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  imageSizeBtnActive: { borderColor: "rgba(34,211,238,0.65)", background: "rgba(34,211,238,0.16)", color: "#67e8f9" },
  imageSizeWarn: { margin: "2px 0 0", fontSize: 11, color: "#a1a1aa", fontFamily: mono, lineHeight: 1.5 },
  templatePanel: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.02)", height: "100%" },
  templatePanelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  templateStatus: { fontSize: 11, color: "#71717a", fontFamily: mono, marginBottom: 8 },
  templateList: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  templateItem: { width: "100%", border: "1px solid rgba(63,63,70,0.9)", borderRadius: 8, padding: "8px 8px 8px 10px", background: "rgba(12,12,14,0.9)", minHeight: 38, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", color: "#71717a", cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent", boxShadow: "none" },
  templateItemDisabled: { opacity: 0.55, cursor: "not-allowed" },
  templateItemActive: { borderColor: "rgba(34,211,238,0.85)", boxShadow: "none", background: "rgba(34,211,238,0.16)", color: "#67e8f9" },
  templateItemTitle: { fontSize: 11, color: "inherit", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 },
  templateActions: { display: "inline-flex", alignItems: "center", justifyContent: "center" },
  templateEditBtn: { width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(82,82,91,0.9)", background: "rgba(24,24,27,0.9)", color: "#a1a1aa", fontSize: 12, fontFamily: mono, cursor: "pointer", padding: 0, lineHeight: "24px", textAlign: "center", outline: "none" },
  modelChipWrap: { border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 6, background: "rgba(255,255,255,0.02)" },
  modelRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" },
  modelChip: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 8px", borderRadius: 7, border: "1px solid", color: "#e4e4e7", fontSize: 12, fontFamily: sans, transition: "all 0.15s", width: "100%", minHeight: 34 },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  chipName: { fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 },
  check: { marginLeft: "auto", color: "#10a37f", fontWeight: 700, fontSize: 14 },
  countRow: { display: "flex", alignItems: "center", gap: 4 },
  countLabel: { fontSize: 11, color: "#999", fontFamily: mono, width: 10, textAlign: "center" },
  countSelect: { width: 58, height: 34, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 12, outline: "none" },
  genRow: { display: "flex", gap: 12, marginBottom: 32, alignItems: "center" },
  folderRow: { display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" },
  folderHint: { fontSize: 12, color: "#a1a1aa", fontFamily: mono },
  folderMsg: { fontSize: 12, color: "#7dd3fc", marginBottom: 18, fontFamily: mono },
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
  thumb: { width: "100%", aspectRatio: "4 / 3", objectFit: "contain", cursor: "pointer", display: "block", background: "#0b0b0d" },
  dlBtn: { width: "100%", padding: "8px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)", color: "#aaa", fontSize: 12, fontFamily: mono, cursor: "pointer" },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.15s ease" },
  settingsModal: { width: "90%", maxWidth: 560, background: "#161618", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, maxHeight: "80vh", overflow: "auto" },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#aaa", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  fieldLabel: { display: "block", fontSize: 12, fontFamily: mono, fontWeight: 500, color: "#999", marginBottom: 6 },
  proxyInput: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 14, outline: "none" },
  hint: { fontSize: 12, color: "#888", marginTop: 8, lineHeight: 1.5 },
  toggleCodeBtn: { padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", fontSize: 12, fontFamily: mono, cursor: "pointer" },
  codeBlock: { marginTop: 12, padding: 16, background: "#0d0d0f", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 11, fontFamily: mono, color: "#a0a0b0", overflow: "auto", maxHeight: 300, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  apiModalActions: { marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  apiModalState: { fontSize: 12, color: "#a1a1aa", fontFamily: mono },
  apiSaveBtn: { padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(16,163,127,0.5)", background: "rgba(16,163,127,0.15)", color: "#6ee7b7", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  turnActionBtn: { height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontSize: 11, fontFamily: mono, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  turnPromptRow: { marginBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  turnModeBadge: { display: "inline-flex", alignItems: "center", marginLeft: 8, padding: "2px 8px", borderRadius: 999, background: "rgba(59,130,246,0.12)", color: "#93c5fd", fontSize: 11, fontFamily: mono },
  turnPromptCards: { flex: "1 1 320px", minWidth: 220, display: "grid", gap: 10 },
  turnPromptCard: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: "12px 14px" },
  turnPromptBadge: { display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: "rgba(250,204,21,0.12)", color: "#facc15", fontSize: 10, fontFamily: mono, marginBottom: 8 },
  turnPromptText: { fontSize: 13, color: "#e4e4e7", whiteSpace: "pre-wrap", lineHeight: 1.5 },
  turnCompareResultsGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  turnResultGroup: { marginTop: 16 },
  turnResultGroupHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" },
  turnResultMeta: { fontSize: 11, color: "#71717a", fontFamily: mono },
  turnRefImageBtn: { width: 96, height: 96, borderRadius: 8, padding: 0, border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", background: "transparent", cursor: "zoom-in", flexShrink: 0 },
  turnRefImage: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
};
