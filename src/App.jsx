import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ─── DeerAPI Model Registry ───
// Each model has its own apiType defining which DeerAPI endpoint/format to use
const IMAGE_MODELS = [
  // Seedream — /v1/images/generations (豆包生图)
  { id: "doubao-seedream-4-0-250828", name: "Seedream 4.0", shortName: "Seed 4.0", provider: "ByteDance", apiType: "images" },
  { id: "doubao-seedream-4-5-251128", name: "Seedream 4.5", shortName: "Seed 4.5", provider: "ByteDance", apiType: "images", badge: "NEW" },
  { id: "doubao-seedream-5-0-260128", name: "Seedream 5.0 Lite", shortName: "Seed 5", provider: "ByteDance", apiType: "images", badge: "NEW" },
  // Midjourney via /mj
  { id: "midjourney-imagine", name: "Midjourney Imagine", shortName: "Midjourney", provider: "Midjourney", apiType: "midjourney", badge: "BETA" },
  // GPT‑1.5 image — 依旧走 /v1/images/generations
  { id: "gpt-image-1.5", name: "GPT‑1.5 Image", shortName: "GPT-1.5", provider: "OpenAI", apiType: "images", badge: "HOT" },
  // NanoBanana 系列：本质调用 Gemini 图像模型
  { id: "gemini-2.5-flash-image", name: "NanoBanana", shortName: "Nano", provider: "Google", apiType: "gemini", badge: "HOT" },
  { id: "gemini-3.1-flash-image-preview", name: "NanoBanana 2", shortName: "Nano 2", provider: "Google", apiType: "gemini", badge: "NEW" },
  { id: "gemini-3-pro-image", name: "NanoBanana Pro", shortName: "Nano Pro", provider: "Google", apiType: "gemini", badge: "PRO" },
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
  "gemini-3-pro-image",
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
const DEFAULT_STYLE_THEME_ASSIST_PROMPT =
  "你是主题联想助手。用户会给你一个主题词，请输出12个可用于视觉创作的相关元素，要求具体、可见、彼此有区分。只输出JSON：{\"themes\":[\"...\", \"...\"]}，数组长度必须为12。";
const PROMPT_EDITOR_MIN_HEIGHT = 104;
const MAX_TEMPLATES = 8;
const MAX_STYLE_TEMPLATES = 2;
const STYLE_THEME_SLOTS = 12;
const MAX_STYLE_REFERENCE_IMAGES = 4;
const MAX_ATLAS_SELECTED_IMAGES = 20;
const MAX_INPUT_IMAGES_PER_BATCH = 10;
const TEMPLATE_FILE_NAME = "templates.json";
const STYLE_TEMPLATE_FILE_NAME = "style-templates.json";
const GPT_ASSIST_FILE_NAME = "gpt-assist.json";
const API_CONFIG_FILE_NAME = "api-config.json";
const DEFAULT_TEMPLATES = Array.from({ length: MAX_TEMPLATES }, (_, index) => ({
  id: `template-${index + 1}`,
  title: `Preset ${index + 1}`,
  body: "",
  backup: "",
  memo: "",
}));
const DEFAULT_STYLE_TEMPLATES = Array.from({ length: MAX_STYLE_TEMPLATES }, (_, index) => ({
  id: `style-template-${index + 1}`,
  title: `Style ${index + 1}`,
  body: "",
}));
const DEFAULT_STYLE_THEMES = Array.from({ length: STYLE_THEME_SLOTS }, () => "");
const NANO_PRO_OFFICIAL_MODEL_ID = "gemini-3-pro-image";
const NANO_PRO_LEGACY_MODEL_IDS = ["nano-banana-pro-all", "gemini-3-pro-preview"];

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

    const requestApiKey = normalizeApiKey(request.headers.get("X-Api-Key") || "");
    const fallbackApiKey = normalizeApiKey(env.DEERAPI_KEY || "");
    const apiKey = requestApiKey || fallbackApiKey;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key missing. Provide X-Api-Key or configure DEERAPI_KEY." }), { status: 400 });
    }

    const isGemini = targetPath.includes("/v1beta/");
    const primaryAuth = isGemini ? apiKey : \`Bearer \${apiKey}\`;
    const fallbackAuth = isGemini ? \`Bearer \${apiKey}\` : apiKey;
    const baseHeaders = {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-Goog-Api-Key": apiKey,
    };

    const forward = (authorization) =>
      fetch(\`\${upstreamBase}\${targetPath}\`, {
        method: "POST",
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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Target-Path, X-Image-Url, X-Upstream-Base, X-Api-Key",
      },
    });
  },
};

const DEFAULT_UPSTREAM_BASE = "https://api.deerapi.com";

function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  next = next.replace(/^authorization\\s*:\\s*/i, "").trim();
  next = next.replace(/^x-goog-api-key\\s*:\\s*/i, "").trim();
  next = next.replace(/^bearer\\s+/i, "").trim();
  next = next.replace(/^[\"']+|[\"']+$/g, "").trim();
  return next;
}

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
  const m = dataUrl?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
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
  let next = value.trim();
  if (!next) return "";
  next = next.replace(/^authorization\s*:\s*/i, "").trim();
  next = next.replace(/^x-goog-api-key\s*:\s*/i, "").trim();
  next = next.replace(/^bearer\s+/i, "").trim();
  next = next.replace(/^["']+|["']+$/g, "").trim();
  return next;
}

function normalizeAspectRatio(value) {
  if (typeof value !== "string") return DEFAULT_ASPECT_RATIO;
  const normalized = value.trim();
  if (!normalized) return DEFAULT_ASPECT_RATIO;
  return ASPECT_RATIO_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_ASPECT_RATIO;
}

function normalizeModelId(id) {
  if (typeof id !== "string") return id;
  if (NANO_PRO_LEGACY_MODEL_IDS.includes(id)) return NANO_PRO_OFFICIAL_MODEL_ID;
  return id;
}

function getGeminiModelCandidates(id) {
  const normalized = normalizeModelId(id);
  if (normalized !== NANO_PRO_OFFICIAL_MODEL_ID) return [normalized];
  return [NANO_PRO_OFFICIAL_MODEL_ID, ...NANO_PRO_LEGACY_MODEL_IDS];
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

function normalizeStyleThemeAssistPrompt(value) {
  if (typeof value !== "string") return DEFAULT_STYLE_THEME_ASSIST_PROMPT;
  const next = value.trim();
  return next || DEFAULT_STYLE_THEME_ASSIST_PROMPT;
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
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, original) => {
    const next = replacements[cursor];
    cursor += 1;
    const fallback = typeof original === "string" ? original : "";
    return `{{${typeof next === "string" ? next.trim() : fallback}}}`;
  });
}

function clearPlaceholderValues(input = "") {
  const text = typeof input === "string" ? input : "";
  return text.replace(/\{\{[^{}]*\}\}/g, "{{}}");
}

function expandPlaceholderValues(input = "") {
  const text = typeof input === "string" ? input : "";
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => String(inner ?? "").trim());
}

function splitPromptByPlaceholders(input = "") {
  const text = typeof input === "string" ? input : "";
  const chunks = [];
  const regex = /\{\{([^{}]*)\}\}/g;
  let last = 0;
  let match = regex.exec(text);
  while (match) {
    if (match.index > last) {
      chunks.push({ type: "text", value: text.slice(last, match.index) });
    }
    chunks.push({ type: "placeholder", value: typeof match[1] === "string" ? match[1] : "" });
    last = match.index + match[0].length;
    match = regex.exec(text);
  }
  if (last < text.length) {
    chunks.push({ type: "text", value: text.slice(last) });
  }
  return chunks;
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

function parseThemeSuggestions(rawText = "") {
  const parsed = parseJsonFromText(rawText);
  const listFromJson = Array.isArray(parsed?.themes)
    ? parsed.themes
    : Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed)
    ? parsed
    : [];

  const fallback = String(rawText || "")
    .split(/[\n,，、;；]/g)
    .map((item) => item.replace(/^[\-\d\.\)\s]+/, "").trim())
    .filter(Boolean);

  const merged = [...listFromJson, ...fallback]
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter(Boolean);

  const deduped = [];
  merged.forEach((item) => {
    if (!item || deduped.includes(item)) return;
    deduped.push(item);
  });

  return deduped.slice(0, STYLE_THEME_SLOTS);
}

function normalizeImageInputs(imageBase64, imageInputs = []) {
  const collected = [];
  if (typeof imageBase64 === "string" && imageBase64.trim()) collected.push(imageBase64.trim());
  if (Array.isArray(imageInputs)) {
    imageInputs.forEach((item) => {
      if (typeof item === "string" && item.trim()) collected.push(item.trim());
    });
  }
  return Array.from(new Set(collected));
}

function injectThemeIntoPrompt(basePrompt = "", theme = "") {
  const promptText = typeof basePrompt === "string" ? basePrompt : "";
  const themeText = typeof theme === "string" ? theme.trim() : "";
  if (!themeText) return promptText;
  if (!promptText.trim()) return promptText;
  if (/\{\{[^{}]*\}\}/.test(promptText)) {
    return promptText.replace(/\{\{[^{}]*\}\}/, themeText);
  }
  return `${promptText}\nTheme: ${themeText}`;
}

function buildStylePromptVariants(basePrompt = "", themes = []) {
  const cleanedBase = typeof basePrompt === "string" ? basePrompt : "";
  const cleanedThemes = (Array.isArray(themes) ? themes : [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, STYLE_THEME_SLOTS);
  if (!cleanedBase.trim() || !cleanedThemes.length) {
    return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: cleanedBase }, 0)];
  }
  return cleanedThemes.map((theme, index) =>
    normalizePromptVariant({
      key: `theme-${index + 1}`,
      label: theme,
      prompt: injectThemeIntoPrompt(cleanedBase, theme),
    }, index + 1)
  );
}

function formatAtlasFolderName(items = []) {
  const themes = Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => (typeof item?.theme === "string" ? item.theme.trim() : ""))
        .filter(Boolean)
    )
  );
  const themePart = themes.slice(0, 3).map((item) => safeName(item)).filter(Boolean).join("_");
  return themePart ? `atlas-${Date.now()}-${themePart}` : `atlas-${Date.now()}`;
}

function buildAtlasImageFileStem(item, index = 0) {
  const theme = safeName(item?.theme || `theme_${index + 1}`);
  const model = safeName(item?.modelName || item?.modelId || "model");
  return `${String(index + 1).padStart(2, "0")}_${theme}_${model}`;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function createAtlasThumbnailDataUrl(imageSources = [], options = {}) {
  const sources = (Array.isArray(imageSources) ? imageSources : [])
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, MAX_ATLAS_SELECTED_IMAGES);
  if (!sources.length) return null;

  const rows = Math.max(1, Number(options.rows) || 3);
  const cols = Math.max(1, Math.ceil(sources.length / rows));
  const cellWidth = Math.max(120, Number(options.cellWidth) || 256);
  const cellHeight = Math.max(120, Number(options.cellHeight) || 256);

  const canvas = document.createElement("canvas");
  canvas.width = cols * cellWidth;
  canvas.height = rows * cellHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  for (let index = 0; index < sources.length; index += 1) {
    const src = sources[index];
    try {
      const image = await loadImageElement(src);
      const row = index % rows;
      const col = Math.floor(index / rows);
      const x = col * cellWidth;
      const y = row * cellHeight;
      const scale = Math.max(cellWidth / image.width, cellHeight / image.height);
      const drawWidth = Math.max(1, Math.floor(image.width * scale));
      const drawHeight = Math.max(1, Math.floor(image.height * scale));
      const dx = x + Math.floor((cellWidth - drawWidth) / 2);
      const dy = y + Math.floor((cellHeight - drawHeight) / 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cellWidth, cellHeight);
      ctx.clip();
      ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
      ctx.restore();
    } catch {}
  }

  return canvas.toDataURL("image/png");
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

function getComposerPromptVariants(taskMode, prompt, comparePrompts, styleThemes = []) {
  if (taskMode === "compare") {
    return [
      normalizePromptVariant({ key: "a", label: "PROMPT A", prompt: comparePrompts?.a || "" }, 1),
      normalizePromptVariant({ key: "b", label: "PROMPT B", prompt: comparePrompts?.b || "" }, 2),
    ];
  }
  if (taskMode === "style") {
    return buildStylePromptVariants(prompt, styleThemes);
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
  if (turn?.mode === "style") return "style";
  if (turn?.mode === "compare") return "compare";
  if (turn?.mode === "single") return "single";
  return getTurnPromptVariants(turn).length > 1 ? "compare" : "single";
}

function getResultPromptKey(result) {
  return typeof result?.promptKey === "string" && result.promptKey ? result.promptKey : "single";
}

function buildTurnImageKey(turnId, modelId, promptKey = "single", index = 1) {
  return `${turnId}:${modelId}:${promptKey || "single"}:${Math.max(1, Number(index) || 1)}`;
}

function buildTurnTaskKey(turnId, modelId, promptKey = "single") {
  return `${turnId}:${modelId}:${promptKey || "single"}`;
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
  const raw = String(input ?? "").trim();
  if (!raw) return "unknown";
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return cleaned || "unknown";
}

function buildResultFileStem(result) {
  const rawPromptKey = getResultPromptKey(result);
  const promptKey = safeName(rawPromptKey);
  const promptLabel = safeName(result?.promptLabel || "");
  const promptPrefix =
    rawPromptKey !== "single"
      ? `${promptKey}${promptLabel !== "unknown" ? `_${promptLabel}` : ""}_`
      : "";
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
    memo: typeof input?.memo === "string" ? input.memo : "",
  };
}

function normalizeTemplates(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_TEMPLATES.map((preset, index) => {
    const found = list.find((item) => item?.id === preset.id);
    return normalizeTemplate(found || preset, index);
  });
}

function normalizeStyleTemplate(input, index = 0) {
  const fallbackId = `style-template-${index + 1}`;
  const id = typeof input?.id === "string" && input.id ? input.id : fallbackId;
  const title = typeof input?.title === "string" && input.title.trim()
    ? input.title.trim()
    : `Style ${index + 1}`;
  return {
    id,
    title,
    body: typeof input?.body === "string" ? input.body : "",
  };
}

function normalizeStyleTemplates(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_STYLE_TEMPLATES.map((preset, index) => {
    const found = list.find((item) => item?.id === preset.id);
    return normalizeStyleTemplate(found || preset, index);
  });
}

function pickStyleTemplateId(templates, preferredId) {
  if (!templates.length) return null;
  if (typeof preferredId === "string" && preferredId && templates.some((item) => item.id === preferredId)) return preferredId;
  return null;
}

function normalizeStyleThemes(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_STYLE_THEMES.map((_, index) => {
    const next = list[index];
    return typeof next === "string" ? next : "";
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
  const styleReferenceImageFiles = [];
  const styleReferenceImages = Array.isArray(turn.styleReferenceImages) ? turn.styleReferenceImages : [];
  for (let index = 0; index < Math.min(styleReferenceImages.length, MAX_STYLE_REFERENCE_IMAGES); index += 1) {
    const image = styleReferenceImages[index];
    if (typeof image !== "string" || !image) continue;
    const fromData = dataUrlToBytes(image);
    if (fromData) {
      const fileName = `style_reference_${index + 1}.${fromData.ext}`;
      await writeBinaryFile(turnDir, fileName, fromData.bytes);
      styleReferenceImageFiles.push(fileName);
      continue;
    }
    if (/^https?:\/\//i.test(image)) {
      try {
        const remote = await fetchImageBytes(image);
        const fileName = `style_reference_${index + 1}.${remote.ext}`;
        await writeBinaryFile(turnDir, fileName, remote.bytes);
        styleReferenceImageFiles.push(fileName);
      } catch {
        const fileName = `style_reference_${index + 1}.txt`;
        await writeTextFile(turnDir, fileName, image);
        styleReferenceImageFiles.push(fileName);
      }
    }
  }
  const manifest = {
    id: turn.id,
    seq: turn.seq,
    createdAt: turn.createdAt,
    mode: getTurnMode(turn),
    prompt: turn.prompt || promptVariants[0]?.prompt || "",
    styleBasePrompt: typeof turn.styleBasePrompt === "string" ? turn.styleBasePrompt : "",
    styleThemes: normalizeStyleThemes(turn.styleThemes),
    promptVariants,
    apiBaseUrl: resolveApiBaseUrl(turn.apiBaseUrl),
    apiKey: normalizeApiKey(turn.apiKey),
    aspectRatio: normalizeAspectRatio(turn.aspectRatio ?? turn.geminiAspectRatio),
    referenceImageFile,
    styleReferenceImageFiles,
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
      const styleReferenceImages = [];
      if (Array.isArray(meta.styleReferenceImageFiles)) {
        for (const fileName of meta.styleReferenceImageFiles.slice(0, MAX_STYLE_REFERENCE_IMAGES)) {
          if (typeof fileName !== "string" || !fileName) continue;
          try {
            const fh = await entryHandle.getFileHandle(fileName);
            const f = await fh.getFile();
            if (/\.txt$/i.test(fileName)) {
              const textUrl = (await f.text()).trim();
              if (textUrl) styleReferenceImages.push(textUrl);
            } else {
              const dataUrl = await fileToDataUrlFromFile(f);
              if (typeof dataUrl === "string") styleReferenceImages.push(dataUrl);
            }
          } catch {}
        }
      } else if (Array.isArray(meta.styleReferenceImages)) {
        meta.styleReferenceImages
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean)
          .slice(0, MAX_STYLE_REFERENCE_IMAGES)
          .forEach((item) => styleReferenceImages.push(item));
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
          modelId: normalizeModelId(r.modelId || "unknown-model"),
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
        mode:
          meta.mode === "style"
            ? "style"
            : meta.mode === "compare" || promptVariants.length > 1
            ? "compare"
            : "single",
        prompt: meta.prompt || promptVariants[0]?.prompt || "",
        styleBasePrompt:
          typeof meta.styleBasePrompt === "string"
            ? meta.styleBasePrompt
            : meta.prompt || promptVariants[0]?.prompt || "",
        styleThemes: normalizeStyleThemes(meta.styleThemes),
        promptVariants,
        apiBaseUrl: resolveApiBaseUrl(meta.apiBaseUrl),
        apiKey: normalizeApiKey(meta.apiKey),
        aspectRatio: normalizeAspectRatio(meta.aspectRatio ?? meta.geminiAspectRatio),
        referenceImage,
        styleReferenceImages,
        selectedModelIds: Array.isArray(meta.selectedModelIds)
          ? meta.selectedModelIds.map((id) => normalizeModelId(id))
          : loadedResults.map((r) => r.modelId),
        modelCounts:
          meta.modelCounts && typeof meta.modelCounts === "object"
            ? {
                ...meta.modelCounts,
                ...(typeof meta.modelCounts["nano-banana-pro-all"] === "number" &&
                typeof meta.modelCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number"
                  ? { [NANO_PRO_OFFICIAL_MODEL_ID]: meta.modelCounts["nano-banana-pro-all"] }
                  : null),
                ...(typeof meta.modelCounts["gemini-3-pro-preview"] === "number" &&
                typeof meta.modelCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number"
                  ? { [NANO_PRO_OFFICIAL_MODEL_ID]: meta.modelCounts["gemini-3-pro-preview"] }
                  : null),
              }
            : {},
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

async function loadStyleTemplatesFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(STYLE_TEMPLATE_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    const templates = normalizeStyleTemplates(raw?.templates);
    const activeTemplateId = pickStyleTemplateId(templates, raw?.activeTemplateId);
    return { templates, activeTemplateId };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") return null;
    const templates = normalizeStyleTemplates(DEFAULT_STYLE_TEMPLATES);
    return { templates, activeTemplateId: templates[0]?.id || null };
  }
}

async function saveStyleTemplatesToLocalFolder(rootHandle, templates, activeTemplateId) {
  const normalized = normalizeStyleTemplates(templates);
  const safeActiveId = pickStyleTemplateId(normalized, activeTemplateId);
  await writeTextFile(
    rootHandle,
    STYLE_TEMPLATE_FILE_NAME,
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
    return {
      prompt: normalizeGptAssistPrompt(raw?.prompt),
      styleThemePrompt: normalizeStyleThemeAssistPrompt(raw?.styleThemePrompt),
    };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") {
      return {
        prompt: DEFAULT_GPT_ASSIST_PROMPT,
        styleThemePrompt: DEFAULT_STYLE_THEME_ASSIST_PROMPT,
      };
    }
    return {
      prompt: DEFAULT_GPT_ASSIST_PROMPT,
      styleThemePrompt: DEFAULT_STYLE_THEME_ASSIST_PROMPT,
    };
  }
}

async function saveGptAssistToLocalFolder(rootHandle, prompt, styleThemePrompt) {
  const normalizedPrompt = normalizeGptAssistPrompt(prompt);
  const normalizedStyleThemePrompt = normalizeStyleThemeAssistPrompt(styleThemePrompt);
  await writeTextFile(
    rootHandle,
    GPT_ASSIST_FILE_NAME,
    JSON.stringify(
      {
        prompt: normalizedPrompt,
        styleThemePrompt: normalizedStyleThemePrompt,
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

async function callThemeAssistAPI(proxyUrl, seedText, assistPrompt, options = {}) {
  const { signal } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const normalizedSeed = typeof seedText === "string" ? seedText.trim() : "";
  if (!normalizedSeed) return [];

  const body = {
    model: DEFAULT_GPT_ASSIST_MODEL,
    stream: false,
    temperature: 1.1,
    messages: [
      { role: "system", content: normalizeStyleThemeAssistPrompt(assistPrompt) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `主题词：${normalizedSeed}`,
              `请输出 ${STYLE_THEME_SLOTS} 个与主题相关、可用于生图的视觉元素。`,
              "请严格输出 JSON。",
            ].join("\n"),
          },
        ],
      },
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
  return parseThemeSuggestions(rawText);
}

// 1. OpenAI Chat Completions format (gpt-4o-image, gpt-5-image)
async function callChatAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const content = [];
  if (prompt) content.push({ type: "text", text: prompt });
  imageInputs.forEach((image) => {
    content.push({ type: "image_url", image_url: { url: image } });
  });
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
    const urlRe = /https?:\/\/[^\s"')]+/gi;
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
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const primaryImage = imageInputs[0] || "";
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
  if (primaryImage && isSeedream) {
    body.image = primaryImage;
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
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const resolvedImageInputs = await Promise.all(
    imageInputs.map(async (image) => {
      const normalized = normalizeImageValue(image, apiBaseUrl);
      if (!normalized) return null;
      if (normalized.startsWith("data:image/")) return normalized;
      if (!/^https?:\/\//i.test(normalized)) return null;
      const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
      const resolved = normalizeImageValue(proxied, apiBaseUrl);
      return resolved?.startsWith("data:image/") ? resolved : null;
    })
  );
  const parts = [];
  if (prompt) parts.push({ text: prompt });
  if (!prompt && !resolvedImageInputs.filter(Boolean).length) parts.push({ text: "Generate a creative image" });
  resolvedImageInputs.filter(Boolean).forEach((image) => {
    const mimeType = getMimeFromDataUrl(image);
    const data = stripBase64Prefix(image);
    parts.push({
      inlineData: { mimeType, data },
      inline_data: { mime_type: mimeType, data },
    });
  });

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
  const modelCandidates = getGeminiModelCandidates(model.id);
  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    const currentModelId = modelCandidates[modelIndex];
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const resp = await fetch(proxyUrl, {
        method: "POST",
        headers: buildProxyHeaders(`/v1beta/models/${currentModelId}:generateContent`, apiBaseUrl, apiKey, { "Content-Type": "application/json" }),
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
      const channelUnavailable = /无可用渠道|更换分组尝试/i.test(text);
      const canTryFallbackModel = channelUnavailable && modelIndex < modelCandidates.length - 1;
      if (canTryFallbackModel) break;
      if (resp.status !== 524 || attempt >= maxAttempts) break;
      await sleep(1000 * attempt, signal);
    }
  }
  throw lastErr || new Error("Gemini request failed");
}
// 4. Midjourney imagine + fetch（按接口文档，只显示 1 张）
async function callMidjourneyAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
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
    if (imageInputs.length) submitBody.base64Array = imageInputs.map((item) => stripBase64Prefix(item)).filter(Boolean);

    const submitResp = await fetch(proxyUrl, {
      method: "POST",
      headers: buildProxyHeaders("/mj/submit/imagine", apiBaseUrl, apiKey, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(submitBody),
      signal,
    });
    const rawText = await submitResp.text();
    let submitData = null;
    try {
      submitData = rawText ? JSON.parse(rawText) : null;
    } catch {}
    return {
      ok: submitResp.ok,
      status: submitResp.status,
      text: rawText,
      submitData,
      taskId: extractTaskId(submitData),
    };
  }

  const requested = Math.max(1, Number(count) || 1);
  const allImages = [];
  for (let idx = 0; idx < requested; idx += 1) {
    let submitData = null;
    let taskId = null;
    let submitError = null;
    for (const botType of ["mj", "MID_JOURNEY"]) {
      const submit = await submitWithBotType(botType);
      submitData = submit.submitData;
      taskId = submit.taskId;
      if (submit.ok && taskId) break;
      const bodyText = (typeof submit.text === "string" ? submit.text : "").slice(0, 300);
      submitError = new Error(`API ${submit.status}: ${bodyText || JSON.stringify(submit.submitData || {})}`);
    }
    if (!taskId) {
      if (submitError) throw submitError;
      throw new Error(`Midjourney 未返回任务 ID: ${JSON.stringify(submitData).slice(0, 500)}`);
    }

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
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const primaryImage = imageInputs[0] || "";
  if (!prompt) throw new Error("NanoBanana 需要文字 prompt");

  const models = "nanobanana";

  const submitBody = {
    input: {
      prompt,
      num_outputs: Math.max(1, Number(count) || 1),
    },
  };
  if (primaryImage) {
    submitBody.input.image = primaryImage;
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
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const primaryImage = imageInputs[0] || "";
  const expandedPrompt = expandPlaceholderValues(prompt || "");
  const promptWithAspectRatio =
    model.apiType === "gemini"
      ? expandedPrompt.trim()
      : mergePromptWithAspectRatio(expandedPrompt, aspectRatio, model);
  const nextOptions = { ...options, aspectRatio, imageInputs };
  switch (model.apiType) {
    case "chat": {
      const all = [];
      for (let i = 0; i < requested; i += 1) {
        const one = await callChatAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, nextOptions);
        if (Array.isArray(one) && one.length) all.push(...one.slice(0, 1));
      }
      return all;
    }
    case "images":
      return callImagesAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    case "gemini": {
      const all = [];
      let lastErr = null;
      let attempts = 0;
      const maxAttempts = Math.max(3, requested * 3);
      while (all.length < requested && attempts < maxAttempts) {
        attempts += 1;
        try {
          const one = await callGeminiAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, nextOptions);
          if (Array.isArray(one) && one.length) {
            all.push(...one.slice(0, 1));
            continue;
          }
          lastErr = new Error("API 200: No images returned");
        } catch (err) {
          lastErr = err;
          const message = String(err?.message || "");
          const retryable = /No images returned|API 429|API 503|temporarily unavailable|RESOURCE_EXHAUSTED|overloaded|timeout/i.test(message);
          if (!retryable || attempts >= maxAttempts) throw err;
        }
      }
      if (all.length) {
        return all.slice(0, requested);
      }
      throw lastErr || new Error("Gemini request failed");
    }
    case "midjourney":
      return callMidjourneyAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    case "replicate":
      return callReplicateNanoBananaAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    default:
      throw new Error(`Unknown apiType: ${model.apiType}`);
  }
}

// ─── Components ───
function PromptTextWithChips({ text }) {
  const chunks = splitPromptByPlaceholders(text);
  if (!chunks.length) return <span>(no prompt)</span>;
  return (
    <>
      {chunks.map((chunk, idx) => (
        chunk.type === "placeholder"
          ? <span key={`ph-${idx}`} style={S.promptChipReadonly}>{chunk.value || " "}</span>
          : <span key={`tx-${idx}`}>{chunk.value}</span>
      ))}
    </>
  );
}

function getPromptPreviewText(text, maxChars = 220) {
  const source = typeof text === "string" ? text : "";
  if (!source) return "";
  if (source.length <= maxChars) return source;
  return `${source.slice(0, maxChars).trimEnd()}…`;
}

function TokenPromptInput({ value, onChange, onKeyDown, onFocus, placeholder, rows = 4, editorRef }) {
  const rootRef = useRef(null);
  const selfUpdateRef = useRef(false);
  const internalValueRef = useRef(typeof value === "string" ? value : "");
  const activeChipRef = useRef(null);
  const zeroWidth = "\u200b";

  const setChipEditingState = useCallback((chip, editing) => {
    if (!chip) return;
    chip.contentEditable = editing ? "true" : "false";
    chip.style.background = editing ? "rgba(59,130,246,0.34)" : "rgba(59,130,246,0.24)";
    chip.style.borderColor = editing ? "rgba(147,197,253,0.95)" : "rgba(96,165,250,0.65)";
  }, []);

  const deactivateAllChips = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const chips = root.querySelectorAll('[data-placeholder-chip="1"]');
    chips.forEach((chip) => setChipEditingState(chip, false));
    activeChipRef.current = null;
  }, [setChipEditingState]);

  const renderValueToDom = useCallback((nextValue) => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = "";
    const chunks = splitPromptByPlaceholders(nextValue);
    if (!chunks.length) return;
    chunks.forEach((chunk) => {
      if (chunk.type === "placeholder") {
        const span = document.createElement("span");
        span.setAttribute("data-placeholder-chip", "1");
        span.style.background = "rgba(59,130,246,0.24)";
        span.style.color = "#bfdbfe";
        span.style.border = "1px solid rgba(96,165,250,0.65)";
        span.style.borderRadius = "6px";
        span.style.padding = "1px 6px";
        span.style.display = "inline-block";
        span.style.minWidth = "12px";
        span.style.margin = "0 1px";
        span.contentEditable = "false";
        span.textContent = chunk.value || zeroWidth;
        root.appendChild(span);
        return;
      }
      root.appendChild(document.createTextNode(chunk.value));
    });
  }, []);

  const serializeDomToValue = useCallback(() => {
    const root = rootRef.current;
    if (!root) return "";
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.textContent || "");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node;
      if (element.hasAttribute("data-placeholder-chip")) {
        const raw = (element.textContent || "").replaceAll(zeroWidth, "");
        out.push(`{{${raw}}}`);
        return;
      }
      const tag = element.tagName;
      if (tag === "BR") {
        out.push("\n");
        return;
      }
      const childNodes = Array.from(element.childNodes);
      childNodes.forEach((child) => walk(child));
      if (tag === "DIV" || tag === "P") out.push("\n");
    };
    Array.from(root.childNodes).forEach((child) => walk(child));
    return out.join("").replace(/\n{3,}/g, "\n\n");
  }, []);

  const moveCaretInside = useCallback((element) => {
    if (!element) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    const textNode = element.firstChild;
    if (!textNode) {
      element.appendChild(document.createTextNode(zeroWidth));
    }
    const target = element.firstChild;
    const len = target?.textContent?.length || 0;
    range.setStart(target, len);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const syncValueFromDom = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      const chips = root.querySelectorAll('[data-placeholder-chip="1"]');
      chips.forEach((chip) => {
        if (!chip.textContent || chip.textContent.length === 0) {
          chip.textContent = zeroWidth;
        }
      });
    }
    const next = serializeDomToValue();
    internalValueRef.current = next;
    selfUpdateRef.current = true;
    onChange?.(next);
  }, [onChange, serializeDomToValue]);

  const findChipBeforeCaret = useCallback((range) => {
    const root = rootRef.current;
    if (!root || !range) return null;
    const container = range.startContainer;
    const offset = range.startOffset;

    const isChip = (node) =>
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      node.hasAttribute &&
      node.hasAttribute("data-placeholder-chip");

    if (container === root) {
      const prev = root.childNodes[offset - 1];
      return isChip(prev) ? prev : null;
    }

    if (container.nodeType === Node.TEXT_NODE) {
      if (offset > 0) return null;
      const prev = container.previousSibling;
      if (isChip(prev)) return prev;
      return null;
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      const prev = container.childNodes[offset - 1];
      return isChip(prev) ? prev : null;
    }

    return null;
  }, []);

  const insertPlaceholderAtCaret = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    root.focus();
    deactivateAllChips();
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      renderValueToDom(`${internalValueRef.current}{{}}`);
      internalValueRef.current = `${internalValueRef.current}{{}}`;
      onChange?.(internalValueRef.current);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) {
      const end = document.createRange();
      end.selectNodeContents(root);
      end.collapse(false);
      selection.removeAllRanges();
      selection.addRange(end);
    }
    const placeholderChip = document.createElement("span");
    placeholderChip.setAttribute("data-placeholder-chip", "1");
    placeholderChip.style.background = "rgba(59,130,246,0.24)";
    placeholderChip.style.color = "#bfdbfe";
    placeholderChip.style.border = "1px solid rgba(96,165,250,0.65)";
    placeholderChip.style.borderRadius = "6px";
    placeholderChip.style.padding = "1px 6px";
    placeholderChip.style.display = "inline-block";
    placeholderChip.style.minWidth = "12px";
    placeholderChip.style.margin = "0 1px";
    placeholderChip.contentEditable = "false";
    placeholderChip.textContent = zeroWidth;

    const liveRange = selection.getRangeAt(0);
    liveRange.deleteContents();
    liveRange.insertNode(placeholderChip);
    const after = document.createRange();
    after.setStartAfter(placeholderChip);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);
    const next = serializeDomToValue();
    internalValueRef.current = next;
    selfUpdateRef.current = true;
    onChange?.(next);
  }, [deactivateAllChips, onChange, renderValueToDom, serializeDomToValue]);

  const handleEditorKeyDown = useCallback((event) => {
    const root = rootRef.current;
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;

    if (root && range && selection && selection.isCollapsed) {
      const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
      const currentChip = startNode?.closest?.('[data-placeholder-chip="1"]');

      if ((event.key === "Backspace" || event.key === "Delete") && currentChip && root.contains(currentChip)) {
        const text = (currentChip.textContent || "").replaceAll(zeroWidth, "");
        if (text.length <= 1) {
          event.preventDefault();
          currentChip.textContent = zeroWidth;
          moveCaretInside(currentChip);
          syncValueFromDom();
          return;
        }
      }

      if (event.key === "Backspace" && !currentChip) {
        const chipBeforeCaret = findChipBeforeCaret(range);
        if (chipBeforeCaret && root.contains(chipBeforeCaret)) {
          event.preventDefault();
          const parent = chipBeforeCaret.parentNode;
          if (parent) {
            const index = Array.from(parent.childNodes).indexOf(chipBeforeCaret);
            chipBeforeCaret.remove();
            const nextRange = document.createRange();
            const safeOffset = Math.max(0, Math.min(index, parent.childNodes.length));
            nextRange.setStart(parent, safeOffset);
            nextRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(nextRange);
            syncValueFromDom();
          }
          return;
        }
      }
    }

    onKeyDown?.(event);
  }, [findChipBeforeCaret, moveCaretInside, onKeyDown, syncValueFromDom, zeroWidth]);

  useEffect(() => {
    if (selfUpdateRef.current) {
      selfUpdateRef.current = false;
      return;
    }
    const normalized = typeof value === "string" ? value : "";
    if (normalized === internalValueRef.current) return;
    internalValueRef.current = normalized;
    renderValueToDom(normalized);
  }, [renderValueToDom, value]);

  useEffect(() => {
    renderValueToDom(internalValueRef.current);
  }, [renderValueToDom]);

  const handleClick = useCallback((event) => {
    const root = rootRef.current;
    if (!root) return;
    const target = event.target instanceof Element ? event.target : null;
    const chip = target?.closest?.('[data-placeholder-chip="1"]');
    if (chip && root.contains(chip)) {
      deactivateAllChips();
      setChipEditingState(chip, true);
      activeChipRef.current = chip;
      moveCaretInside(chip);
      return;
    }
    deactivateAllChips();
  }, [deactivateAllChips, moveCaretInside, setChipEditingState]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = {
      insertPlaceholder: insertPlaceholderAtCaret,
    };
    return () => {
      if (editorRef.current?.insertPlaceholder === insertPlaceholderAtCaret) {
        editorRef.current = null;
      }
    };
  }, [editorRef, insertPlaceholderAtCaret]);

  const handleInput = useCallback(() => {
    syncValueFromDom();
  }, [syncValueFromDom]);

  const fixedHeight = Math.max(PROMPT_EDITOR_MIN_HEIGHT, rows * 24);

  return (
    <div
      ref={rootRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleEditorKeyDown}
      onClick={handleClick}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (!nextFocus || !(nextFocus instanceof Node) || !rootRef.current?.contains(nextFocus)) {
          deactivateAllChips();
        }
      }}
      onFocus={onFocus}
      data-placeholder={placeholder}
      style={{ ...S.tokenEditor, height: fixedHeight, maxHeight: fixedHeight, overflowY: "auto" }}
    />
  );
}

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

function GptAssistModal({
  show,
  onClose,
  prompt,
  draftPrompt,
  setDraftPrompt,
  styleThemePrompt,
  draftStyleThemePrompt,
  setDraftStyleThemePrompt,
  onSave,
  saveStateText,
  canSave,
}) {
  if (!show) return null;
  const isDirty =
    normalizeGptAssistPrompt(draftPrompt) !== normalizeGptAssistPrompt(prompt) ||
    normalizeStyleThemeAssistPrompt(draftStyleThemePrompt) !== normalizeStyleThemeAssistPrompt(styleThemePrompt);
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
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>Style Theme Association Instruction</label>
        <textarea
          style={S.textarea}
          value={draftStyleThemePrompt}
          onChange={(event) => setDraftStyleThemePrompt(event.target.value)}
          placeholder="告诉 GPT 如何联想 12 个主题元素..."
          rows={5}
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
        <p style={S.hint}>两套提示词都会存到历史文件夹（与模板相同），不会保存输入图。</p>
      </div>
    </div>
  );
}

function TemplateEditorModal({ show, onClose, draft, setDraft, onSave, canSave }) {
  const bodyEditorRef = useRef(null);
  const backupEditorRef = useRef(null);
  const memoEditorRef = useRef(null);

  const insertPlaceholderInTemplate = useCallback((field) => {
    if (field === "backup") {
      backupEditorRef.current?.insertPlaceholder?.();
      return;
    }
    if (field === "memo") {
      memoEditorRef.current?.insertPlaceholder?.();
      return;
    }
    bodyEditorRef.current?.insertPlaceholder?.();
  }, []);

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
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>Body</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("body")} title="插入占位框 {{ }}">【】</button>
        </div>
        <TokenPromptInput
          value={draft.body}
          onChange={(next) => setDraft((prev) => ({ ...prev, body: next }))}
          editorRef={bodyEditorRef}
          placeholder="Main template content"
          rows={4}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>Backup</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("backup")} title="插入占位框 {{ }}">【】</button>
        </div>
        <TokenPromptInput
          value={draft.backup}
          onChange={(next) => setDraft((prev) => ({ ...prev, backup: next }))}
          editorRef={backupEditorRef}
          placeholder="Backup template content"
          rows={4}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>Memo</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("memo")} title="插入占位框 {{ }}">【】</button>
        </div>
        <TokenPromptInput
          value={draft.memo}
          onChange={(next) => setDraft((prev) => ({ ...prev, memo: next }))}
          editorRef={memoEditorRef}
          placeholder="Notes, spare prompts, or copied backups"
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

function StyleTemplateEditorModal({ show, onClose, draft, setDraft, onSave, canSave }) {
  const bodyEditorRef = useRef(null);
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>Style Template</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>Title</label>
        <input
          style={S.proxyInput}
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Style template title"
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>Body</label>
          <button type="button" style={S.placeholderBtn} onClick={() => bodyEditorRef.current?.insertPlaceholder?.()} title="插入占位框 {{ }}">【】</button>
        </div>
        <TokenPromptInput
          value={draft.body}
          onChange={(next) => setDraft((prev) => ({ ...prev, body: next }))}
          editorRef={bodyEditorRef}
          placeholder="Style template prompt"
          rows={5}
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

function InputImagesModal({ show, onClose, title, images, maxCount, onUploadFiles, onRemoveAt }) {
  const fileInputRef = useRef(null);
  if (!show) return null;
  const safeImages = Array.isArray(images)
    ? images.filter((item) => typeof item === "string" && item).slice(0, Math.max(1, Number(maxCount) || 1))
    : [];
  const remainingCount = Math.max(0, (Math.max(1, Number(maxCount) || 1) - safeImages.length));

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.settingsModal, ...S.inputImagesModal }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{title || "Images"}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.modalInputImagesHint}>
          First slot is upload. Changes save automatically when you close.
        </div>
        <div style={S.modalInputImagesGrid}>
          <button
            type="button"
            style={{ ...S.modalInputImageEmpty, ...(remainingCount <= 0 ? S.modalInputImageEmptyDisabled : null) }}
            onClick={() => fileInputRef.current?.click()}
            disabled={remainingCount <= 0}
          >
            <span style={S.modalInputImageUploadPlus}>+</span>
            <span style={S.modalInputImageUploadText}>Upload</span>
          </button>
          {safeImages.map((image, index) => (
            <div key={`modal-image-${index}`} style={S.modalInputImageCell}>
              <img src={image} alt={`Input ${index + 1}`} style={S.modalInputImageThumb} />
              <button type="button" style={S.modalInputImageRemoveBtn} onClick={() => onRemoveAt(index)}>✕</button>
            </div>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={async (event) => {
            const files = Array.from(event.target.files || []).slice(0, remainingCount);
            if (files.length) await onUploadFiles(files);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function SelectionLimitModal({ show, onClose, limit }) {
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.selectionLimitModal} onClick={(event) => event.stopPropagation()}>
        <div style={S.selectionLimitTitle}>Selection limit reached</div>
        <div style={S.selectionLimitText}>You can select up to {limit} images for atlas export.</div>
      </div>
    </div>
  );
}

function ImageActionBar({ onSave, onRetry, onAppend, compact = false, busy = false, allowSave = true }) {
  const buttonStyle = compact ? S.imageActionBtnCompact : S.imageActionBtn;
  const iconStyle = compact ? S.imageActionIconCompact : S.imageActionIcon;
  const plusStyle = compact ? S.imageActionPlusCompact : S.imageActionPlus;
  return (
    <div style={{ ...S.imageActionBar, ...(compact ? S.imageActionBarCompact : null) }}>
      <button
        type="button"
        style={{ ...buttonStyle, ...(allowSave ? null : S.imageActionBtnDisabled) }}
        onClick={onSave}
        disabled={!allowSave}
        title="Save"
      >
        <span style={iconStyle}>↓</span>
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, ...(busy ? S.imageActionBtnBusy : null) }}
        onClick={onRetry}
        disabled={busy || typeof onRetry !== "function"}
        title="Retry"
      >
        <span style={iconStyle}>↻</span>
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, ...(busy ? S.imageActionBtnBusy : null) }}
        onClick={onAppend}
        disabled={busy || typeof onAppend !== "function"}
        title="Add one more"
      >
        <span style={plusStyle}>+1</span>
      </button>
    </div>
  );
}

function AtlasThumbnailModal({ show, onClose, items, onReorder, onGenerate, thumbnail, busy, onPreview }) {
  const [dragKey, setDragKey] = useState(null);

  useEffect(() => {
    if (!show) setDragKey(null);
  }, [show]);

  if (!show) return null;

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.settingsModal, maxWidth: 880 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>Thumbnail</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.atlasModalHint}>Drag to reorder. Atlas export and thumbnail follow this order.</div>
        {items.length ? (
          <div style={S.atlasModalGrid}>
            {items.map((item, index) => (
              <div
                key={item.key}
                draggable
                onDragStart={() => setDragKey(item.key)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!dragKey || dragKey === item.key) return;
                  onReorder?.(dragKey, item.key);
                  setDragKey(null);
                }}
                onDragEnd={() => setDragKey(null)}
                style={{
                  ...S.atlasModalCard,
                  ...(dragKey === item.key ? S.atlasModalCardDragging : null),
                }}
              >
                <div style={S.atlasModalCardOrder}>{index + 1}</div>
                <img src={item.image} alt={item.theme || item.modelName || `Selected ${index + 1}`} style={S.atlasModalCardThumb} />
                <div style={S.atlasModalCardMeta}>
                  <div style={S.atlasModalCardTitle}>{item.theme || item.modelName || `Image ${index + 1}`}</div>
                  <div style={S.atlasModalCardSub}>{item.modelName || item.modelId || "-"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={S.turnStyleImageEmpty}>No selected images yet.</div>
        )}
        <div style={{ ...S.modalInputImagesActions, justifyContent: "space-between", marginTop: 16 }}>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: thumbnail ? 1 : 0.5, cursor: thumbnail ? "pointer" : "not-allowed" }}
            onClick={() => thumbnail && onPreview?.(thumbnail)}
            disabled={!thumbnail}
          >
            Preview
          </button>
          <button
            type="button"
            style={{ ...S.apiSaveBtn, opacity: items.length ? 1 : 0.5, cursor: items.length ? "pointer" : "not-allowed" }}
            onClick={onGenerate}
            disabled={!items.length || busy}
          >
            {busy ? "Processing..." : thumbnail ? "Refresh Thumbnail" : "Generate Thumbnail"}
          </button>
        </div>
        {thumbnail && (
          <div style={S.atlasModalPreview}>
            <img src={thumbnail} alt="Atlas thumbnail" style={S.atlasModalPreviewImg} />
          </div>
        )}
      </div>
    </div>
  );
}

function HelpRichText({ text, style }) {
  const source = typeof text === "string" ? text : "";
  const parts = source.split(/(`[^`]+`)/g).filter(Boolean);
  return (
    <p style={style}>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={`${part}-${index}`} style={S.helpInlineCode}>
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </p>
  );
}

function HelpParagraphs({ text, style }) {
  const lines = Array.isArray(text)
    ? text.filter((item) => typeof item === "string" && item.trim())
    : [typeof text === "string" ? text : ""].filter((item) => item.trim());
  return (
    <div style={S.helpParagraphGroup}>
      {lines.map((line, index) => (
        <div key={`${line}-${index}`} style={S.helpParagraphItem}>
          <HelpRichText text={line} style={style} />
        </div>
      ))}
    </div>
  );
}

function HelpPage() {
  const sections = [
    {
      title: "Getting Started",
      fullWidth: true,
      en: [
        "There is no built-in account login inside this app.",
        "First sign in to DeerAPI on the web, create or copy your API key, open this app, click `API`, and paste the key.",
        "Then choose a `History Folder` if you want local history and templates, select a mode, pick models, fill prompt or images, and click `Enqueue Task`.",
      ],
      cn: [
        "这个工具本身没有内置账号登录页面。",
        "先去 DeerAPI 网页端登录，创建或复制你的 API Key；回到本工具后点击 `API` 填入密钥。",
        "如果你想保存本地历史和模板，再选择一个 `History Folder`；之后选择模式、勾选模型、填写提示词或上传图片，再点击 `Enqueue Task` 即可开始。",
      ],
    },
    {
      title: "Modes",
      en: [
        "`Single` runs one prompt across selected models.",
        "`Prompt Compare` runs prompt A and B with the same input image.",
        "`Style` runs one model across many themes with optional reference images.",
      ],
      cn: [
        "`Single` 会把一个提示词发给多个已选模型。",
        "`Prompt Compare` 会用同一张输入图同时运行 A、B 两套提示词。",
        "`Style` 会用一个模型批量跑多个主题词，并可搭配风格参考图。",
      ],
    },
    {
      title: "Image Actions",
      en: [
        "Each image has three actions: `Save` downloads it.",
        "`Retry` replaces that image with a new render.",
        "`+1` keeps the current images and adds one more render to the same task.",
      ],
      cn: [
        "每张图片下面都有三个操作：`Save` 下载当前图。",
        "`Retry` 会替换当前这张图。",
        "`+1` 会保留原图并在同一任务里再追加一张新图。",
      ],
    },
    {
      title: "GPT Assistant",
      en: [
        "The GPT assistant currently has two uses.",
        "In `Single` and `Prompt Compare`, click the small human button above the prompt box to rewrite only the text inside `{{ }}` while keeping the outer prompt unchanged.",
        "In `Style`, use the `GPT 12` assistant next to the theme seed input to expand one seed idea into 12 related visual themes.",
      ],
      cn: [
        "GPT 助手目前有两种用法。",
        "在 `Single` 和 `Prompt Compare` 中，点击提示词输入框上方的人形按钮，它只会改写 `{{ }}` 内的内容，不会改动外部提示词。",
        "在 `Style` 中，使用主题联想输入框旁边的 `GPT 12`，把一个主题种子扩展成 12 个相关视觉元素。",
      ],
    },
    {
      title: "Selections",
      en: [
        "Selections work across all pages and modes.",
        "You can keep up to 20 images selected at once, clear them together, and export them into one atlas folder.",
      ],
      cn: [
        "选图功能在所有页面和模式之间共用。",
        "你最多可以同时保留 20 张选中图片，并统一清空或一起导出到同一个 atlas 文件夹。",
      ],
    },
    {
      title: "History Folder",
      en: [
        "Templates, API key, GPT prompt, atlas exports, and history are tied to the selected history folder.",
        "Switching folders replaces the current loaded history instead of merging it.",
      ],
      cn: [
        "模板、API Key、GPT Prompt、atlas 导出和历史记录都会绑定到当前选中的历史文件夹。",
        "切换文件夹时，会直接替换当前历史，不会和旧内容混合。",
      ],
    },
    {
      title: "Inputs",
      en: [
        "Input images support multi-select uploads.",
        "The main input box uploads directly, while `Edit` opens a manager to add or remove images.",
        "In `Style`, reference images open their own editor modal.",
      ],
      cn: [
        "输入图支持一次多选上传。",
        "主输入框点击后会直接上传，`Edit` 会打开管理弹窗用于删除或新增图片。",
        "在 `Style` 里，参考图使用独立的编辑弹窗。",
      ],
    },
    {
      title: "Common Errors",
      en: [
        "`Failed to fetch` usually means the proxy URL, network, or API endpoint is unreachable.",
        "`No images returned` means the model accepted the request but did not return usable images, so you can try `Retry` or `+1`.",
        "If saving or export buttons do not work, first check whether a `History Folder` has been selected.",
      ],
      cn: [
        "`Failed to fetch` 通常表示代理地址、网络，或者 API 端点不可达。",
        "`No images returned` 表示模型接收了请求，但没有返回可用图片，这时可以尝试 `Retry` 或 `+1`。",
        "如果保存或导出按钮不能用，请先检查是否已经选择了 `History Folder`。",
      ],
    },
    {
      title: "Thumbnail",
      en: [
        "In `Style`, open `Thumbnail` to drag selected images into the order you want.",
        "That order is used for both the generated thumbnail and atlas export.",
      ],
      cn: [
        "在 `Style` 页面里，打开 `Thumbnail` 可以拖拽调整已选图片顺序。",
        "这个顺序会同时用于缩略图生成和 atlas 文件夹导出。",
      ],
    },
  ];

  return (
    <section style={S.helpWrap}>
      <div style={S.helpHero}>
        <h2 style={S.helpTitle}>Help</h2>
        <div style={S.helpTextBlock}>
          <HelpRichText
            style={S.helpIntro}
            text="Polyimage compares image models, re-runs tasks quickly, and exports selected images into one atlas folder."
          />
          <HelpRichText
            style={S.helpIntroCn}
            text="Polyimage 用来对比不同生图模型、快速重跑任务，并把选中的图片导出成一个图集文件夹。"
          />
        </div>
      </div>
      <div style={S.helpGrid}>
        {sections.map((section) => (
          <article key={section.title} style={{ ...S.helpCard, ...(section.fullWidth ? S.helpCardFull : null) }}>
            <h3 style={S.helpCardTitle}>{section.title}</h3>
            <div style={S.helpTextBlock}>
              <HelpParagraphs text={section.en} style={S.helpCardText} />
              <div style={S.helpLangGap} />
              <HelpParagraphs text={section.cn} style={S.helpCardTextCn} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModelChip({ model, selected, onToggle, disabled, count, onCountChange, styleMode = false }) {
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
          <span style={styleMode ? S.chipNameStyleMode : S.chipName} title={model.name}>{displayName}</span>
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

function ResultColumn({
  result,
  onPreview,
  onCancel,
  turnId,
  turnSeq,
  selectedImageKeys,
  onToggleImageSelect,
  onRetryImage,
  onAppendImage,
  retryingImageKeys,
  enableSelect = false,
  showImageLabel = false,
  selectPosition = "top-right",
  compactImages = false,
  showPromptBadge = true,
}) {
  const model = IMAGE_MODELS.find((m) => m.id === result.modelId);
  const visibleImages = Array.isArray(result.images) ? result.images : [];
  const generatedCount = visibleImages.length;
  const requestedCount = Math.max(1, Number(result?.requestedCount) || 1);
  const resultTaskKey = buildTurnTaskKey(turnId, result.modelId, getResultPromptKey(result));
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
        {showPromptBadge && getResultPromptKey(result) !== "single" && (
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
          <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>
            Generating... {generatedCount}/{requestedCount}
          </p>
          <button style={{ ...S.dlBtn, marginTop: 10, borderRadius: 8, width: 120 }} onClick={onCancel}>Stop</button>
        </div>
      )}
      {(result.status === "success" || result.status === "loading") && visibleImages.length > 0 && (
        <div style={compactImages ? S.imgGridCompact : S.imgGrid}>
          {visibleImages.map((img, i) => {
            const imageIndex = i + 1;
            const promptKey = getResultPromptKey(result);
            const imageKey = buildTurnImageKey(turnId, result.modelId, promptKey, imageIndex);
            const isSelected = enableSelect ? !!selectedImageKeys?.has?.(imageKey) : false;
            return (
              <ImageCard
                key={`${imageKey}:${isSelected ? "selected" : "idle"}`}
                img={img}
                fileStem={buildResultFileStem(result)}
                index={imageIndex}
                onPreview={onPreview}
                label={showImageLabel ? (result.promptLabel || "") : ""}
                compact={compactImages}
                showSelect={enableSelect}
                selectPosition={selectPosition}
                selected={isSelected}
                replacing={retryingImageKeys?.has?.(imageKey)}
                busy={retryingImageKeys?.has?.(imageKey) || retryingImageKeys?.has?.(resultTaskKey)}
                onRetry={() =>
                  onRetryImage?.({
                    key: imageKey,
                    turnId,
                    modelId: result.modelId,
                    promptKey,
                    index: imageIndex,
                  })
                }
                onAppend={() =>
                  onAppendImage?.({
                    key: resultTaskKey,
                    turnId,
                    modelId: result.modelId,
                    promptKey,
                  })
                }
                onToggleSelect={() =>
                  enableSelect && onToggleImageSelect?.({
                    key: imageKey,
                    image: img,
                    turnId,
                    turnSeq,
                    modelId: result.modelId,
                    modelName: result.modelName || model?.name || result.modelId,
                    promptKey,
                    theme: result.promptLabel || "",
                    fileStem: buildResultFileStem(result),
                    index: imageIndex,
                  })
                }
              />
            );
          })}
        </div>
      )}
      {(result.status === "error" || result.status === "cancelled" || (result.status === "success" && !visibleImages.length)) && (
        <div style={S.errArea}>
          {result.status === "error" ? (
            <p style={{ color: "#ef4444", fontSize: 13, wordBreak: "break-word" }}>{result.error}</p>
          ) : null}
          {result.status === "cancelled" ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>Cancelled by user</p>
          ) : null}
          {result.status === "success" && !visibleImages.length ? (
            <p style={{ color: "#f59e0b", fontSize: 13 }}>No images returned.</p>
          ) : null}
          <ImageActionBar
            allowSave={false}
            compact
            busy={retryingImageKeys?.has?.(resultTaskKey)}
            onRetry={() =>
              onRetryImage?.({
                key: resultTaskKey,
                turnId,
                modelId: result.modelId,
                promptKey: getResultPromptKey(result),
              })
            }
            onAppend={() =>
              onAppendImage?.({
                key: resultTaskKey,
                turnId,
                modelId: result.modelId,
                promptKey: getResultPromptKey(result),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ImageCard({
  img,
  fileStem,
  index,
  onPreview,
  label,
  selected,
  onToggleSelect,
  onRetry,
  onAppend,
  replacing = false,
  busy = false,
  showSelect = true,
  selectPosition = "top-right",
  compact = false,
}) {
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
    <div style={{ ...S.imgCard, ...(compact ? S.imgCardCompact : null), ...(selected ? S.imgCardSelected : null) }}>
      {showSelect && (
        <button
          type="button"
          style={{
            ...S.imageSelectBtn,
            ...(compact ? S.imageSelectBtnCompact : null),
            ...(selectPosition === "bottom-right" ? S.imageSelectBtnBottom : null),
            ...(selected ? S.imageSelectBtnActive : null),
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleSelect}
          title={selected ? "Unselect" : "Select"}
        >
          {selected ? "●" : "○"}
        </button>
      )}
      {!!label && <div style={{ ...S.imageThemeTag, ...(compact ? S.imageThemeTagCompact : null) }}>{label}</div>}
      {!replacing ? (
        <img src={src} alt={`Gen ${index}`} style={compact ? S.thumbCompact : S.thumb} onClick={() => onPreview(src)} onError={onImgError} />
      ) : (
        <div style={compact ? S.thumbRetryingCompact : S.thumbRetrying}>Retrying…</div>
      )}
      <ImageActionBar
        compact={compact}
        busy={busy}
        onSave={() =>
          src.startsWith("data:image/")
            ? downloadDataUrl(src, `${fileStem}_${index}.png`)
            : downloadImageUrl(src, `${fileStem}_${index}.png`)
        }
        onRetry={onRetry}
        onAppend={onAppend}
      />
    </div>
  );
}

function TurnPanel({
  turn,
  onPreview,
  onCancelModel,
  onDelete,
  onReuse,
  onHide,
  onSyncTemplate,
  canSyncTemplate,
  selectedImageKeys,
  onToggleImageSelect,
  onRetryImage,
  onAppendImage,
  retryingImageKeys,
  compactStyleHistory = false,
  truncatePromptText = false,
  showModelSummary = true,
}) {
  const promptVariants = getTurnPromptVariants(turn);
  const turnMode = getTurnMode(turn);
  const isCompareMode = turnMode === "compare";
  const isStyleMode = turnMode === "style";
  const isMultiPromptMode = promptVariants.length > 1;
  const styleBasePrompt =
    typeof turn?.styleBasePrompt === "string"
      ? turn.styleBasePrompt
      : turn?.prompt || promptVariants[0]?.prompt || "";
  const selectedModelIds = Array.isArray(turn?.selectedModelIds) ? turn.selectedModelIds : [];
  const styleReferenceImages = Array.isArray(turn?.styleReferenceImages) ? turn.styleReferenceImages : [];
  const modelOrder = new Map(selectedModelIds.map((id, index) => [id, index]));
  const promptVariantOrder = new Map(promptVariants.map((variant, index) => [variant.key, index]));
  const styleResults = isStyleMode
    ? (turn.results || [])
        .slice()
        .sort((a, b) => {
          const ai = modelOrder.has(a.modelId) ? modelOrder.get(a.modelId) : Number.MAX_SAFE_INTEGER;
          const bi = modelOrder.has(b.modelId) ? modelOrder.get(b.modelId) : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          const ak = promptVariantOrder.has(getResultPromptKey(a))
            ? promptVariantOrder.get(getResultPromptKey(a))
            : Number.MAX_SAFE_INTEGER;
          const bk = promptVariantOrder.has(getResultPromptKey(b))
            ? promptVariantOrder.get(getResultPromptKey(b))
            : Number.MAX_SAFE_INTEGER;
          if (ak !== bk) return ak - bk;
          return String(a.modelId).localeCompare(String(b.modelId));
        })
    : [];
  const styleModelId = selectedModelIds[0] || styleResults[0]?.modelId || "";
  const styleModelName = IMAGE_MODELS.find((model) => model.id === styleModelId)?.name || styleModelId || "-";
  const styleRequestedCount = styleResults[0]?.requestedCount || (styleModelId ? Number(turn?.modelCounts?.[styleModelId]) || 1 : 0);
  const styleExpectedCount = styleResults.reduce(
    (sum, result) => sum + Math.max(1, Number(result?.requestedCount) || 1),
    0
  );
  const styleGeneratedCount = styleResults.reduce(
    (sum, result) => sum + (Array.isArray(result?.images) ? result.images.length : 0),
    0
  );
  const styleSuccessCount = styleResults.filter((result) => result.status === "success").length;
  const styleErrorCount = styleResults.filter((result) => result.status === "error").length;
  const styleCancelledCount = styleResults.filter((result) => result.status === "cancelled").length;
  const styleLoadingCount = styleResults.filter((result) => result.status === "loading").length;
  const styleFailedCount = styleErrorCount + styleCancelledCount;
  const styleTurnFinished = turn.status === "done";
  const styleStillRunning = !styleTurnFinished && (turn.status === "queued" || turn.status === "running" || styleLoadingCount > 0);
  const styleImageItems = styleResults.flatMap((result) => {
    const promptKey = getResultPromptKey(result);
    const promptLabel = result.promptLabel || promptKey;
    const modelName = result.modelName || styleModelName;
    const images = Array.isArray(result.images) ? result.images : [];
    return images.map((image, index) => ({
      image,
      index: index + 1,
      modelId: result.modelId,
      modelName,
      promptKey,
      promptLabel,
      fileStem: buildResultFileStem(result),
    }));
  });
  const styleFailedThemes = Array.from(
    new Set(
      styleResults
        .filter((result) => result.status === "error" || result.status === "cancelled")
        .map((result) => result.promptLabel || getResultPromptKey(result))
        .filter(Boolean)
    )
  );
  const resultsByVariant = promptVariants.map((variant) => ({
    variant,
    groupResults: (turn.results || [])
      .filter((result) => getResultPromptKey(result) === variant.key)
      .sort((a, b) => {
        const ai = modelOrder.has(a.modelId) ? modelOrder.get(a.modelId) : Number.MAX_SAFE_INTEGER;
        const bi = modelOrder.has(b.modelId) ? modelOrder.get(b.modelId) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return String(a.modelId).localeCompare(String(b.modelId));
      }),
  })).filter((item) => item.groupResults.length > 0);
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: mono }}>
          #{turn.seq} · {new Date(turn.createdAt).toLocaleString()} · {turn.status}
          {isCompareMode && <span style={S.turnModeBadge}>Compare</span>}
          {isStyleMode && <span style={S.turnModeBadge}>Style</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showModelSummary && (
            <div style={{ fontSize: 12, color: "#71717a", fontFamily: mono }}>
              {selectedModelIds.length ? selectedModelIds.join(" · ") : "-"}
            </div>
          )}
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
      {isStyleMode && compactStyleHistory ? (
        <div style={S.styleHistorySummary}>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>Model</span>
            <span style={S.styleSummaryVal}>{styleModelName}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>Per Task</span>
            <span style={S.styleSummaryVal}>x{styleRequestedCount || 0}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>Generated</span>
            <span style={S.styleSummaryVal}>{styleGeneratedCount}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>Success</span>
            <span style={S.styleSummaryVal}>{styleSuccessCount}/{styleResults.length || 0}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>Failed</span>
            <span style={S.styleSummaryVal}>{styleErrorCount + styleCancelledCount}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>Running</span>
            <span style={S.styleSummaryVal}>{styleLoadingCount}</span>
          </div>
        </div>
      ) : (
        <>
          <div style={S.turnPromptRow}>
            <div
              style={{
                ...S.turnPromptCards,
                gridTemplateColumns: isCompareMode ? "repeat(2, minmax(0, 1fr))" : "1fr",
              }}
            >
              {isStyleMode ? (
                <div style={{ ...S.turnPromptCard, ...(truncatePromptText ? S.turnPromptCardCompact : null) }}>
                  <div style={{ ...S.turnPromptText, ...(truncatePromptText ? S.turnPromptTextCompact : null) }}>
                    {styleBasePrompt ? <PromptTextWithChips text={getPromptPreviewText(styleBasePrompt)} /> : "(no prompt)"}
                  </div>
                </div>
              ) : (
                promptVariants.map((variant) => (
                  <div key={variant.key} style={{ ...S.turnPromptCard, ...(truncatePromptText ? S.turnPromptCardCompact : null) }}>
                    {isCompareMode && <div style={S.turnPromptBadge}>{variant.label}</div>}
                    <div style={{ ...S.turnPromptText, ...(truncatePromptText ? S.turnPromptTextCompact : null) }}>
                      {variant.prompt ? <PromptTextWithChips text={getPromptPreviewText(variant.prompt)} /> : "(no prompt)"}
                    </div>
                  </div>
                ))
              )}
            </div>
            {(turn.referenceImage || styleReferenceImages.length > 0) && (
              <div style={S.turnRefImageStack}>
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
                {styleReferenceImages.map((image, index) => (
                  <button
                    key={`style-ref-${turn.id}-${index}`}
                    type="button"
                    style={S.turnRefImageBtn}
                    onClick={() => onPreview?.(image)}
                    title={`Preview style image ${index + 1}`}
                  >
                    <img src={image} alt={`Style ${index + 1}`} style={S.turnRefImage} />
                  </button>
                ))}
              </div>
            )}
          </div>
          {isStyleMode ? (
            <div style={S.turnStyleUnifiedWrap}>
              <div style={S.styleHistorySummary}>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>Model</span>
                  <span style={S.styleSummaryVal}>{styleModelName}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>Per Task</span>
                  <span style={S.styleSummaryVal}>x{styleRequestedCount || 0}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>Generated</span>
                  <span style={S.styleSummaryVal}>{styleGeneratedCount}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>Success</span>
                  <span style={S.styleSummaryVal}>{styleSuccessCount}/{styleResults.length || 0}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>Failed</span>
                  <span style={S.styleSummaryVal}>{styleErrorCount + styleCancelledCount}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>Running</span>
                  <span style={S.styleSummaryVal}>{styleLoadingCount}</span>
                </div>
              </div>

              {styleTurnFinished && styleFailedThemes.length > 0 && (
                <div style={S.turnStyleFailedLine}>
                  Failed themes: {styleFailedThemes.join(" · ")}
                </div>
              )}

              <div style={S.turnStyleImageBox}>
                <div style={S.turnStyleImageHead}>
                  <span style={S.turnResultMeta}>Style Results</span>
                  {styleLoadingCount > 0 && (
                    <span style={S.turnResultMeta}>
                      Generating {styleGeneratedCount}/{styleExpectedCount || 0}
                    </span>
                  )}
                </div>

                {styleImageItems.length > 0 ? (
                  <div style={S.imgGridCompact}>
                    {styleImageItems.map((item) => {
                      const imageKey = buildTurnImageKey(turn.id, item.modelId, item.promptKey, item.index);
                      return (
                        <ImageCard
                          key={imageKey}
                          img={item.image}
                          fileStem={item.fileStem}
                          index={item.index}
                          onPreview={onPreview}
                          label={item.promptLabel}
                          compact
                          showSelect
                          selected={selectedImageKeys?.has?.(imageKey)}
                          replacing={retryingImageKeys?.has?.(imageKey)}
                          busy={retryingImageKeys?.has?.(imageKey) || retryingImageKeys?.has?.(buildTurnTaskKey(turn.id, item.modelId, item.promptKey))}
                          onRetry={() =>
                            onRetryImage?.({
                              key: imageKey,
                              turnId: turn.id,
                              modelId: item.modelId,
                              promptKey: item.promptKey,
                              index: item.index,
                            })
                          }
                          onAppend={() =>
                            onAppendImage?.({
                              key: buildTurnTaskKey(turn.id, item.modelId, item.promptKey),
                              turnId: turn.id,
                              modelId: item.modelId,
                              promptKey: item.promptKey,
                            })
                          }
                          onToggleSelect={() =>
                            onToggleImageSelect?.({
                              key: imageKey,
                              image: item.image,
                              turnId: turn.id,
                              turnSeq: turn.seq,
                              modelId: item.modelId,
                              modelName: item.modelName,
                              promptKey: item.promptKey,
                              theme: item.promptLabel || "",
                              fileStem: item.fileStem,
                              index: item.index,
                            })
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div style={S.turnStyleImageEmpty}>
                    {styleStillRunning
                      ? "Generating images..."
                      : styleFailedCount > 0
                      ? "No successful images. Check failed themes."
                      : styleResults.length
                      ? "No images returned."
                      : "No style results yet."}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              style={
                isCompareMode
                  ? { ...S.turnCompareResultsGrid, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
                  : undefined
              }
            >
              {resultsByVariant.map(({ variant, groupResults }) => {
              return (
                <div key={variant.key} style={isMultiPromptMode ? S.turnResultGroup : undefined}>
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
                      gridTemplateColumns: isCompareMode
                        ? `repeat(${Math.min(2, Math.max(1, groupResults.length))}, minmax(0, 1fr))`
                        : `repeat(${Math.min(4, Math.max(1, groupResults.length))}, minmax(0, 1fr))`,
                    }}
                  >
                    {groupResults.map((r, i) => (
                      <ResultColumn
                        key={`${turn.id}-${r.modelId}-${getResultPromptKey(r)}-${i}`}
                        result={r}
                        onPreview={onPreview}
                        onCancel={() => onCancelModel?.(turn.id, r.modelId, getResultPromptKey(r))}
                        turnId={turn.id}
                        turnSeq={turn.seq}
                        selectedImageKeys={selectedImageKeys}
                        onToggleImageSelect={onToggleImageSelect}
                        onRetryImage={onRetryImage}
                        onAppendImage={onAppendImage}
                        retryingImageKeys={retryingImageKeys}
                        enableSelect
                        showImageLabel={false}
                      />
                    ))}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </>
      )}
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
  const [activePage, setActivePage] = useState("workspace");
  const [taskMode, setTaskMode] = useState(DEFAULT_TASK_MODE);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [draftApiKey, setDraftApiKey] = useState(DEFAULT_API_KEY);
  const [apiKeySavedAt, setApiKeySavedAt] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [gptAssistPrompt, setGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [draftGptAssistPrompt, setDraftGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [styleThemeAssistPrompt, setStyleThemeAssistPrompt] = useState(DEFAULT_STYLE_THEME_ASSIST_PROMPT);
  const [draftStyleThemeAssistPrompt, setDraftStyleThemeAssistPrompt] = useState(DEFAULT_STYLE_THEME_ASSIST_PROMPT);
  const [gptAssistSavedAt, setGptAssistSavedAt] = useState(null);
  const [showGptAssistModal, setShowGptAssistModal] = useState(false);
  const [gptAssistBusy, setGptAssistBusy] = useState(false);
  const [styleThemeAssistBusy, setStyleThemeAssistBusy] = useState(false);
  const [styleThemeSeedInput, setStyleThemeSeedInput] = useState("");
  const [templates, setTemplates] = useState(normalizeTemplates(DEFAULT_TEMPLATES));
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({ title: "", body: "", backup: "", memo: "" });
  const [styleTemplates, setStyleTemplates] = useState(normalizeStyleTemplates(DEFAULT_STYLE_TEMPLATES));
  const [activeStyleTemplateId, setActiveStyleTemplateId] = useState(DEFAULT_STYLE_TEMPLATES[0]?.id || null);
  const [showStyleTemplateModal, setShowStyleTemplateModal] = useState(false);
  const [editingStyleTemplateId, setEditingStyleTemplateId] = useState(null);
  const [styleTemplateDraft, setStyleTemplateDraft] = useState({ title: "", body: "" });
  const [styleThemes, setStyleThemes] = useState(normalizeStyleThemes(DEFAULT_STYLE_THEMES));
  const [uploadedInputImages, setUploadedInputImages] = useState([]);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedPreview, setUploadedPreview] = useState(null);
  const [styleReferenceImages, setStyleReferenceImages] = useState([]);
  const [showInputImageModal, setShowInputImageModal] = useState(false);
  const [showStyleReferenceModal, setShowStyleReferenceModal] = useState(false);
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
  const [proxyUrl, setProxyUrl] = useState("https://img-proxy.adelineazures.workers.dev");
  const [historyDirHandle, setHistoryDirHandle] = useState(null);
  const [historyDirName, setHistoryDirName] = useState("");
  const [historyFolderMsg, setHistoryFolderMsg] = useState("");
  const [hiddenTurnIds, setHiddenTurnIds] = useState([]);
  const [selectedAtlasItems, setSelectedAtlasItems] = useState([]);
  const [atlasThumbnail, setAtlasThumbnail] = useState(null);
  const [atlasBusy, setAtlasBusy] = useState(false);
  const [showSelectionLimitModal, setShowSelectionLimitModal] = useState(false);
  const [showAtlasThumbnailModal, setShowAtlasThumbnailModal] = useState(false);
  const [retryingImageKeys, setRetryingImageKeys] = useState(new Set());
  const fileRef = useRef(null);
  const activePromptFieldRef = useRef("single");
  const promptInputRef = useRef(null);
  const compareAInputRef = useRef(null);
  const compareBInputRef = useRef(null);
  const seqRef = useRef(1);
  const controllersRef = useRef({});
  const savingToFolderRef = useRef(new Set());

  const insertPlaceholderChip = useCallback(() => {
    if (taskMode === "compare") {
      if (activePromptFieldRef.current === "b") {
        compareBInputRef.current?.insertPlaceholder?.();
        return;
      }
      compareAInputRef.current?.insertPlaceholder?.();
      return;
    }
    promptInputRef.current?.insertPlaceholder?.();
  }, [taskMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.historyLimit === "number") setHistoryLimit(saved.historyLimit);
        if (Array.isArray(saved.selectedModels) && saved.selectedModels.length) {
          const migrated = saved.selectedModels.map((id) => normalizeModelId(id));
          setSelectedModels(migrated);
        }
        if (saved.modelCounts && typeof saved.modelCounts === "object") {
          const migratedCounts = { ...saved.modelCounts };
          if (typeof migratedCounts["nano-banana-pro-all"] === "number" && typeof migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number") {
            migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] = migratedCounts["nano-banana-pro-all"];
          }
          if (typeof migratedCounts["gemini-3-pro-preview"] === "number" && typeof migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number") {
            migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] = migratedCounts["gemini-3-pro-preview"];
          }
          setModelCounts((prev) => ({ ...prev, ...migratedCounts }));
        }
        if (saved.taskMode === "single" || saved.taskMode === "compare" || saved.taskMode === "style") setTaskMode(saved.taskMode);
        if (saved.comparePrompts && typeof saved.comparePrompts === "object") {
          compareAEditor.resetText(typeof saved.comparePrompts.a === "string" ? saved.comparePrompts.a : DEFAULT_COMPARE_PROMPTS.a);
          compareBEditor.resetText(typeof saved.comparePrompts.b === "string" ? saved.comparePrompts.b : DEFAULT_COMPARE_PROMPTS.b);
        }
        if (typeof saved.prompt === "string") promptEditor.resetText(saved.prompt);
        if (Array.isArray(saved.styleThemes)) {
          setStyleThemes(normalizeStyleThemes(saved.styleThemes));
        }
        if (Array.isArray(saved.styleReferenceImages)) {
          setStyleReferenceImages(
            saved.styleReferenceImages
              .map((item) => (typeof item === "string" ? item : ""))
              .filter(Boolean)
              .slice(0, MAX_STYLE_REFERENCE_IMAGES)
          );
        }
        if (typeof saved.apiBaseUrl === "string" && saved.apiBaseUrl.trim()) {
          setApiBaseUrl(resolveApiBaseUrl(saved.apiBaseUrl));
        }
        if (typeof saved.lastEditedCount === "number") {
          setLastEditedCount(Math.max(1, Math.min(8, Number(saved.lastEditedCount) || 1)));
        }
        if (typeof saved.aspectRatio === "string" || typeof saved.geminiAspectRatio === "string") {
          setAspectRatio(normalizeAspectRatio(saved.aspectRatio ?? saved.geminiAspectRatio));
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
      historyLimit,
      selectedModels,
      modelCounts,
      prompt,
      taskMode,
      comparePrompts,
      styleThemes,
      styleReferenceImages,
      apiBaseUrl,
      lastEditedCount,
      aspectRatio,
      proxyUrl,
      nextSeq: seqRef.current,
    };
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    } catch {}
  }, [historyLimit, selectedModels, modelCounts, prompt, taskMode, comparePrompts, styleThemes, styleReferenceImages, apiBaseUrl, lastEditedCount, aspectRatio, proxyUrl]);

  useEffect(() => {
    if (selectedAtlasItems.length > 0) return;
    setAtlasThumbnail(null);
  }, [selectedAtlasItems.length]);

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
    const nextStyleThemePrompt = normalizeStyleThemeAssistPrompt(draftStyleThemeAssistPrompt);
    setGptAssistPrompt(nextPrompt);
    setStyleThemeAssistPrompt(nextStyleThemePrompt);
    setDraftGptAssistPrompt(nextPrompt);
    setDraftStyleThemeAssistPrompt(nextStyleThemePrompt);
    setGptAssistSavedAt(Date.now());
    setShowGptAssistModal(false);
  }, [draftGptAssistPrompt, draftStyleThemeAssistPrompt, historyDirHandle]);

  const openTemplateEditor = useCallback((templateId) => {
    if (!historyDirHandle) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(template.id);
    setTemplateDraft({
      title: template.title || "",
      body: template.body || "",
      backup: template.backup || "",
      memo: template.memo || "",
    });
    setShowTemplateModal(true);
  }, [templates, historyDirHandle]);

  const saveTemplateDraft = useCallback(() => {
    if (!editingTemplateId || !historyDirHandle) return;
    const title = templateDraft.title.trim() || editingTemplateId.replace("template-", "Preset ");
    const body = templateDraft.body || "";
    const backup = templateDraft.backup || "";
    const memo = templateDraft.memo || "";
    setTemplates((prev) => {
      return prev.map((item) => (item.id === editingTemplateId ? { ...item, title, body, backup, memo } : item));
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

  const openStyleTemplateEditor = useCallback((templateId) => {
    if (!historyDirHandle) return;
    const template = styleTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingStyleTemplateId(template.id);
    setStyleTemplateDraft({
      title: template.title || "",
      body: template.body || "",
    });
    setShowStyleTemplateModal(true);
  }, [styleTemplates, historyDirHandle]);

  const saveStyleTemplateDraft = useCallback(() => {
    if (!editingStyleTemplateId || !historyDirHandle) return;
    const title = styleTemplateDraft.title.trim() || editingStyleTemplateId.replace("style-template-", "Style ");
    const body = styleTemplateDraft.body || "";
    setStyleTemplates((prev) => prev.map((item) => (item.id === editingStyleTemplateId ? { ...item, title, body } : item)));
    if (activeStyleTemplateId === editingStyleTemplateId && prompt !== body) {
      promptEditor.setText(body, { record: false });
    }
    setShowStyleTemplateModal(false);
  }, [styleTemplateDraft, editingStyleTemplateId, historyDirHandle, activeStyleTemplateId, prompt, promptEditor]);

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

  const selectStyleTemplateUsage = useCallback((templateId) => {
    if (!historyDirHandle) return;
    if (activeStyleTemplateId === templateId) {
      setActiveStyleTemplateId(null);
      return;
    }
    const template = styleTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setActiveStyleTemplateId(template.id);
    const nextPrompt = template.body || "";
    if (prompt !== nextPrompt) promptEditor.setText(nextPrompt, { record: false });
  }, [historyDirHandle, activeStyleTemplateId, styleTemplates, prompt, promptEditor]);

  const syncTurnToTemplate = useCallback((turn) => {
    if (!historyDirHandle) return;
    if (getTurnMode(turn) === "style") {
      if (!activeStyleTemplateId) return;
      const basePrompt = typeof turn.styleBasePrompt === "string"
        ? turn.styleBasePrompt
        : getTurnPromptVariants(turn)[0]?.prompt || "";
      setStyleTemplates((prev) =>
        prev.map((item) =>
          item.id === activeStyleTemplateId
            ? { ...item, body: basePrompt }
            : item
        )
      );
      return;
    }
    if (!activeTemplateId) return;
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
  }, [activeTemplateId, activeStyleTemplateId, historyDirHandle]);

  const runGptAssist = useCallback(async () => {
    if (gptAssistBusy) return;
    if (!proxyUrl.trim()) {
      setShowSettings(true);
      return;
    }

    const items = taskMode === "compare"
      ? [
          { key: "a", prompt: comparePrompts.a, clearedPrompt: clearPlaceholderValues(comparePrompts.a) },
          { key: "b", prompt: comparePrompts.b, clearedPrompt: clearPlaceholderValues(comparePrompts.b) },
        ]
      : [{ key: "single", prompt, clearedPrompt: clearPlaceholderValues(prompt) }];
    const targetItems = items.filter((item) => extractPlaceholderTokens(item.prompt).length > 0);
    if (!targetItems.length) {
      setHistoryFolderMsg("未找到 {{ }} 占位符，GPT 未执行。");
      return;
    }

    if (taskMode === "compare") {
      compareAEditor.setText(items[0].clearedPrompt, { record: false });
      compareBEditor.setText(items[1].clearedPrompt, { record: false });
    } else {
      promptEditor.setText(items[0].clearedPrompt, { record: false });
    }

    setGptAssistBusy(true);
    try {
      const rewritten = {};
      if (taskMode === "compare") {
        const sourceKey = activePromptFieldRef.current === "b" ? "b" : "a";
        const sourceItem = targetItems.find((item) => item.key === sourceKey) || targetItems[0];
        const sourceRewritten = await callTextAssistAPI(
          proxyUrl,
          sourceItem.clearedPrompt,
          uploadedImage,
          gptAssistPrompt,
          { apiBaseUrl, apiKey }
        );
        const syncedReplacements = extractPlaceholderTokens(sourceRewritten);
        rewritten.a = applyPlaceholderReplacements(items[0].clearedPrompt, syncedReplacements);
        rewritten.b = applyPlaceholderReplacements(items[1].clearedPrompt, syncedReplacements);
      } else {
        const item = targetItems[0];
        rewritten[item.key] = await callTextAssistAPI(
          proxyUrl,
          item.clearedPrompt,
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

  const clearAllStyleThemes = useCallback(() => {
    setStyleThemes(Array.from({ length: STYLE_THEME_SLOTS }, () => ""));
  }, []);

  const runStyleThemeAssist = useCallback(async () => {
    if (styleThemeAssistBusy) return;
    if (taskMode !== "style") return;
    if (!proxyUrl.trim()) {
      setShowSettings(true);
      return;
    }
    const seed = styleThemeSeedInput.trim();
    if (!seed) {
      setHistoryFolderMsg("请输入主题联想关键词。");
      return;
    }

    setStyleThemeAssistBusy(true);
    try {
      const generated = await callThemeAssistAPI(
        proxyUrl,
        seed,
        styleThemeAssistPrompt,
        { apiBaseUrl, apiKey }
      );
      if (!generated.length) {
        setHistoryFolderMsg("主题联想失败：GPT 未返回有效主题。");
        return;
      }
      setStyleThemes((prev) => {
        const next = normalizeStyleThemes(prev);
        for (let index = 0; index < STYLE_THEME_SLOTS; index += 1) {
          next[index] = generated[index] || "";
        }
        return next;
      });
      setHistoryFolderMsg(`已生成 ${Math.min(generated.length, STYLE_THEME_SLOTS)} 个主题元素。`);
    } catch (err) {
      if (!isAbortError(err)) {
        setHistoryFolderMsg(`主题联想失败：${err?.message || "未知错误"}`);
      }
    } finally {
      setStyleThemeAssistBusy(false);
    }
  }, [styleThemeAssistBusy, taskMode, proxyUrl, styleThemeSeedInput, styleThemeAssistPrompt, apiBaseUrl, apiKey]);

  const toggleModel = useCallback((id) => {
    setSelectedModels((prev) => {
      if (taskMode === "style") {
        return prev.includes(id) ? prev.filter((m) => m !== id) : [id];
      }
      return prev.includes(id)
        ? prev.filter((m) => m !== id)
        : prev.length >= 6
        ? prev
        : [...prev, id];
    });
  }, [taskMode]);

  useEffect(() => {
    if (taskMode !== "style") return;
    if (selectedModels.length <= 1) return;
    setSelectedModels((prev) => prev.slice(0, 1));
  }, [taskMode, selectedModels.length]);

  useEffect(() => {
    if (taskMode === "style") return;
    setShowInputImageModal(false);
    setShowStyleReferenceModal(false);
  }, [taskMode]);

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
    const files = Array.from(e.target.files || []).slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    if (!files.length) return;
    const encoded = await Promise.all(files.map((file) => fileToBase64(file)));
    const safeEncoded = encoded.filter((item) => typeof item === "string" && item.startsWith("data:image/"));
    if (!safeEncoded.length) return;
    setUploadedInputImages(safeEncoded);
    setUploadedImage(safeEncoded[0]);
    setUploadedPreview(safeEncoded[0]);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const removeImage = useCallback(() => {
    setUploadedInputImages([]);
    setUploadedImage(null);
    setUploadedPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const inputImageList = useMemo(() => {
    const list = Array.isArray(uploadedInputImages)
      ? uploadedInputImages.filter((item) => typeof item === "string" && item)
      : [];
    if (list.length) return list.slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    if (typeof uploadedImage === "string" && uploadedImage) return [uploadedImage];
    return [];
  }, [uploadedInputImages, uploadedImage]);

  const styleImageList = useMemo(
    () =>
      (Array.isArray(styleReferenceImages) ? styleReferenceImages : [])
        .map((item) => (typeof item === "string" ? item : ""))
        .filter(Boolean)
        .slice(0, MAX_STYLE_REFERENCE_IMAGES),
    [styleReferenceImages]
  );

  const appendInputImageFiles = useCallback(async (files) => {
    const incoming = Array.isArray(files) ? files : [];
    if (!incoming.length) return;
    const encoded = await Promise.all(incoming.slice(0, MAX_INPUT_IMAGES_PER_BATCH).map((file) => fileToBase64(file)));
    const safeEncoded = encoded.filter((item) => typeof item === "string" && item.startsWith("data:image/"));
    if (!safeEncoded.length) return;
    const base = (Array.isArray(uploadedInputImages) ? uploadedInputImages : [])
      .filter((item) => typeof item === "string" && item);
    const next = [...base, ...safeEncoded].slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    setUploadedInputImages(next);
    setUploadedImage(next[0] || null);
    setUploadedPreview(next[0] || null);
    if (fileRef.current) fileRef.current.value = "";
  }, [uploadedInputImages]);

  const removeInputImageAt = useCallback((index = 0) => {
    const base = (Array.isArray(uploadedInputImages) ? uploadedInputImages : [])
      .filter((item) => typeof item === "string" && item);
    if (!base.length) {
      setUploadedInputImages([]);
      setUploadedImage(null);
      setUploadedPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const safeIndex = Math.max(0, Math.min(base.length - 1, Number(index) || 0));
    const next = base.filter((_, idx) => idx !== safeIndex);
    setUploadedInputImages(next);
    setUploadedImage(next[0] || null);
    setUploadedPreview(next[0] || null);
    if (fileRef.current) fileRef.current.value = "";
  }, [uploadedInputImages]);

  const appendStyleReferenceFiles = useCallback(async (files) => {
    const incoming = Array.isArray(files) ? files : [];
    if (!incoming.length) return;
    const remaining = Math.max(0, MAX_STYLE_REFERENCE_IMAGES - styleImageList.length);
    if (!remaining) return;
    const picked = incoming.slice(0, remaining);
    const encoded = await Promise.all(picked.map((file) => fileToBase64(file)));
    const safeEncoded = encoded.filter((item) => typeof item === "string" && item.startsWith("data:image/"));
    if (!safeEncoded.length) return;
    setStyleReferenceImages((prev) => {
      const base = (Array.isArray(prev) ? prev : [])
        .map((item) => (typeof item === "string" ? item : ""))
        .filter(Boolean);
      return [...base, ...safeEncoded].slice(0, MAX_STYLE_REFERENCE_IMAGES);
    });
  }, [styleImageList.length]);

  const removeStyleReferenceAt = useCallback((index) => {
    setStyleReferenceImages((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const updateStyleTheme = useCallback((index, value) => {
    setStyleThemes((prev) => {
      const next = normalizeStyleThemes(prev);
      next[index] = typeof value === "string" ? value : String(value ?? "");
      return next;
    });
  }, []);

  const updateComparePrompt = useCallback((key, value) => {
    const nextValue = typeof value === "string" ? value : String(value ?? "");
    if (key === "a") {
      const prevTokens = extractPlaceholderTokens(comparePrompts.a);
      const nextTokens = extractPlaceholderTokens(nextValue);
      compareAEditor.setText(nextValue);
      const changed = prevTokens.length !== nextTokens.length || prevTokens.some((v, index) => v !== nextTokens[index]);
      if (changed) {
        const synced = applyPlaceholderReplacements(comparePrompts.b, nextTokens);
        if (synced !== comparePrompts.b) compareBEditor.setText(synced, { record: false });
      }
      return;
    }
    if (key === "b") {
      const prevTokens = extractPlaceholderTokens(comparePrompts.b);
      const nextTokens = extractPlaceholderTokens(nextValue);
      compareBEditor.setText(nextValue);
      const changed = prevTokens.length !== nextTokens.length || prevTokens.some((v, index) => v !== nextTokens[index]);
      if (changed) {
        const synced = applyPlaceholderReplacements(comparePrompts.a, nextTokens);
        if (synced !== comparePrompts.a) compareAEditor.setText(synced, { record: false });
      }
    }
  }, [compareAEditor, compareBEditor, comparePrompts.a, comparePrompts.b]);

  const selectedImageKeys = useMemo(
    () => new Set(selectedAtlasItems.map((item) => item.key)),
    [selectedAtlasItems]
  );

  const toggleImageSelection = useCallback((payload) => {
    if (!payload?.key) return;
    setAtlasThumbnail(null);
    setSelectedAtlasItems((prev) => {
      const existing = prev.find((item) => item.key === payload.key);
      if (existing) {
        return prev.filter((item) => item.key !== payload.key);
      }
      if (prev.length >= MAX_ATLAS_SELECTED_IMAGES) {
        setShowSelectionLimitModal(true);
        return prev;
      }
      return [
        ...prev,
        {
          ...payload,
          selectedAt: Date.now(),
        },
      ];
    });
  }, []);

  const runResultImageAction = useCallback(async (payload, mode = "replace") => {
    const key = payload?.key;
    const turnId = payload?.turnId;
    const modelId = payload?.modelId;
    const promptKey = payload?.promptKey || "single";
    const imageIndex = Math.max(1, Number(payload?.index) || 1);
    if (!key || !turnId || !modelId) return;

    const targetTurn = turns.find((item) => item.id === turnId);
    if (!targetTurn) {
      setHistoryFolderMsg("重试失败：找不到对应任务。");
      return;
    }
    const targetResult = (targetTurn.results || []).find((result) => isSameResultTask(result, modelId, promptKey));
    if (!targetResult) {
      setHistoryFolderMsg("重试失败：找不到对应结果。");
      return;
    }
    const model = IMAGE_MODELS.find((item) => item.id === modelId);
    if (!model) {
      setHistoryFolderMsg("重试失败：模型不存在。");
      return;
    }

    const promptVariants = getTurnPromptVariants(targetTurn);
    const matchedVariant = promptVariants.find((item) => item.key === promptKey) || promptVariants[0];
    const promptText =
      typeof targetResult.promptText === "string"
        ? targetResult.promptText
        : matchedVariant?.prompt || targetTurn.prompt || "";
    const turnImageInputs = normalizeImageInputs(targetTurn.referenceImage, targetTurn.styleReferenceImages);
    const replaceAt = imageIndex - 1;
    const taskKey = buildTurnTaskKey(turnId, modelId, promptKey);
    const busyKeys = [taskKey, key].filter(Boolean);

    setRetryingImageKeys((prev) => {
      const next = new Set(prev);
      busyKeys.forEach((item) => next.add(item));
      return next;
    });

    setTurns((prev) =>
      prev.map((turn) =>
        turn.id !== turnId
          ? turn
          : {
              ...turn,
              folderSyncedAt: null,
              results: (turn.results || []).map((result) =>
                isSameResultTask(result, modelId, promptKey)
                  ? {
                      ...result,
                      status: "loading",
                      error: null,
                      requestedCount:
                        mode === "append"
                          ? Math.max(1, Number(result.requestedCount || 1)) + 1
                          : result.requestedCount,
                    }
                  : result
              ),
            }
      )
    );

    try {
      const generated = await generateImage(targetTurn.proxyUrl || proxyUrl, model, promptText, targetTurn.referenceImage, {
        count: 1,
        apiBaseUrl: targetTurn.apiBaseUrl || apiBaseUrl || DEFAULT_API_BASE_URL,
        apiKey: targetTurn.apiKey || apiKey || DEFAULT_API_KEY,
        aspectRatio: normalizeAspectRatio(targetTurn.aspectRatio ?? targetTurn.geminiAspectRatio ?? aspectRatio),
        imageInputs: turnImageInputs,
      });
      const nextImage = Array.isArray(generated) && generated.length ? generated[0] : null;
      if (!nextImage) throw new Error("No images returned");

      setTurns((prev) =>
        prev.map((turn) =>
          turn.id !== turnId
            ? turn
            : {
                ...turn,
                folderSyncedAt: null,
                results: (turn.results || []).map((result) => {
                  if (!isSameResultTask(result, modelId, promptKey)) return result;
                  const baseImages = Array.isArray(result.images) ? [...result.images] : [];
                  if (mode === "append") {
                    baseImages.push(nextImage);
                  } else if (replaceAt >= 0 && replaceAt < baseImages.length) {
                    baseImages[replaceAt] = nextImage;
                  } else {
                    baseImages.splice(0, baseImages.length, nextImage);
                  }
                  return {
                    ...result,
                    status: "success",
                    error: null,
                    images: baseImages,
                  };
                }),
              }
        )
      );
      if (mode === "replace" && key) {
        setSelectedAtlasItems((prev) =>
          prev.map((item) => (item.key === key ? { ...item, image: nextImage } : item))
        );
      }
      setAtlasThumbnail(null);
      setHistoryFolderMsg(mode === "append" ? "已追加 1 张图片。" : "已重试并替换图片。");
    } catch (err) {
      const message = err?.message || "未知错误";
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id !== turnId
            ? turn
            : {
                ...turn,
                folderSyncedAt: null,
                results: (turn.results || []).map((result) => {
                  if (!isSameResultTask(result, modelId, promptKey)) return result;
                  const hasImages = Array.isArray(result.images) && result.images.length > 0;
                  return hasImages
                    ? {
                        ...result,
                        status: "success",
                      }
                    : {
                        ...result,
                        status: "error",
                        error: message,
                      };
                }),
              }
        )
      );
      setHistoryFolderMsg(`重试失败：${message}`);
    } finally {
      setRetryingImageKeys((prev) => {
        const next = new Set(prev);
        busyKeys.forEach((item) => next.delete(item));
        return next;
      });
    }
  }, [turns, proxyUrl, apiBaseUrl, apiKey, aspectRatio]);

  const retryImage = useCallback((payload) => runResultImageAction(payload, "replace"), [runResultImageAction]);
  const appendResultImage = useCallback((payload) => runResultImageAction(payload, "append"), [runResultImageAction]);

  const clearAllSelections = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setSelectedAtlasItems([]);
    setAtlasThumbnail(null);
  }, []);

  const reorderAtlasSelection = useCallback((fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setSelectedAtlasItems((prev) => {
      const fromIndex = prev.findIndex((item) => item.key === fromKey);
      const toIndex = prev.findIndex((item) => item.key === toKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setAtlasThumbnail(null);
  }, []);

  const generateAtlasThumbnail = useCallback(async () => {
    if (!selectedAtlasItems.length) {
      setHistoryFolderMsg("请先选择要拼接的图片。");
      return;
    }
    setAtlasBusy(true);
    try {
      const ordered = [...selectedAtlasItems];
      const sources = await Promise.all(
        ordered.map(async (item) => {
          const normalized = normalizeImageValue(item.image, apiBaseUrl);
          if (!normalized) return null;
          const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
          return normalizeImageValue(proxied, apiBaseUrl);
        })
      );
      const thumbDataUrl = await createAtlasThumbnailDataUrl(sources.filter(Boolean), { rows: 3, cellWidth: 256, cellHeight: 256 });
      if (!thumbDataUrl) {
        setHistoryFolderMsg("缩略图生成失败。");
        return;
      }
      setAtlasThumbnail(thumbDataUrl);
      setHistoryFolderMsg(`缩略图已生成（${ordered.length} 张，3 行）。`);
    } catch (err) {
      setHistoryFolderMsg(`缩略图生成失败：${err?.message || "未知错误"}`);
    } finally {
      setAtlasBusy(false);
    }
  }, [selectedAtlasItems, apiBaseUrl, proxyUrl]);

  const exportAtlasSelection = useCallback(async () => {
    if (!historyDirHandle) {
      setHistoryFolderMsg("请先选择 History Folder。");
      return;
    }
    if (!selectedAtlasItems.length) {
      setHistoryFolderMsg("请先选择要导出的图片。");
      return;
    }

    setAtlasBusy(true);
    try {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg("文件夹写入权限未授权，无法导出图集。");
        return;
      }

      const ordered = [...selectedAtlasItems];
      let thumbDataUrl = atlasThumbnail;
      if (!thumbDataUrl) {
        const sources = await Promise.all(
          ordered.map(async (item) => {
            const normalized = normalizeImageValue(item.image, apiBaseUrl);
            if (!normalized) return null;
            const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
            return normalizeImageValue(proxied, apiBaseUrl);
          })
        );
        thumbDataUrl = await createAtlasThumbnailDataUrl(sources.filter(Boolean), { rows: 3, cellWidth: 256, cellHeight: 256 });
        if (thumbDataUrl) setAtlasThumbnail(thumbDataUrl);
      }

      const atlasRoot = await historyDirHandle.getDirectoryHandle("atlas", { create: true });
      const folderName = formatAtlasFolderName(ordered);
      const atlasDir = await atlasRoot.getDirectoryHandle(folderName, { create: true });
      const manifestItems = [];

      for (let index = 0; index < ordered.length; index += 1) {
        const item = ordered[index];
        const normalized = normalizeImageValue(item.image, apiBaseUrl);
        if (!normalized) continue;
        const stem = buildAtlasImageFileStem(item, index);
        let fileName = `${stem}.png`;
        if (normalized.startsWith("data:image/")) {
          const data = dataUrlToBytes(normalized);
          if (!data) continue;
          fileName = `${stem}.${data.ext}`;
          await writeBinaryFile(atlasDir, fileName, data.bytes);
        } else if (/^https?:\/\//i.test(normalized)) {
          const remote = await fetchImageBytes(normalized);
          fileName = `${stem}.${remote.ext}`;
          await writeBinaryFile(atlasDir, fileName, remote.bytes);
        } else {
          continue;
        }
        manifestItems.push({
          index: index + 1,
          file: fileName,
          theme: item.theme || "",
          turnId: item.turnId,
          turnSeq: item.turnSeq,
          modelId: item.modelId,
          modelName: item.modelName || "",
          promptKey: item.promptKey,
        });
      }

      if (thumbDataUrl) {
        const thumb = dataUrlToBytes(thumbDataUrl);
        if (thumb) {
          await writeBinaryFile(atlasDir, `thumbnail.${thumb.ext}`, thumb.bytes);
        }
      }

      await writeTextFile(
        atlasDir,
        "manifest.json",
        JSON.stringify(
          {
            createdAt: Date.now(),
            itemCount: manifestItems.length,
            maxSelectable: MAX_ATLAS_SELECTED_IMAGES,
            rows: 3,
            items: manifestItems,
          },
          null,
          2
        )
      );
      setHistoryFolderMsg(`图集已导出：atlas/${folderName}`);
    } catch (err) {
      setHistoryFolderMsg(`导出失败：${err?.message || "未知错误"}`);
    } finally {
      setAtlasBusy(false);
    }
  }, [historyDirHandle, selectedAtlasItems, atlasThumbnail, apiBaseUrl, proxyUrl]);

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
    const loadedGptAssistConfig = await loadGptAssistFromLocalFolder(dirHandle);
    setGptAssistPrompt(loadedGptAssistConfig.prompt);
    setDraftGptAssistPrompt(loadedGptAssistConfig.prompt);
    setStyleThemeAssistPrompt(loadedGptAssistConfig.styleThemePrompt);
    setDraftStyleThemeAssistPrompt(loadedGptAssistConfig.styleThemePrompt);
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
    const styleTemplatePayload = await loadStyleTemplatesFromLocalFolder(dirHandle);
    if (styleTemplatePayload) {
      setStyleTemplates(styleTemplatePayload.templates);
      setActiveStyleTemplateId(styleTemplatePayload.activeTemplateId || styleTemplatePayload.templates[0]?.id || null);
    } else {
      const fallbackStyleTemplates = normalizeStyleTemplates(DEFAULT_STYLE_TEMPLATES);
      setStyleTemplates(fallbackStyleTemplates);
      setActiveStyleTemplateId(fallbackStyleTemplates[0]?.id || null);
    }
    const loadedTurns = await loadTurnsFromLocalFolder(dirHandle);
    setSelectedAtlasItems([]);
    setAtlasThumbnail(null);
    const nextTurns = [...loadedTurns].sort((a, b) => b.seq - a.seq);
    setTurns(nextTurns);
    setHiddenTurnIds([]);
    setActiveTurnId(nextTurns[0]?.id || null);
    if (loadedTurns.length) {
      const maxSeq = loadedTurns.reduce((m, t) => Math.max(m, Number(t.seq) || 0), 0);
      seqRef.current = maxSeq + 1;
    } else {
      seqRef.current = 1;
    }
    setHistoryFolderMsg(
      templatePayload
        ? `已读取文件夹历史：${loadedTurns.length} 条，模板：${templatePayload.templates.length} + 风格模板：${styleTemplatePayload?.templates?.length || MAX_STYLE_TEMPLATES}，API/GPT 配置已加载。`
        : `已读取文件夹历史：${loadedTurns.length} 条，模板：${MAX_TEMPLATES} + 风格模板：${styleTemplatePayload?.templates?.length || MAX_STYLE_TEMPLATES}（已初始化），API/GPT 配置已初始化。`
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
    const effectiveModelIds = taskMode === "style" ? selectedModels.slice(0, 1) : selectedModels;
    const promptVariants = getComposerPromptVariants(taskMode, prompt, comparePrompts, styleThemes);
    const hasPromptInput = promptVariants.some((variant) => variant.prompt.trim());
    const inputBatch = (Array.isArray(uploadedInputImages) ? uploadedInputImages : [])
      .map((item) => (typeof item === "string" ? item : ""))
      .filter(Boolean)
      .slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    const fallbackInput = typeof uploadedImage === "string" && uploadedImage ? [uploadedImage] : [];
    const resolvedInputBatch = inputBatch.length ? inputBatch : fallbackInput;
    const hasImageInput = !!resolvedInputBatch.length || (taskMode === "style" && styleReferenceImages.length > 0);
    if (!effectiveModelIds.length || (!hasPromptInput && !hasImageInput)) return;

    const now = Date.now();
    const turnModelCounts = effectiveModelIds.reduce((acc, mid) => {
      acc[mid] = Math.max(1, Math.min(8, Number(modelCounts[mid]) || 1));
      return acc;
    }, {});
    const normalizedPromptVariants = promptVariants.map((variant) => ({
      ...variant,
      prompt: variant.prompt || "",
    }));
    const turnInputImages = resolvedInputBatch.length ? resolvedInputBatch : [null];
    const queuedTurns = turnInputImages.map((referenceImage, index) => ({
      id: now + index * 1000 + Math.floor(Math.random() * 1000),
      seq: seqRef.current + index,
      createdAt: now + index,
      mode: taskMode,
      prompt: taskMode === "compare" ? "" : (prompt || ""),
      styleBasePrompt: taskMode === "style" ? (prompt || "") : "",
      styleThemes: taskMode === "style" ? normalizeStyleThemes(styleThemes) : [],
      promptVariants: normalizedPromptVariants,
      apiBaseUrl: resolveApiBaseUrl(apiBaseUrl),
      apiKey: normalizeApiKey(apiKey),
      aspectRatio: normalizeAspectRatio(aspectRatio),
      referenceImage,
      styleReferenceImages: taskMode === "style" ? styleReferenceImages.slice(0, MAX_STYLE_REFERENCE_IMAGES) : [],
      selectedModelIds: [...effectiveModelIds],
      modelCounts: turnModelCounts,
      proxyUrl: proxyUrl.trim(),
      status: "queued",
      results: normalizedPromptVariants.flatMap((variant) =>
        effectiveModelIds.map((mid) => ({
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
    }));
    const displayTurns = [...queuedTurns].reverse();
    seqRef.current += queuedTurns.length;
    setActiveTurnId(displayTurns[0]?.id || null);
    setTurns((prev) => [...displayTurns, ...prev]);
    if (queuedTurns.length > 1) {
      setHistoryFolderMsg(`已创建 ${queuedTurns.length} 个任务（按输入图拆分）。`);
    }
    if (taskMode === "compare") {
      compareAEditor.setText((prev) => clearPlaceholderValues(prev), { record: false });
      compareBEditor.setText((prev) => clearPlaceholderValues(prev), { record: false });
    } else {
      promptEditor.setText((prev) => clearPlaceholderValues(prev), { record: false });
    }
  }, [proxyUrl, selectedModels, modelCounts, taskMode, prompt, comparePrompts, styleThemes, styleReferenceImages, apiBaseUrl, apiKey, aspectRatio, uploadedInputImages, uploadedImage, compareAEditor, compareBEditor, promptEditor]);

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
    setSelectedAtlasItems((prev) => prev.filter((item) => item.turnId !== turnId));
    setRetryingImageKeys((prev) => {
      const next = new Set();
      prev.forEach((key) => {
        if (!String(key).startsWith(`${turnId}:`)) next.add(key);
      });
      return next;
    });
    setAtlasThumbnail(null);
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
    const mode = getTurnMode(turn);
    const primaryPrompt = promptVariants[0]?.prompt || turn.prompt || "";
    if (mode === "style") {
      setTaskMode("style");
      promptEditor.resetText(typeof turn.styleBasePrompt === "string" ? turn.styleBasePrompt : primaryPrompt);
      compareAEditor.resetText(DEFAULT_COMPARE_PROMPTS.a);
      compareBEditor.resetText(DEFAULT_COMPARE_PROMPTS.b);
      setStyleThemes(normalizeStyleThemes(turn.styleThemes));
      setStyleReferenceImages(
        (Array.isArray(turn.styleReferenceImages) ? turn.styleReferenceImages : [])
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean)
          .slice(0, MAX_STYLE_REFERENCE_IMAGES)
      );
    } else if (mode === "compare") {
      setTaskMode("compare");
      promptEditor.resetText(primaryPrompt);
      compareAEditor.resetText(promptVariants[0]?.prompt || "");
      compareBEditor.resetText(promptVariants[1]?.prompt || "");
      setStyleThemes(normalizeStyleThemes(DEFAULT_STYLE_THEMES));
      setStyleReferenceImages([]);
    } else {
      setTaskMode("single");
      promptEditor.resetText(primaryPrompt);
      compareAEditor.resetText(DEFAULT_COMPARE_PROMPTS.a);
      compareBEditor.resetText(DEFAULT_COMPARE_PROMPTS.b);
      setStyleThemes(normalizeStyleThemes(DEFAULT_STYLE_THEMES));
      setStyleReferenceImages([]);
    }
    const nextSelectedModels =
      Array.isArray(turn.selectedModelIds) && turn.selectedModelIds.length
        ? mode === "style"
          ? turn.selectedModelIds.slice(0, 1)
          : turn.selectedModelIds
        : mode === "style"
        ? DEFAULT_SELECTED_MODELS.slice(0, 1)
        : DEFAULT_SELECTED_MODELS;
    setSelectedModels(nextSelectedModels);
    if (turn.modelCounts && typeof turn.modelCounts === "object") {
      setModelCounts((prev) => ({ ...prev, ...turn.modelCounts }));
      const firstSelectedModel = nextSelectedModels[0] || null;
      if (firstSelectedModel && typeof turn.modelCounts[firstSelectedModel] === "number") {
        setLastEditedCount(Math.max(1, Math.min(8, Number(turn.modelCounts[firstSelectedModel]) || 1)));
      }
    }
    setAspectRatio(normalizeAspectRatio(turn.aspectRatio ?? turn.geminiAspectRatio));
    if (turn.referenceImage) {
      setUploadedInputImages([turn.referenceImage]);
      setUploadedImage(turn.referenceImage);
      setUploadedPreview(turn.referenceImage);
    } else {
      setUploadedInputImages([]);
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
      const turnImageInputs = normalizeImageInputs(next.referenceImage, next.styleReferenceImages);
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

      const patchTaskResult = (task, updater) => {
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id !== next.id
              ? turn
              : {
                  ...turn,
                  results: turn.results.map((result) => {
                    if (!isSameResultTask(result, task.modelId, task.promptKey)) return result;
                    const base = {
                      ...result,
                      promptLabel: task.promptLabel,
                      promptText: task.promptText,
                    };
                    if (typeof updater === "function") return updater(base);
                    return { ...base, ...updater };
                  }),
                }
          )
        );
      };

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
            const requestedCount = Math.max(1, Number(task.requestedCount || next.modelCounts?.[task.modelId] || 1));
            let partialImages = [];
            let lastNonAbortError = null;

            for (let index = 0; index < requestedCount; index += 1) {
              try {
                const generated = await generateImage(next.proxyUrl, model, task.promptText, next.referenceImage, {
                  signal: controller.signal,
                  count: 1,
                  apiBaseUrl: next.apiBaseUrl || DEFAULT_API_BASE_URL,
                  apiKey: next.apiKey || DEFAULT_API_KEY,
                  aspectRatio: normalizeAspectRatio(next.aspectRatio ?? next.geminiAspectRatio),
                  imageInputs: turnImageInputs,
                });
                const nextImage = Array.isArray(generated) && generated.length ? generated[0] : null;
                if (!nextImage) {
                  lastNonAbortError = new Error("No images returned");
                  continue;
                }
                partialImages = [...partialImages, nextImage];
                patchTaskResult(task, (current) => ({
                  ...current,
                  status: "loading",
                  error: null,
                  images: [...(Array.isArray(current.images) ? current.images : []), nextImage],
                }));
              } catch (err) {
                if (isAbortError(err)) throw err;
                lastNonAbortError = err;
              }
            }

            if (!partialImages.length) {
              throw lastNonAbortError || new Error("No images returned");
            }

            patchTaskResult(task, {
              status: "success",
              error: null,
              images: partialImages,
            });
          } catch (err) {
            patchTaskResult(
              task,
              isAbortError(err)
                ? (current) => ({ ...current, status: "cancelled", error: "Cancelled by user" })
                : (current) => ({ ...current, status: "error", error: err?.message || "Unknown error" })
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
        await saveStyleTemplatesToLocalFolder(historyDirHandle, styleTemplates, activeStyleTemplateId);
      } catch {}
    })();
  }, [historyDirHandle, styleTemplates, activeStyleTemplateId]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveGptAssistToLocalFolder(historyDirHandle, gptAssistPrompt, styleThemeAssistPrompt);
      } catch {}
    })();
  }, [historyDirHandle, gptAssistPrompt, styleThemeAssistPrompt]);

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
  const composerPromptVariants = getComposerPromptVariants(taskMode, prompt, comparePrompts, styleThemes);
  const hasPromptInput = composerPromptVariants.some((variant) => variant.prompt.trim());
  const hasImageInput = inputImageList.length > 0 || (taskMode === "style" && styleReferenceImages.length > 0);
  const hasPlaceholderInComposer =
    taskMode === "compare"
      ? composerPromptVariants.some((variant) => extractPlaceholderTokens(variant.prompt).length > 0)
      : extractPlaceholderTokens(prompt).length > 0;
  const canRunGptAssist = !gptAssistBusy && !!proxyUrl.trim() && hasPlaceholderInComposer;
  const hasAnyStyleThemeValue = styleThemes.some((item) => typeof item === "string" && item.trim());
  const canRunStyleThemeAssist =
    taskMode === "style" &&
    !styleThemeAssistBusy &&
    !!proxyUrl.trim() &&
    !!styleThemeSeedInput.trim();
  const canGenerate = selectedModels.length > 0 && (hasPromptInput || hasImageInput);
  const inputImageCount = inputImageList.length;
  const inputPrimaryPreview = inputImageList[0] || null;
  const canEditInputImages = inputImageCount > 0;
  const isApiKeyDirty = normalizeApiKey(draftApiKey) !== normalizeApiKey(apiKey);
  const isGptAssistPromptDirty =
    normalizeGptAssistPrompt(draftGptAssistPrompt) !== normalizeGptAssistPrompt(gptAssistPrompt) ||
    normalizeStyleThemeAssistPrompt(draftStyleThemeAssistPrompt) !== normalizeStyleThemeAssistPrompt(styleThemeAssistPrompt);
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
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "single" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("single");
              }}
            >
              Single
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "compare" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("compare");
              }}
            >
              Prompt Compare
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "style" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("style");
              }}
            >
              Style
            </button>
          </nav>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(activePage === "help" ? S.apiSwitchBtnActive : null) }}
              onClick={() => setActivePage("help")}
            >
              Help
            </button>
          </div>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(showGptAssistModal ? S.apiSwitchBtnActive : null) }}
              onClick={() => {
                setDraftGptAssistPrompt(gptAssistPrompt);
                setDraftStyleThemeAssistPrompt(styleThemeAssistPrompt);
                setShowGptAssistModal(true);
              }}
            >
              GPT Prompt
            </button>
          </div>
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
          <button style={S.settingsBtn} onClick={() => setShowSettings(true)}>⚙</button>
        </div>
      </header>

      <main style={S.main}>
        {activePage === "help" ? (
          <HelpPage />
        ) : (
          <>
        <section style={{ marginBottom: 24 }}>
          <div style={taskMode === "style" ? S.inputGridStyle : S.inputGrid}>
            <div>
              <div style={S.promptHead}>
                <label style={{ ...S.label, marginBottom: 0 }}>{taskMode === "compare" ? "PROMPTS" : "PROMPT"}</label>
                <div style={S.promptHeadActions}>
                  {taskMode === "compare" && <span style={S.inputHint}>Shared image, dual prompt runs</span>}
                  <button
                    type="button"
                    style={S.placeholderBtn}
                    onClick={insertPlaceholderChip}
                    title="插入占位框 {{ }}"
                  >
                    【】
                  </button>
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
                    <TokenPromptInput
                      value={comparePrompts.a}
                      onChange={(next) => updateComparePrompt("a", next)}
                      onKeyDown={compareAEditor.handleKeyDown}
                      onFocus={() => { activePromptFieldRef.current = "a"; }}
                      editorRef={compareAInputRef}
                      placeholder="Describe prompt A..."
                      rows={4}
                    />
                  </div>
                  <div>
                    <TokenPromptInput
                      value={comparePrompts.b}
                      onChange={(next) => updateComparePrompt("b", next)}
                      onKeyDown={compareBEditor.handleKeyDown}
                      onFocus={() => { activePromptFieldRef.current = "b"; }}
                      editorRef={compareBInputRef}
                      placeholder="Describe prompt B..."
                      rows={4}
                    />
                  </div>
                </div>
              ) : (
                <TokenPromptInput
                  value={prompt}
                  onChange={(next) => promptEditor.setText(next)}
                  onKeyDown={promptEditor.handleKeyDown}
                  onFocus={() => { activePromptFieldRef.current = "single"; }}
                  editorRef={promptInputRef}
                  placeholder="Describe the image you want to generate..."
                  rows={4}
                />
              )}
            </div>
            <div style={S.refColumn}>
              {taskMode === "style" ? (
                <>
                  <div style={S.uploadPairRow}>
                    <div style={S.uploadPairCol}>
                      <div style={S.uploadPairTopLabel}>REFERENCE ({styleImageList.length}/{MAX_STYLE_REFERENCE_IMAGES})</div>
                      <button type="button" style={S.uploadPairBox} onClick={() => setShowStyleReferenceModal(true)}>
                        <div style={S.inputImagesGrid}>
                          {Array.from({ length: MAX_STYLE_REFERENCE_IMAGES }, (_, index) => {
                            const image = styleImageList[index];
                            return image ? (
                              <div key={`style-image-slot-${index}`} style={S.inputImagesCell}>
                                <img src={image} alt={`Reference ${index + 1}`} style={S.inputImagesThumb} />
                              </div>
                            ) : (
                              <div key={`style-empty-slot-${index}`} style={S.inputImagesEmpty}>
                                +
                              </div>
                            );
                          })}
                        </div>
                      </button>
                    </div>
                    <div style={S.uploadPairCol}>
                      <div style={S.uploadPairTopLabel}>INPUT</div>
                      <div
                        style={S.uploadPairBox}
                        role="button"
                        tabIndex={0}
                        onClick={() => fileRef.current?.click()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            fileRef.current?.click();
                          }
                        }}
                      >
                        {inputImageCount > 0 && <span style={S.inputCountBadge}>{inputImageCount}</span>}
                        {canEditInputImages && (
                          <button
                            type="button"
                            style={S.inputEditBtn}
                            onClick={(event) => {
                              event.stopPropagation();
                              setShowInputImageModal(true);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <div style={S.uploadPairBody}>
                          {inputPrimaryPreview ? (
                            <img src={inputPrimaryPreview} alt="Input" style={S.uploadPairMainThumb} />
                          ) : (
                            <div style={S.inputImagesEmpty}>+</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label style={S.label}>REFERENCE IMAGE</label>
                  {inputPrimaryPreview ? (
                    <div
                      style={S.uploadedBox}
                      role="button"
                      tabIndex={0}
                      onClick={() => fileRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          fileRef.current?.click();
                        }
                      }}
                    >
                      {inputImageCount > 0 && <span style={S.inputCountBadge}>{inputImageCount}</span>}
                      {canEditInputImages && (
                        <button
                          type="button"
                          style={S.inputEditBtn}
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowInputImageModal(true);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <img src={inputPrimaryPreview} alt="Ref" style={S.uploadedThumb} />
                      <button
                        type="button"
                        style={S.removeBtn}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeImage();
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button type="button" style={S.dropZone} onClick={() => fileRef.current?.click()}>
                      <span style={{ fontSize: 28, opacity: 0.4 }}>+</span>
                      <span style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Upload</span>
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (event) => {
                      const files = Array.from(event.target.files || []);
                      if (files.length) await appendInputImageFiles(files);
                      event.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                </>
              )}
              {taskMode === "style" && (
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (event) => {
                    const files = Array.from(event.target.files || []);
                    if (files.length) await appendInputImageFiles(files);
                    event.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
              )}
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 24 }}>
          <div style={taskMode === "style" ? S.modelTemplateGridStyle : S.modelTemplateGrid}>
            <div style={{ ...S.modelsPanel, ...(taskMode === "style" ? S.modelsPanelStyle : null) }}>
              <div style={S.modelsHeadRow}>
                <label style={{ ...S.label, marginBottom: 0 }}>
                  SELECT MODELS <span style={{ color: "#888", fontWeight: 400 }}>({selectedModels.length}/{taskMode === "style" ? 1 : 6})</span>
                </label>
                <button style={S.syncBtn} onClick={syncSelectedCounts} disabled={!selectedModels.length}>
                  Sync Last Edited Count
                </button>
              </div>
              <div style={taskMode === "style" ? S.modelGridStyle : S.modelGrid}>
                {IMAGE_MODELS.map((m) => (
                  <ModelChip
                    key={m.id}
                    model={m}
                    selected={selectedModels.includes(m.id)}
                    onToggle={toggleModel}
                    disabled={taskMode === "style" ? selectedModels.length >= 1 : selectedModels.length >= 6}
                    count={modelCounts[m.id] || 1}
                    onCountChange={setModelCount}
                    styleMode={taskMode === "style"}
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
                <label style={{ ...S.label, marginBottom: 0 }}>{taskMode === "style" ? "STYLE TEMPLATES" : "TEMPLATES"}</label>
              </div>
              {taskMode === "style" ? (
                <>
                  <div style={S.styleTemplateList}>
                    {styleTemplates.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          ...S.templateItem,
                          ...(item.id === activeStyleTemplateId ? S.templateItemActive : null),
                          ...(!templatesEnabled ? S.templateItemDisabled : null),
                        }}
                      onClick={() => {
                        if (!templatesEnabled) return;
                        selectStyleTemplateUsage(item.id);
                      }}
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
                            openStyleTemplateEditor(item.id);
                          }}
                          title="Edit style template"
                        >
                            ✎
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={S.styleThemesPanel}>
                    <div style={S.styleThemesHeadRow}>
                      <label style={{ ...S.label, marginBottom: 0 }}>THEMES (12)</label>
                      <button
                        type="button"
                        style={{ ...S.zipBtn, padding: "6px 10px", fontSize: 11, opacity: hasAnyStyleThemeValue ? 1 : 0.5, cursor: hasAnyStyleThemeValue ? "pointer" : "not-allowed" }}
                        onClick={clearAllStyleThemes}
                        disabled={!hasAnyStyleThemeValue}
                      >
                        Clear All
                      </button>
                    </div>
                    <div style={S.styleThemeAssistRow}>
                      <input
                        style={S.styleThemeAssistInput}
                        value={styleThemeSeedInput}
                        onChange={(event) => setStyleThemeSeedInput(event.target.value)}
                        placeholder="Theme association seed, e.g. coffee"
                      />
                      <button
                        type="button"
                        style={{ ...S.apiSaveBtn, padding: "0 12px", height: 30, opacity: canRunStyleThemeAssist ? 1 : 0.5, cursor: canRunStyleThemeAssist ? "pointer" : "not-allowed" }}
                        onClick={runStyleThemeAssist}
                        disabled={!canRunStyleThemeAssist}
                      >
                        {styleThemeAssistBusy ? "..." : "GPT 12"}
                      </button>
                    </div>
                    <div style={S.styleThemesGrid}>
                      {styleThemes.map((theme, index) => (
                        <input
                          key={`theme-${index + 1}`}
                          style={S.styleThemeInput}
                          value={theme}
                          onChange={(event) => updateStyleTheme(index, event.target.value)}
                          placeholder={`Theme ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
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
                          title="Edit template"
                        >
                          ✎
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </section>

        <div style={S.genRow}>
          <button style={{ ...S.genBtn, opacity: canGenerate ? 1 : 0.5 }}
            disabled={!canGenerate} onClick={handleGenerate}>
            {isProcessing ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={S.btnSpin} /> Running {runningCount} · Queued {queueCount}</span> : taskMode === "compare" ? "⬡ Enqueue Compare Tasks" : taskMode === "style" ? "⬡ Enqueue Style Tasks" : "⬡ Enqueue Task"}
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
        <div style={S.atlasRow}>
          <span style={S.atlasCount}>Selected {selectedAtlasItems.length}/{MAX_ATLAS_SELECTED_IMAGES}</span>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: selectedAtlasItems.length ? 1 : 0.5, cursor: selectedAtlasItems.length ? "pointer" : "not-allowed" }}
            onClick={clearAllSelections}
            disabled={!selectedAtlasItems.length || atlasBusy}
          >
            Clear Selections
          </button>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: historyDirHandle && selectedAtlasItems.length ? 1 : 0.5, cursor: historyDirHandle && selectedAtlasItems.length ? "pointer" : "not-allowed" }}
            onClick={exportAtlasSelection}
            disabled={!historyDirHandle || !selectedAtlasItems.length || atlasBusy}
          >
            Export Atlas Folder
          </button>
          {taskMode === "style" && (
            <button
              type="button"
              style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: selectedAtlasItems.length ? 1 : 0.5, cursor: selectedAtlasItems.length ? "pointer" : "not-allowed" }}
              onClick={() => setShowAtlasThumbnailModal(true)}
              disabled={!selectedAtlasItems.length || atlasBusy}
            >
              Thumbnail
            </button>
          )}
          {atlasThumbnail && (
            <button
              type="button"
              style={S.atlasThumbBtn}
              onClick={() => setShowAtlasThumbnailModal(true)}
              title="Open thumbnail editor"
            >
              <img src={atlasThumbnail} alt="Atlas Thumbnail" style={S.atlasThumbImg} />
            </button>
          )}
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
              canSyncTemplate={templatesEnabled && (getTurnMode(activeTurn) === "style" ? !!activeStyleTemplateId : !!activeTemplateId)}
              selectedImageKeys={selectedImageKeys}
              onToggleImageSelect={toggleImageSelection}
              onRetryImage={retryImage}
              onAppendImage={appendResultImage}
              retryingImageKeys={retryingImageKeys}
              compactStyleHistory={false}
              truncatePromptText={false}
              showModelSummary={true}
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
                    canSyncTemplate={templatesEnabled && (getTurnMode(turn) === "style" ? !!activeStyleTemplateId : !!activeTemplateId)}
                    selectedImageKeys={selectedImageKeys}
                    onToggleImageSelect={toggleImageSelection}
                    onRetryImage={retryImage}
                    onAppendImage={appendResultImage}
                    retryingImageKeys={retryingImageKeys}
                    compactStyleHistory={false}
                    truncatePromptText={true}
                    showModelSummary={false}
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
          </>
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
        styleThemePrompt={styleThemeAssistPrompt}
        draftStyleThemePrompt={draftStyleThemeAssistPrompt}
        setDraftStyleThemePrompt={setDraftStyleThemeAssistPrompt}
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
        canSave={!!templateDraft.title.trim() || !!templateDraft.body.trim() || !!templateDraft.backup.trim() || !!templateDraft.memo.trim()}
      />
      <StyleTemplateEditorModal
        show={showStyleTemplateModal}
        onClose={() => setShowStyleTemplateModal(false)}
        draft={styleTemplateDraft}
        setDraft={setStyleTemplateDraft}
        onSave={saveStyleTemplateDraft}
        canSave={!!styleTemplateDraft.title.trim() || !!styleTemplateDraft.body.trim()}
      />
      <InputImagesModal
        show={showInputImageModal}
        onClose={() => setShowInputImageModal(false)}
        title="Input Images"
        images={inputImageList}
        maxCount={MAX_INPUT_IMAGES_PER_BATCH}
        onUploadFiles={appendInputImageFiles}
        onRemoveAt={removeInputImageAt}
      />
      <InputImagesModal
        show={showStyleReferenceModal}
        onClose={() => setShowStyleReferenceModal(false)}
        title="Reference Images"
        images={styleImageList}
        maxCount={MAX_STYLE_REFERENCE_IMAGES}
        onUploadFiles={appendStyleReferenceFiles}
        onRemoveAt={removeStyleReferenceAt}
      />
      <SelectionLimitModal
        show={showSelectionLimitModal}
        onClose={() => setShowSelectionLimitModal(false)}
        limit={MAX_ATLAS_SELECTED_IMAGES}
      />
      <AtlasThumbnailModal
        show={showAtlasThumbnailModal}
        onClose={() => setShowAtlasThumbnailModal(false)}
        items={selectedAtlasItems}
        onReorder={reorderAtlasSelection}
        onGenerate={generateAtlasThumbnail}
        thumbnail={atlasThumbnail}
        busy={atlasBusy}
        onPreview={setPreviewImage}
      />
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        [contenteditable="true"][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #6b7280;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

// ─── Styles ───
const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', sans-serif";
const THEME_PRIMARY = "#3b82f6";
const THEME_PRIMARY_TEXT = "#bfdbfe";
const THEME_PRIMARY_SOFT = "rgba(59,130,246,0.16)";
const THEME_PRIMARY_BORDER = "rgba(59,130,246,0.45)";
const THEME_GOLD = "#facc15";
const THEME_GOLD_TEXT = "#fef08a";
const THEME_GOLD_SOFT = "rgba(250,204,21,0.14)";
const THEME_GOLD_BORDER = "rgba(250,204,21,0.55)";
const S = {
  root: { minHeight: "100vh", background: "#0a0a0b", color: "#e4e4e7", fontFamily: sans, position: "relative" },
  bgGrain: { position: "fixed", inset: 0, background: "radial-gradient(ellipse at 20% 0%, rgba(16,163,127,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(26,115,232,0.04) 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 },
  header: { position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  logoArea: { display: "flex", alignItems: "center", gap: 14 },
  logoCube: { width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #1a73e8, #10a37f)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 },
  title: { margin: 0, fontSize: 18, fontFamily: mono, fontWeight: 700, letterSpacing: 3, color: "#fff" },
  subtitle: { margin: 0, fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase" },
  headerActions: { display: "flex", alignItems: "center", gap: 12 },
  modeNav: { display: "flex", alignItems: "center", gap: 4, padding: 4, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" },
  modeTab: { padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", color: "#a1a1aa", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  modeTabActive: { background: THEME_GOLD_SOFT, color: THEME_GOLD },
  apiSwitchWrap: { position: "relative" },
  apiSwitchBtn: { height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#a1a1aa", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  apiSwitchBtnActive: { borderColor: THEME_PRIMARY_BORDER, color: THEME_PRIMARY_TEXT, background: THEME_PRIMARY_SOFT },
  settingsBtn: { width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#aaa", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  main: { position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "24px 20px 60px" },
  inputGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 136px", gap: 16 },
  inputGridStyle: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16 },
  refColumn: { display: "flex", flexDirection: "column" },
  label: { display: "block", fontSize: 11, fontFamily: mono, fontWeight: 600, letterSpacing: 1.5, color: "#999", marginBottom: 8, textTransform: "uppercase" },
  promptHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" },
  promptHeadActions: { display: "flex", alignItems: "center", gap: 8 },
  inputHint: { fontSize: 12, color: "#71717a", fontFamily: mono },
  placeholderBtn: { height: 20, minWidth: 26, borderRadius: 5, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 10, lineHeight: "18px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" },
  gptAssistBtn: { width: 20, height: 20, borderRadius: 5, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 11, lineHeight: "18px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  comparePromptGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  textarea: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", color: "#e4e4e7", fontFamily: sans, fontSize: 14, resize: "vertical", outline: "none", lineHeight: 1.6 },
  tokenEditor: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", color: "#e4e4e7", fontFamily: sans, fontSize: 14, outline: "none", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  dropZone: { width: "100%", height: PROMPT_EDITOR_MIN_HEIGHT, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "rgba(255,255,255,0.02)" },
  uploadedBox: { position: "relative", width: "100%", height: PROMPT_EDITOR_MIN_HEIGHT, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", background: "rgba(255,255,255,0.02)" },
  uploadedThumb: { width: "100%", height: "100%", objectFit: "cover" },
  removeBtn: { position: "absolute", bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 },
  uploadPairRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, alignItems: "stretch" },
  uploadPairCol: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  uploadPairTopLabel: { fontSize: 11, color: "#71717a", fontFamily: mono, letterSpacing: 0.5, textTransform: "uppercase" },
  uploadPairBox: { position: "relative", width: "100%", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, background: "rgba(255,255,255,0.03)", padding: 6, cursor: "pointer", textAlign: "left" },
  uploadPairBody: { borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", minHeight: 106 },
  uploadPairMainThumb: { width: "100%", height: 106, objectFit: "cover", display: "block" },
  inputImagesGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, minHeight: 106 },
  inputImagesCell: { borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", minHeight: 50 },
  inputImagesThumb: { width: "100%", height: 50, objectFit: "cover", display: "block" },
  inputImagesEmpty: { minHeight: 50, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.2)", color: "#71717a", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)", width: "100%" },
  inputCountBadge: { position: "absolute", top: 8, right: 8, zIndex: 3, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.88)", color: "#dbeafe", fontFamily: mono, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  inputEditBtn: { position: "absolute", top: 8, left: 8, zIndex: 3, height: 22, padding: "0 8px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(15,23,42,0.82)", color: "#e2e8f0", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  modelsPanel: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 10, height: "100%" },
  modelsPanelStyle: { width: "100%", maxWidth: "100%" },
  modelsHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  syncBtn: { padding: "6px 10px", borderRadius: 7, border: `1px solid ${THEME_GOLD_BORDER}`, background: THEME_GOLD_SOFT, color: THEME_GOLD_TEXT, fontFamily: mono, fontSize: 11, cursor: "pointer" },
  modelTemplateGrid: { display: "grid", gridTemplateColumns: "minmax(0, 5fr) minmax(0, 3fr)", gap: 12, alignItems: "stretch" },
  modelTemplateGridStyle: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, alignItems: "stretch" },
  modelGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  modelGridStyle: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  imageSizePanel: { border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 10px", background: "rgba(255,255,255,0.015)", marginTop: "auto" },
  imageSizeGroup: { display: "grid", gap: 6, marginBottom: 8 },
  imageSizeGroupTitle: { fontSize: 11, color: "#8b8b93", fontFamily: mono },
  imageSizeBtnRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  imageSizeBtn: { padding: "5px 8px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.03)", color: "#c4c4cc", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  imageSizeBtnActive: { borderColor: THEME_PRIMARY_BORDER, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  imageSizeWarn: { margin: "2px 0 0", fontSize: 11, color: "#a1a1aa", fontFamily: mono, lineHeight: 1.5 },
  templatePanel: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.02)", height: "100%" },
  templatePanelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  templateFieldHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  templateStatus: { fontSize: 11, color: "#71717a", fontFamily: mono, marginBottom: 8 },
  templateList: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  styleTemplateList: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  styleThemesPanel: { marginTop: 10, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 8, background: "rgba(255,255,255,0.02)" },
  styleThemesHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  styleThemeAssistRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 },
  styleThemeAssistInput: { width: "100%", height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, padding: "0 8px", outline: "none" },
  styleThemesGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  styleThemeInput: { width: "100%", height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, padding: "0 8px", outline: "none" },
  templateItem: { width: "100%", border: "1px solid rgba(63,63,70,0.9)", borderRadius: 8, padding: "8px 8px 8px 10px", background: "rgba(12,12,14,0.9)", minHeight: 38, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", color: "#71717a", cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent", boxShadow: "none" },
  templateItemDisabled: { opacity: 0.55, cursor: "not-allowed" },
  templateItemActive: { borderColor: THEME_PRIMARY_BORDER, boxShadow: "none", background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT },
  templateItemTitle: { fontSize: 11, color: "inherit", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 },
  templateActions: { display: "inline-flex", alignItems: "center", justifyContent: "center" },
  templateEditBtn: { width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(82,82,91,0.9)", background: "rgba(24,24,27,0.9)", color: "#a1a1aa", fontSize: 12, fontFamily: mono, cursor: "pointer", padding: 0, lineHeight: "24px", textAlign: "center", outline: "none" },
  modelChipWrap: { border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 6, background: "rgba(255,255,255,0.02)" },
  modelRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" },
  modelChip: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 8px", borderRadius: 7, border: "1px solid", color: "#e4e4e7", fontSize: 12, fontFamily: sans, transition: "all 0.15s", width: "100%", minHeight: 34 },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  chipName: { fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 },
  chipNameStyleMode: { fontWeight: 500, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 162 },
  check: { marginLeft: "auto", color: "#10a37f", fontWeight: 700, fontSize: 14 },
  countRow: { display: "flex", alignItems: "center", gap: 4 },
  countLabel: { fontSize: 11, color: "#999", fontFamily: mono, width: 10, textAlign: "center" },
  countSelect: { width: 58, height: 34, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 12, outline: "none" },
  genRow: { display: "flex", gap: 12, marginBottom: 32, alignItems: "center" },
  folderRow: { display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" },
  atlasRow: { display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" },
  atlasCount: { fontSize: 12, color: THEME_PRIMARY_TEXT, fontFamily: mono, minWidth: 120 },
  atlasThumbBtn: { width: 54, height: 54, borderRadius: 8, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.65)", overflow: "hidden", padding: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  atlasThumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  helpWrap: { display: "grid", gap: 16 },
  helpHero: { borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(26,115,232,0.2), rgba(16,163,127,0.08))", padding: "22px 24px" },
  helpTitle: { margin: 0, fontSize: 28, fontFamily: mono, color: "#f8fafc", letterSpacing: -0.5 },
  helpTextBlock: { display: "grid", gap: 8 },
  helpIntro: { margin: "10px 0 0", fontSize: 14, color: "#9ca3af", lineHeight: 1.7, maxWidth: 760 },
  helpIntroCn: { margin: 0, fontSize: 14, color: "#a7b0bf", lineHeight: 1.8, maxWidth: 760 },
  helpGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 },
  helpCard: { borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "18px 18px 16px" },
  helpCardFull: { gridColumn: "1 / -1" },
  helpCardTitle: { margin: "0 0 8px", fontSize: 13, color: "#f8fafc", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.6 },
  helpCardText: { margin: 0, fontSize: 13, color: "#98a2b3", lineHeight: 1.7 },
  helpCardTextCn: { margin: 0, fontSize: 13, color: "#a8b1c0", lineHeight: 1.8 },
  helpParagraphGroup: { display: "grid", gap: 8 },
  helpParagraphItem: { display: "grid" },
  helpLangGap: { height: 8 },
  helpInlineCode: { fontFamily: mono, fontSize: "0.95em", color: "#f8fafc", background: "rgba(148,163,184,0.12)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 6, padding: "1px 6px", margin: "0 2px" },
  folderHint: { fontSize: 12, color: "#a1a1aa", fontFamily: mono },
  folderMsg: { fontSize: 12, color: THEME_PRIMARY_TEXT, marginBottom: 18, fontFamily: mono },
  genBtn: { padding: "12px 32px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #1a73e8, #10a37f)", color: "#fff", fontFamily: mono, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  zipBtn: { padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#e4e4e7", fontFamily: mono, fontSize: 13, cursor: "pointer" },
  btnSpin: { display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.6s linear infinite" },
  resultCol: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, minHeight: 200 },
  resultHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" },
  resultName: { fontFamily: mono, fontSize: 13, fontWeight: 600, flex: 1 },
  statusBadge: { fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, textTransform: "capitalize" },
  loadingArea: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0" },
  spinner: { width: 32, height: 32, border: "3px solid rgba(59,130,246,0.2)", borderTopColor: THEME_PRIMARY, borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  errArea: { padding: "20px 12px" },
  imgGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 },
  imgGridCompact: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6 },
  imgCard: { position: "relative", borderRadius: 8, overflow: "hidden", background: "#111", border: "1px solid transparent", boxShadow: "none" },
  imgCardCompact: { borderRadius: 6 },
  imgCardSelected: { borderColor: "rgba(59,130,246,0.9)", boxShadow: "0 0 0 1px rgba(59,130,246,0.35) inset" },
  imageSelectBtn: { position: "absolute", top: 8, right: 8, zIndex: 3, width: 24, height: 24, borderRadius: 12, border: "1px solid rgba(226,232,240,0.7)", background: "rgba(15,23,42,0.72)", color: "rgba(226,232,240,0.88)", fontFamily: mono, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1, outline: "none", boxShadow: "none", WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent" },
  imageSelectBtnCompact: { top: 4, right: 4, width: 16, height: 16, borderRadius: 8, fontSize: 10 },
  imageSelectBtnBottom: { top: "auto", bottom: 4, right: 4 },
  imageSelectBtnActive: { borderColor: "rgba(16,163,127,0.9)", background: "rgba(5,150,105,0.92)", color: "#dcfce7" },
  imageThemeTag: { position: "absolute", left: 8, top: 8, zIndex: 2, maxWidth: "70%", padding: "2px 7px", borderRadius: 999, fontSize: 10, fontFamily: mono, color: THEME_PRIMARY_TEXT, background: "rgba(6,78,59,0.82)", border: `1px solid ${THEME_PRIMARY_BORDER}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  imageThemeTagCompact: { left: 4, top: 4, maxWidth: "75%", padding: "1px 5px", fontSize: 9, borderRadius: 999 },
  thumb: { width: "100%", aspectRatio: "4 / 3", objectFit: "contain", cursor: "pointer", display: "block", background: "#0b0b0d" },
  thumbCompact: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", cursor: "pointer", display: "block", background: "#0b0b0d" },
  thumbRetrying: { width: "100%", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.65)", color: "#cbd5e1", fontFamily: mono, fontSize: 12 },
  thumbRetryingCompact: { width: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.65)", color: "#cbd5e1", fontFamily: mono, fontSize: 10 },
  imageActionBar: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" },
  imageActionBarCompact: { minHeight: 28 },
  imageActionBtn: { height: 34, border: "none", borderRight: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#cbd5e1", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  imageActionBtnCompact: { height: 28, border: "none", borderRight: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "#cbd5e1", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  imageActionBtnBusy: { opacity: 0.6, cursor: "wait" },
  imageActionBtnDisabled: { opacity: 0.35, cursor: "not-allowed" },
  imageActionIcon: { fontSize: 18, lineHeight: 1, fontWeight: 700 },
  imageActionIconCompact: { fontSize: 16, lineHeight: 1, fontWeight: 700 },
  imageActionPlus: { fontSize: 13, lineHeight: 1, fontWeight: 700 },
  imageActionPlusCompact: { fontSize: 12, lineHeight: 1, fontWeight: 700 },
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
  apiSaveBtn: { padding: "8px 14px", borderRadius: 8, border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 12, cursor: "pointer" },
  inputImagesModal: { maxWidth: 820 },
  modalInputImagesHint: { marginBottom: 12, fontSize: 12, color: "#a1a1aa", fontFamily: mono, lineHeight: 1.5 },
  modalInputImagesGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 },
  modalInputImageCell: { position: "relative", borderRadius: 10, overflow: "hidden", border: `1px solid ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT },
  modalInputImageThumb: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" },
  modalInputImageRemoveBtn: { position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(15,23,42,0.8)", color: "#e2e8f0", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  modalInputImageEmpty: { aspectRatio: "1 / 1", borderRadius: 10, border: `1px dashed ${THEME_PRIMARY_BORDER}`, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontFamily: mono, fontSize: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, gap: 6 },
  modalInputImageEmptyDisabled: { opacity: 0.45, cursor: "not-allowed" },
  modalInputImageUploadPlus: { fontSize: 28, lineHeight: 1 },
  modalInputImageUploadText: { fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" },
  modalInputImagesActions: { marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  selectionLimitModal: { width: "min(420px, 90vw)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", background: "#161618", padding: "24px 22px", boxShadow: "0 18px 60px rgba(0,0,0,0.35)" },
  selectionLimitTitle: { fontSize: 18, color: "#f8fafc", fontFamily: mono, marginBottom: 8 },
  selectionLimitText: { fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 },
  atlasModalHint: { fontSize: 12, color: "#a1a1aa", fontFamily: mono, marginBottom: 14 },
  atlasModalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 },
  atlasModalCard: { position: "relative", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", overflow: "hidden", cursor: "grab" },
  atlasModalCardDragging: { opacity: 0.5, transform: "scale(0.98)" },
  atlasModalCardOrder: { position: "absolute", top: 8, left: 8, zIndex: 2, minWidth: 24, height: 24, padding: "0 6px", borderRadius: 12, background: "rgba(2,6,23,0.78)", color: "#f8fafc", fontFamily: mono, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  atlasModalCardThumb: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block", background: "#0b0b0d" },
  atlasModalCardMeta: { padding: "10px 10px 12px", display: "grid", gap: 4 },
  atlasModalCardTitle: { fontSize: 12, color: "#f4f4f5", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  atlasModalCardSub: { fontSize: 11, color: "#a1a1aa", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  atlasModalPreview: { marginTop: 16, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" },
  atlasModalPreviewImg: { width: "100%", display: "block", objectFit: "contain", background: "#0b0b0d" },
  turnActionBtn: { height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.04)", color: "#d4d4d8", fontSize: 11, fontFamily: mono, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  turnPromptRow: { marginBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  turnModeBadge: { display: "inline-flex", alignItems: "center", marginLeft: 8, padding: "2px 8px", borderRadius: 999, background: THEME_PRIMARY_SOFT, color: THEME_PRIMARY_TEXT, fontSize: 11, fontFamily: mono },
  turnPromptCards: { flex: "1 1 320px", minWidth: 220, display: "grid", gap: 10 },
  turnPromptCard: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: "12px 14px" },
  turnPromptCardCompact: { maxHeight: 96, overflow: "hidden" },
  turnPromptBadge: { display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, background: THEME_GOLD_SOFT, color: THEME_GOLD, fontSize: 10, fontFamily: mono, marginBottom: 8 },
  turnPromptText: { fontSize: 13, color: "#e4e4e7", whiteSpace: "pre-wrap", lineHeight: 1.5 },
  turnPromptTextCompact: { maxHeight: 72, overflow: "hidden" },
  promptChipReadonly: { background: "rgba(59,130,246,0.18)", color: THEME_PRIMARY_TEXT, border: "1px solid rgba(59,130,246,0.62)", borderRadius: 6, padding: "1px 6px", display: "inline-block", margin: "0 1px" },
  styleHistorySummary: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 },
  styleSummaryItem: { borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.24)", padding: "8px 10px", display: "grid", gap: 4 },
  styleSummaryKey: { fontSize: 10, color: "#71717a", fontFamily: mono, textTransform: "uppercase", letterSpacing: 0.4 },
  styleSummaryVal: { fontSize: 12, color: "#e4e4e7", fontFamily: mono, fontWeight: 600 },
  turnStyleUnifiedWrap: { display: "grid", gap: 10 },
  turnStyleFailedLine: { borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(127,29,29,0.2)", color: "#fca5a5", fontFamily: mono, fontSize: 11, padding: "7px 10px" },
  turnStyleImageBox: { borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 10, display: "grid", gap: 8 },
  turnStyleImageHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  turnStyleImageEmpty: { borderRadius: 8, border: "1px dashed rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.2)", color: "#71717a", fontFamily: mono, fontSize: 12, padding: "14px 10px", textAlign: "center" },
  turnCompareResultsGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 },
  turnStyleResultsGrid: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 },
  turnResultGroup: { marginTop: 16 },
  turnResultGroupHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" },
  turnResultMeta: { fontSize: 11, color: "#71717a", fontFamily: mono },
  turnRefImageStack: { display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", overflowX: "auto", paddingBottom: 2, maxWidth: "100%" },
  turnRefImageBtn: { width: 96, height: 96, borderRadius: 8, padding: 0, border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", background: "transparent", cursor: "zoom-in", flexShrink: 0 },
  turnRefImage: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
};
