import JSZip from "jszip";
import {
  API_CONFIG_FILE_NAME,
  ASPECT_RATIO_OPTIONS,
  DEFAULT_API_BASE_URL,
  DEFAULT_API_BASE_URLS,
  DEFAULT_API_KEYS,
  DEFAULT_API_PLATFORM,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_BAILIAN_ASSIST_MODEL,
  DEFAULT_GPT_ASSIST_MODEL,
  DEFAULT_GPT_ASSIST_PROMPT,
  DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE,
  DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT,
  DEFAULT_SPLIT_GROUP_MODE,
  DEFAULT_SPLIT_BG_COLOR,
  DEFAULT_SPLIT_RENDER_MODE,
  DEFAULT_SPLIT_SHAPE_MODE,
  DEFAULT_STYLE_TEMPLATES,
  DEFAULT_STYLE_THEMES,
  DEFAULT_STYLE_THEME_ASSIST_PROMPT,
  DEFAULT_TEMPLATES,
  GPT_ASSIST_FILE_NAME,
  MAX_ATLAS_SELECTED_IMAGES,
  MAX_CLUSTERED_SPLIT_ITEMS,
  MAX_INPUT_IMAGES_PER_BATCH,
  MAX_SPLIT_EXPORT_ITEMS,
  MAX_STYLE_REFERENCE_IMAGES,
  NANO_PRO_LEGACY_MODEL_IDS,
  NANO_PRO_OFFICIAL_MODEL_ID,
  SPLIT_GROUP_MODE_ORDER,
  SPLIT_RENDER_MODE_ORDER,
  SPLIT_SHAPE_MODE_ORDER,
  STYLE_TEMPLATE_FILE_NAME,
  STYLE_THEME_SLOTS,
  TEMPLATE_FILE_NAME,
} from "../config/appConfig";
import { getRuntimeConfig } from "./runtimeConfig";

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function stripBase64Prefix(dataUrl) {
  if (!dataUrl) return "";
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.substring(idx + 1) : dataUrl;
}

export function getMimeFromDataUrl(dataUrl) {
  const m = dataUrl?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return m ? m[1] : "image/png";
}

export function isAbortError(err) {
  const msg = String(err?.message || "");
  return err?.name === "AbortError" || /abort|cancel/i.test(msg);
}

export function sleep(ms, signal) {
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

export function shouldRetryApiFailure(status, text = "") {
  if (status === 408 || status === 409 || status === 425 || status === 429) return true;
  if (status >= 500) return true;
  return /未接收到上游响应内容|upstream|timeout|temporarily unavailable|traceid/i.test(text);
}

export function normalizeApiBaseUrl(value) {
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

export function normalizeApiPlatform(value) {
  if (value === "bailian") return "bailian";
  if (value === "comet") return "comet";
  if (value === "lumina") return "lumina";
  return DEFAULT_API_PLATFORM;
}

export function getDefaultApiBaseUrl(apiPlatform = DEFAULT_API_PLATFORM) {
  return DEFAULT_API_BASE_URLS[normalizeApiPlatform(apiPlatform)] || DEFAULT_API_BASE_URL;
}

export function resolveApiBaseUrl(value, apiPlatform = DEFAULT_API_PLATFORM) {
  return normalizeApiBaseUrl(value) || getDefaultApiBaseUrl(apiPlatform);
}

export function normalizeApiKey(value) {
  if (typeof value !== "string") return "";
  let next = value.trim();
  if (!next) return "";
  next = next.replace(/^authorization\s*:\s*/i, "").trim();
  next = next.replace(/^x-goog-api-key\s*:\s*/i, "").trim();
  next = next.replace(/^bearer\s+/i, "").trim();
  next = next.replace(/^["']+|["']+$/g, "").trim();
  return next;
}

export function normalizeApiKeys(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    comet: normalizeApiKey(source.comet || source.cometKey || source.cometapiKey || source.COMETAPI_KEY || ""),
    bailian: normalizeApiKey(source.bailian || source.bailianKey || source.dashscopeKey || source.DASHSCOPE_API_KEY || ""),
    lumina: normalizeApiKey(source.lumina || source.luminaKey || source.LUMINA_API_KEY || ""),
  };
}

// Merge saved task snapshots with newer settings. Later non-empty values win,
// while an empty current field still allows a legacy task key to act as fallback.
export function mergeApiKeys(...sources) {
  return sources.reduce(
    (merged, source) => {
      const normalized = normalizeApiKeys(source);
      for (const platform of ["comet", "bailian", "lumina"]) {
        if (normalized[platform]) merged[platform] = normalized[platform];
      }
      return merged;
    },
    normalizeApiKeys(DEFAULT_API_KEYS)
  );
}

export function getApiKeyForPlatform(apiKeys, apiPlatform = DEFAULT_API_PLATFORM) {
  const normalizedKeys = normalizeApiKeys(apiKeys);
  const platform = normalizeApiPlatform(apiPlatform);
  return normalizedKeys[platform] || "";
}

export function getAssistPlatformOrder(apiKeys) {
  const normalizedKeys = normalizeApiKeys(apiKeys);
  const base = ["comet", "bailian"];
  // Lead with whichever platforms actually have a saved key, keeping comet first by default.
  const withKey = base.filter((platform) => normalizedKeys[platform]);
  const withoutKey = base.filter((platform) => !normalizedKeys[platform]);
  return [...withKey, ...withoutKey];
}

export function resolveTextAssistTargetPath(apiPlatform = DEFAULT_API_PLATFORM) {
  return normalizeApiPlatform(apiPlatform) === "bailian"
    ? "/compatible-mode/v1/chat/completions"
    : "/v1/chat/completions";
}

export function resolveTextAssistModelId(apiPlatform = DEFAULT_API_PLATFORM) {
  return normalizeApiPlatform(apiPlatform) === "bailian"
    ? DEFAULT_BAILIAN_ASSIST_MODEL
    : DEFAULT_GPT_ASSIST_MODEL;
}

export function isModelAvailableOnPlatform(model, apiPlatform = DEFAULT_API_PLATFORM) {
  if (!model) return false;
  const supportedPlatforms =
    Array.isArray(model.platforms) && model.platforms.length
      ? model.platforms
      : [DEFAULT_API_PLATFORM];
  return supportedPlatforms.includes(normalizeApiPlatform(apiPlatform));
}

export function getModelApiPlatform(model) {
  if (!model) return DEFAULT_API_PLATFORM;
  const supportedPlatforms =
    Array.isArray(model.platforms) && model.platforms.length
      ? model.platforms
      : [DEFAULT_API_PLATFORM];
  return normalizeApiPlatform(supportedPlatforms[0]);
}

export function getApiConfigForPlatform(apiPlatform, apiKeys) {
  const platform = normalizeApiPlatform(apiPlatform);
  return {
    apiPlatform: platform,
    apiBaseUrl: getDefaultApiBaseUrl(platform),
    apiKey: getApiKeyForPlatform(apiKeys, platform),
  };
}

export function getApiConfigForModel(model, apiKeys) {
  return getApiConfigForPlatform(getPreferredModelApiPlatform(model, apiKeys), apiKeys);
}

// 除百炼模型外，只要模型声明支持 Lumina 且用户已填写 Lumina Key，
// 就优先走 Lumina；Lumina Key 为空时回退到模型声明的首个平台。
export function getPreferredModelApiPlatform(model, apiKeys) {
  if (!model) return DEFAULT_API_PLATFORM;
  const supportedPlatforms =
    Array.isArray(model.platforms) && model.platforms.length
      ? model.platforms.map(normalizeApiPlatform)
      : [DEFAULT_API_PLATFORM];
  if (supportedPlatforms.includes("lumina") && normalizeApiKeys(apiKeys).lumina) {
    return "lumina";
  }
  return normalizeApiPlatform(supportedPlatforms[0]);
}

export function normalizeAspectRatio(value) {
  if (typeof value !== "string") return DEFAULT_ASPECT_RATIO;
  const normalized = value.trim();
  if (!normalized) return DEFAULT_ASPECT_RATIO;
  return ASPECT_RATIO_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_ASPECT_RATIO;
}

export function normalizeModelId(id) {
  if (typeof id !== "string") return id;
  if (NANO_PRO_LEGACY_MODEL_IDS.includes(id)) return NANO_PRO_OFFICIAL_MODEL_ID;
  if (id === "qwen-image-3.0" || id === "qwen-image-3.0-pro") return "qwen-image-invite-beta-v1";
  if (id === "qwen-image-plus") return "qwen-image-2.0";
  if (id === "qwen-image-max") return "qwen-image-2.0-pro";
  return id;
}

// gpt-image 仅支持有限档位：1024x1024 / 1536x1024(横) / 1024x1536(竖) / auto。
// auto 透传给上游，让模型按输入图比例自适应；其余按方向归到最接近的一档。
export function mapAspectRatioToOpenAiImageSize(aspectRatio = DEFAULT_ASPECT_RATIO) {
  const ratio = normalizeAspectRatio(aspectRatio);
  if (ratio === "auto") return "auto";
  const [w, h] = ratio.split(":").map((n) => Number(n) || 0);
  if (!w || !h || w === h) return "1024x1024";
  return w > h ? "1536x1024" : "1024x1536";
}

const LUMINA_IMAGE_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"];

export function mapAspectRatioToLuminaRatio(aspectRatio = DEFAULT_ASPECT_RATIO) {
  const ratio = normalizeAspectRatio(aspectRatio);
  if (ratio === "auto" || LUMINA_IMAGE_RATIOS.includes(ratio)) return ratio;
  const [width, height] = ratio.split(":").map(Number);
  const target = width / height;
  return LUMINA_IMAGE_RATIOS.reduce((closest, candidate) => {
    const [candidateWidth, candidateHeight] = candidate.split(":").map(Number);
    const distance = Math.abs(Math.log(target / (candidateWidth / candidateHeight)));
    const [closestWidth, closestHeight] = closest.split(":").map(Number);
    const closestDistance = Math.abs(Math.log(target / (closestWidth / closestHeight)));
    return distance < closestDistance ? candidate : closest;
  }, LUMINA_IMAGE_RATIOS[0]);
}

export function supportsOpenAiImageEdits(model) {
  // /v1/images/edits（multipart）在 gpt-image-1 系列兼容性更稳定。
  // gpt-image-1.5 / gpt-image-2 在部分通道会按 JSON 解析请求体，
  // 对 multipart 报 "invalid character '-' in numeric literal"。
  // 因此这里仅保留 gpt-image-1 / gpt-image-1-mini 走 edits。
  return model?.provider === "OpenAI" && /^gpt-image-(?:1(?:-mini)?)(?:-|$)/i.test(String(model?.id || ""));
}

export function isQwenImageModel(model) {
  return isQwenImage2Model(model) || isQwenImage3Model(model);
}

export function isQwenImage2Model(model) {
  return /^qwen-image-2\.0(?:-pro)?(?:-|$)/.test(String(model?.id || ""));
}

export function isQwenImage3Model(model) {
  return String(model?.id || "") === "qwen-image-invite-beta-v1";
}

export function normalizeQwenPromptExtendMode(value) {
  return value === "agent" ? "agent" : "direct";
}

export function roundBailianSize(value, step = 64) {
  const safe = Number(value) || step;
  return Math.max(step, Math.round(safe / step) * step);
}

export function getBailianAspectRatioSize(aspectRatio = DEFAULT_ASPECT_RATIO) {
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  const presetSizes = {
    "1:1": "2048*2048",
    "4:3": "2368*1728",
    "3:4": "1728*2368",
    "16:9": "2688*1536",
    "9:16": "1536*2688",
  };
  if (presetSizes[normalizedRatio]) return presetSizes[normalizedRatio];
  if (normalizedRatio === DEFAULT_ASPECT_RATIO) return null;

  const [widthRatio, heightRatio] = normalizedRatio.split(":").map((value) => Number(value) || 0);
  if (!widthRatio || !heightRatio) return null;

  const maxPixels = 2048 * 2048;
  let width = roundBailianSize(Math.sqrt((maxPixels * widthRatio) / heightRatio));
  let height = roundBailianSize((width * heightRatio) / widthRatio);

  while (width * height > maxPixels && width > 512 && height > 512) {
    if (widthRatio >= heightRatio) {
      width = Math.max(512, width - 64);
      height = roundBailianSize((width * heightRatio) / widthRatio);
    } else {
      height = Math.max(512, height - 64);
      width = roundBailianSize((height * widthRatio) / heightRatio);
    }
  }

  return `${width}*${height}`;
}

export function getQwen3ImageEditSize(aspectRatio = DEFAULT_ASPECT_RATIO) {
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  if (normalizedRatio === DEFAULT_ASPECT_RATIO) return null;

  const [rawWidthRatio, rawHeightRatio] = normalizedRatio.split(":").map((value) => Number(value) || 0);
  if (!rawWidthRatio || !rawHeightRatio) return null;

  const gcd = (left, right) => {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b) [a, b] = [b, a % b];
    return a || 1;
  };
  const divisor = gcd(rawWidthRatio, rawHeightRatio);
  const widthRatio = rawWidthRatio / divisor;
  const heightRatio = rawHeightRatio / divisor;
  const maxPixels = 1_500 * 1_500;
  const maxSide = 2048;
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(
        Math.sqrt(maxPixels / (widthRatio * heightRatio)),
        maxSide / Math.max(widthRatio, heightRatio),
      ),
    ),
  );

  return `${widthRatio * scale}*${heightRatio * scale}`;
}

export function getBailianImageInputLimit(model) {
  if (isQwenImageModel(model)) return 3;
  if (/^wan2\.7-image(?:-pro)?(?:-|$)/.test(String(model?.id || ""))) return 9;
  return MAX_INPUT_IMAGES_PER_BATCH;
}

export function getBailianImageSize(model, aspectRatio = DEFAULT_ASPECT_RATIO, hasImageInputs = false) {
  const isQwen2Model = isQwenImage2Model(model);
  const isQwen3Model = isQwenImage3Model(model);
  const fallbackSize = isQwen2Model ? "2048*2048" : "2K";
  const normalizedRatio = normalizeAspectRatio(aspectRatio);
  if (normalizedRatio === DEFAULT_ASPECT_RATIO) {
    // Qwen3 auto-selects resolution from the prompt; Qwen 2.0 editing follows the last input ratio.
    if (isQwen3Model || (isQwen2Model && hasImageInputs)) return null;
    return fallbackSize;
  }
  if (isQwen3Model && hasImageInputs) {
    return getQwen3ImageEditSize(normalizedRatio);
  }
  // Wan and Qwen both accept custom width*height values, so a non-auto ratio
  // should keep using an explicit size even when image inputs are present.
  return getBailianAspectRatioSize(normalizedRatio) || fallbackSize;
}

export function getGeminiModelCandidates(id) {
  const normalized = normalizeModelId(id);
  if (normalized !== NANO_PRO_OFFICIAL_MODEL_ID) return [normalized];
  return [NANO_PRO_OFFICIAL_MODEL_ID, ...NANO_PRO_LEGACY_MODEL_IDS];
}

export function mergePromptWithAspectRatio(prompt, aspectRatio, model) {
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

export function normalizeGptAssistPrompt(value) {
  if (typeof value !== "string") return DEFAULT_GPT_ASSIST_PROMPT;
  const next = value.trim();
  return next || DEFAULT_GPT_ASSIST_PROMPT;
}

export function normalizeGptAssistFlag(value, fallback = true) {
  if (typeof value === "boolean") return value;
  return fallback;
}

export function normalizeStyleThemeAssistPrompt(value) {
  if (typeof value !== "string") return DEFAULT_STYLE_THEME_ASSIST_PROMPT;
  const next = value.trim();
  return next || DEFAULT_STYLE_THEME_ASSIST_PROMPT;
}

export function extractPlaceholderTokens(input = "") {
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

export function applyPlaceholderReplacements(input = "", replacements = []) {
  const text = typeof input === "string" ? input : "";
  let cursor = 0;
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, original) => {
    const next = replacements[cursor];
    cursor += 1;
    const fallback = typeof original === "string" ? original : "";
    return `{{${typeof next === "string" ? next.trim() : fallback}}}`;
  });
}

export function clearPlaceholderValues(input = "") {
  const text = typeof input === "string" ? input : "";
  return text.replace(/\{\{[^{}]*\}\}/g, "{{}}");
}

export function expandPlaceholderValues(input = "") {
  const text = typeof input === "string" ? input : "";
  return text.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => String(inner ?? "").trim());
}

export function getFilledPlaceholderTokens(input = "") {
  return extractPlaceholderTokens(input)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function splitPromptByPlaceholders(input = "") {
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

export function assistantMessageToText(content) {
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

export function parseJsonFromText(rawText = "") {
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

export function parseThemeSuggestions(rawText = "") {
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

export function normalizeImageInputs(imageBase64, imageInputs = []) {
  const collected = [];
  if (typeof imageBase64 === "string" && imageBase64.trim()) collected.push(imageBase64.trim());
  if (Array.isArray(imageInputs)) {
    imageInputs.forEach((item) => {
      if (typeof item === "string" && item.trim()) collected.push(item.trim());
    });
  }
  return Array.from(new Set(collected));
}

export function injectThemeIntoPrompt(basePrompt = "", theme = "") {
  const promptText = typeof basePrompt === "string" ? basePrompt : "";
  const themeText = typeof theme === "string" ? theme.trim() : "";
  if (!themeText) return promptText;
  if (!promptText.trim()) return promptText;
  if (/\{\{[^{}]*\}\}/.test(promptText)) {
    return promptText.replace(/\{\{[^{}]*\}\}/, themeText);
  }
  return `${promptText}\nTheme: ${themeText}`;
}

export function buildStylePromptVariants(basePrompt = "", themes = []) {
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

export function formatAtlasFolderName(items = []) {
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

export function buildAtlasImageFileStem(item, index = 0) {
  const theme = safeName(item?.theme || `theme_${index + 1}`);
  const model = safeName(item?.modelName || item?.modelId || "model");
  return `${String(index + 1).padStart(2, "0")}_${theme}_${model}`;
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(src)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function normalizeEditorRect(start, end, boundsWidth, boundsHeight) {
  const maxWidth = Math.max(1, Number(boundsWidth) || 1);
  const maxHeight = Math.max(1, Number(boundsHeight) || 1);
  const clamp = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
  const x1 = clamp(Math.min(start?.x ?? 0, end?.x ?? 0), maxWidth);
  const y1 = clamp(Math.min(start?.y ?? 0, end?.y ?? 0), maxHeight);
  const x2 = clamp(Math.max(start?.x ?? 0, end?.x ?? 0), maxWidth);
  const y2 = clamp(Math.max(start?.y ?? 0, end?.y ?? 0), maxHeight);
  return {
    x: x1,
    y: y1,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, y2 - y1),
  };
}

export function isEditorRectValid(rect, minSize = 8) {
  return !!rect && rect.width >= minSize && rect.height >= minSize;
}

export function getInputImageEditorStrokeWidth(width, height) {
  const longSide = Math.max(1, Number(width) || 1, Number(height) || 1);
  return Math.max(3, Math.round(longSide / 320));
}

export function drawInputImageEditorShape(ctx, operation) {
  if (!ctx || !operation || !operation.type) return;
  ctx.save();
  ctx.strokeStyle = operation.color || "#f8fafc";
  ctx.lineWidth = Math.max(2, Number(operation.strokeWidth) || 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (operation.type === "rect" && operation.rect) {
    ctx.strokeRect(operation.rect.x, operation.rect.y, operation.rect.width, operation.rect.height);
  } else if ((operation.type === "line" || operation.type === "arrow") && operation.start && operation.end) {
    ctx.beginPath();
    ctx.moveTo(operation.start.x, operation.start.y);
    ctx.lineTo(operation.end.x, operation.end.y);
    ctx.stroke();

    if (operation.type === "arrow") {
      const angle = Math.atan2(operation.end.y - operation.start.y, operation.end.x - operation.start.x);
      const headLength = Math.max(12, ctx.lineWidth * 4);
      ctx.beginPath();
      ctx.moveTo(operation.end.x, operation.end.y);
      ctx.lineTo(
        operation.end.x - headLength * Math.cos(angle - Math.PI / 6),
        operation.end.y - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(operation.end.x, operation.end.y);
      ctx.lineTo(
        operation.end.x - headLength * Math.cos(angle + Math.PI / 6),
        operation.end.y - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

export async function applyInputImageEditorOperation(sourceDataUrl, operation) {
  const normalizedSource = normalizeImageValue(sourceDataUrl) || sourceDataUrl;
  if (!normalizedSource) return sourceDataUrl;
  const image = await loadImageElement(normalizedSource);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;
  ctx.drawImage(image, 0, 0, width, height);
  drawInputImageEditorShape(ctx, operation);
  return canvas.toDataURL("image/png");
}

export async function cropInputImageDataUrl(sourceDataUrl, cropRect) {
  const normalizedSource = normalizeImageValue(sourceDataUrl) || sourceDataUrl;
  if (!normalizedSource || !isEditorRectValid(cropRect, 2)) return sourceDataUrl;
  const image = await loadImageElement(normalizedSource);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const safeRect = normalizeEditorRect(
    { x: cropRect.x, y: cropRect.y },
    { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height },
    width,
    height
  );
  if (!isEditorRectValid(safeRect, 2)) return sourceDataUrl;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = Math.max(1, Math.round(safeRect.width));
  outCanvas.height = Math.max(1, Math.round(safeRect.height));
  const ctx = outCanvas.getContext("2d");
  if (!ctx) return sourceDataUrl;
  ctx.drawImage(
    image,
    safeRect.x,
    safeRect.y,
    safeRect.width,
    safeRect.height,
    0,
    0,
    outCanvas.width,
    outCanvas.height
  );
  return outCanvas.toDataURL("image/png");
}

export async function createAtlasThumbnailDataUrl(imageSources = [], options = {}) {
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

export function buildProxyHeaders(targetPath, apiBaseUrl, apiKey, extraHeaders = {}, apiPlatform = DEFAULT_API_PLATFORM) {
  const headers = { ...extraHeaders };
  if (targetPath) headers["X-Target-Path"] = targetPath;
  headers["X-Upstream-Base"] = resolveApiBaseUrl(apiBaseUrl, apiPlatform);
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (normalizedApiKey) headers["X-Api-Key"] = normalizedApiKey;
  return headers;
}

export async function readProxyResponse(resp) {
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return resp.json();
  }
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function postJsonWithRetry(proxyUrl, targetPath, body, options = {}) {
  const {
      signal,
      maxAttempts = 3,
      baseDelayMs = 900,
      apiPlatform = DEFAULT_API_PLATFORM,
      extraHeaders = {},
  } = options;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let resp;
    try {
      resp = await fetch(proxyUrl, {
        method: "POST",
        headers: buildProxyHeaders(targetPath, options.apiBaseUrl, options.apiKey, { ...extraHeaders, "Content-Type": "application/json" }, apiPlatform),
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
      if (attempt >= maxAttempts) break;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(baseDelayMs * attempt + jitter, signal);
      continue;
    }

    if (resp.ok) return readProxyResponse(resp);

    const text = (await resp.text()).slice(0, 600);
    lastError = new Error(`API ${resp.status}: ${text}`);
    const canRetry = shouldRetryApiFailure(resp.status, text);
    if (!canRetry || attempt >= maxAttempts) break;
    const jitter = Math.floor(Math.random() * 250);
    await sleep(baseDelayMs * attempt + jitter, signal);
  }

  throw lastError || new Error("Request failed");
}

export async function postFormDataWithRetry(proxyUrl, targetPath, formData, options = {}) {
  const {
    signal,
    maxAttempts = 3,
    baseDelayMs = 900,
    apiPlatform = DEFAULT_API_PLATFORM,
  } = options;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let resp;
    try {
      resp = await fetch(proxyUrl, {
        method: "POST",
        headers: buildProxyHeaders(targetPath, options.apiBaseUrl, options.apiKey, {}, apiPlatform),
        body: formData,
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
      if (attempt >= maxAttempts) break;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(baseDelayMs * attempt + jitter, signal);
      continue;
    }

    if (resp.ok) return readProxyResponse(resp);

    const text = (await resp.text()).slice(0, 600);
    lastError = new Error(`API ${resp.status}: ${text}`);
    const canRetry = shouldRetryApiFailure(resp.status, text);
    if (!canRetry || attempt >= maxAttempts) break;
    const jitter = Math.floor(Math.random() * 250);
    await sleep(baseDelayMs * attempt + jitter, signal);
  }

  throw lastError || new Error("Request failed");
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadImageUrl(url, filename) {
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

export function normalizeImageValue(value, apiBaseUrl) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("/")) {
    const runtimeConfig = getRuntimeConfig();
    const fallbackBaseUrl = apiBaseUrl || runtimeConfig.apiBaseUrl || "";
    const fallbackPlatform = runtimeConfig.apiPlatform || DEFAULT_API_PLATFORM;
    return `${resolveApiBaseUrl(fallbackBaseUrl, fallbackPlatform)}${v}`;
  }
  const mdUrl = v.match(/\((https?:\/\/[^)]+)\)/)?.[1] || v.match(/https?:\/\/\S+/)?.[0];
  if (mdUrl) return mdUrl.replace(/[),.;]+$/, "");
  if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 128) {
    return `data:image/png;base64,${v}`;
  }
  return null;
}

export function extractImageCandidates(input, out = [], apiBaseUrl) {
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

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function proxyFetchImageAsDataUrl(proxyUrl, rawUrl) {
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

export function buildWorkerImageProxyUrl(proxyUrl, rawUrl) {
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

export function getMedianNumber(values = []) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

export function colorDistanceSq(r, g, b, bg) {
  const dr = r - bg.r;
  const dg = g - bg.g;
  const db = b - bg.b;
  return dr * dr + dg * dg + db * db;
}

export function rgbToHexColor(r = 255, g = 255, b = 255) {
  const toHex = (value) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    return n.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getPercentileNumber(values = [], ratio = 0.5) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!list.length) return 0;
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor((list.length - 1) * safeRatio)));
  return list[idx];
}

export function collectBorderPalette(imageData, width, height) {
  const data = imageData?.data;
  if (!data || width <= 0 || height <= 0) return [{ r: 0, g: 0, b: 0 }];
  const bucketMap = new Map();
  const stepX = Math.max(1, Math.floor(width / 90));
  const stepY = Math.max(1, Math.floor(height / 90));
  const collect = (x, y) => {
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3];
    if (alpha <= 18) return;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
    const found = bucketMap.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    found.r += r;
    found.g += g;
    found.b += b;
    found.count += 1;
    bucketMap.set(key, found);
  };
  for (let x = 0; x < width; x += stepX) {
    collect(x, 0);
    collect(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += stepY) {
    collect(0, y);
    collect(width - 1, y);
  }
  const buckets = Array.from(bucketMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => ({
      r: Math.round(item.r / Math.max(1, item.count)),
      g: Math.round(item.g / Math.max(1, item.count)),
      b: Math.round(item.b / Math.max(1, item.count)),
    }));
  return buckets.length ? buckets : [{ r: 0, g: 0, b: 0 }];
}

export function getMinPaletteDistanceSq(r, g, b, palette = []) {
  const colors = Array.isArray(palette) && palette.length ? palette : [{ r: 0, g: 0, b: 0 }];
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < colors.length; i += 1) {
    const dist = colorDistanceSq(r, g, b, colors[i]);
    if (dist < min) min = dist;
  }
  return Number.isFinite(min) ? min : 0;
}

function colorDistanceSqFromOffsets(data, a, b) {
  const dr = data[a] - data[b];
  const dg = data[a + 1] - data[b + 1];
  const db = data[a + 2] - data[b + 2];
  return dr * dr + dg * dg + db * db;
}

function getPixelLuma(data, idx) {
  const offset = idx * 4;
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
}

function getPixelChroma(data, idx) {
  const offset = idx * 4;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function collectBorderBackgroundStats(imageData, width, height, bgPalette) {
  const data = imageData?.data;
  if (!data || width <= 0 || height <= 0) {
    return {
      median: 0,
      p70: 0,
      p85: 0,
      stepP85: 0,
      lumaMedian: 0,
      chromaMedian: 0,
    };
  }
  const distances = [];
  const localSteps = [];
  const lumas = [];
  const chromas = [];
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  const collect = (x, y, ix, iy) => {
    const idx = y * width + x;
    const offset = idx * 4;
    const alpha = data[offset + 3];
    if (alpha <= 20) return;
    distances.push(Math.sqrt(getMinPaletteDistanceSq(data[offset], data[offset + 1], data[offset + 2], bgPalette)));
    lumas.push(getPixelLuma(data, idx));
    chromas.push(getPixelChroma(data, idx));
    const nx = Math.max(0, Math.min(width - 1, x + ix));
    const ny = Math.max(0, Math.min(height - 1, y + iy));
    if (nx !== x || ny !== y) {
      localSteps.push(Math.sqrt(colorDistanceSqFromOffsets(data, offset, (ny * width + nx) * 4)));
    }
  };
  for (let x = 0; x < width; x += stepX) {
    collect(x, 0, 0, 1);
    collect(x, height - 1, 0, -1);
  }
  for (let y = 1; y < height - 1; y += stepY) {
    collect(0, y, 1, 0);
    collect(width - 1, y, -1, 0);
  }
  return {
    median: getMedianNumber(distances),
    p70: getPercentileNumber(distances, 0.7),
    p85: getPercentileNumber(distances, 0.85),
    stepP85: getPercentileNumber(localSteps, 0.85),
    lumaMedian: getMedianNumber(lumas),
    chromaMedian: getMedianNumber(chromas),
  };
}

function buildColorEdgeMap(imageData, width, height) {
  const data = imageData?.data;
  const total = width * height;
  const edge = new Uint8Array(Math.max(0, total));
  if (!data || width <= 0 || height <= 0) return edge;
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      const left = (y * width + x0) * 4;
      const right = (y * width + x1) * 4;
      const up = (y0 * width + x) * 4;
      const down = (y1 * width + x) * 4;
      const dx = Math.sqrt(colorDistanceSqFromOffsets(data, left, right));
      const dy = Math.sqrt(colorDistanceSqFromOffsets(data, up, down));
      edge[y * width + x] = clampByte(Math.max(dx, dy));
    }
  }
  return edge;
}

function collectBorderMapPercentile(map, width, height, ratio = 0.85) {
  if (!map || width <= 0 || height <= 0) return 0;
  const values = [];
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  for (let x = 0; x < width; x += stepX) {
    values.push(map[x]);
    values.push(map[(height - 1) * width + x]);
  }
  for (let y = 1; y < height - 1; y += stepY) {
    values.push(map[y * width]);
    values.push(map[y * width + width - 1]);
  }
  return getPercentileNumber(values, ratio);
}

function buildAdaptiveBackgroundRemovalMask(imageData, width, height, bgPalette, bgStats, bgThreshold) {
  const data = imageData?.data;
  const total = width * height;
  const mask = new Uint8Array(Math.max(0, total));
  if (!data || total <= 0) return mask;

  const edgeMap = buildColorEdgeMap(imageData, width, height);
  const borderEdgeP85 = collectBorderMapPercentile(edgeMap, width, height, 0.85);
  const softBgThreshold = Math.max(28, Math.min(104, Math.max(bgThreshold + 14, bgStats.p85 + 12, bgStats.median + 24)));
  const hardBgThreshold = Math.max(56, Math.min(158, Math.max(softBgThreshold + 32, bgThreshold + 48)));
  const smoothStepLimit = Math.max(12, Math.min(38, bgStats.stepP85 + 16));
  const textureStepLimit = Math.max(smoothStepLimit + 4, Math.min(58, bgStats.stepP85 + 28));
  const edgeBlockThreshold = Math.max(18, Math.min(62, borderEdgeP85 + 18));
  const bgDistance = new Uint16Array(total);

  for (let i = 0; i < total; i += 1) {
    const idx = i * 4;
    if (data[idx + 3] <= 20) {
      bgDistance[i] = 0;
      continue;
    }
    bgDistance[i] = Math.min(65535, Math.round(Math.sqrt(getMinPaletteDistanceSq(data[idx], data[idx + 1], data[idx + 2], bgPalette))));
  }

  const bgConnected = new Uint8Array(total);
  const queue = new Int32Array(Math.max(1, total));
  let head = 0;
  let tail = 0;
  const seedLimit = Math.min(176, hardBgThreshold + 18);
  const pushSeed = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (bgConnected[idx]) return;
    const alpha = data[idx * 4 + 3];
    if (alpha > 20 && bgDistance[idx] > seedLimit) return;
    bgConnected[idx] = 1;
    queue[tail] = idx;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    pushSeed(x, 0);
    pushSeed(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushSeed(0, y);
    pushSeed(width - 1, y);
  }

  const canJoinBackground = (from, next) => {
    const nextOffset = next * 4;
    const alpha = data[nextOffset + 3];
    if (alpha <= 20) return true;
    const nextDist = bgDistance[next];
    if (nextDist <= bgThreshold) return true;
    const step = Math.sqrt(colorDistanceSqFromOffsets(data, from * 4, nextOffset));
    const edge = edgeMap[next];
    const fromDist = bgDistance[from];
    const lumaDiff = Math.abs(getPixelLuma(data, next) - bgStats.lumaMedian);
    const chromaDiff = Math.abs(getPixelChroma(data, next) - bgStats.chromaMedian);
    const toneLooksForeground = lumaDiff > 46 || chromaDiff > 38 || nextDist > softBgThreshold;
    const backgroundTone =
      chromaDiff <= 30 &&
      nextDist <= hardBgThreshold &&
      step <= textureStepLimit + 18 &&
      edge <= edgeBlockThreshold + 22;

    if (backgroundTone) return true;
    if (edge >= edgeBlockThreshold && nextDist > bgThreshold * 0.9 && nextDist > fromDist + 18) return false;
    if (edge >= edgeBlockThreshold + 10 && toneLooksForeground && step > smoothStepLimit) return false;
    if (nextDist <= softBgThreshold && step <= textureStepLimit) return true;
    if (nextDist <= hardBgThreshold && step <= smoothStepLimit && !toneLooksForeground) return true;
    if (nextDist <= hardBgThreshold && step <= textureStepLimit && fromDist <= hardBgThreshold) return true;
    return false;
  };

  const pushNeighbor = (from, x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const next = y * width + x;
    if (bgConnected[next]) return;
    if (!canJoinBackground(from, next)) return;
    bgConnected[next] = 1;
    queue[tail] = next;
    tail += 1;
  };

  while (head < tail) {
    const idx = queue[head];
    head += 1;
    const x = idx % width;
    const y = Math.floor(idx / width);
    pushNeighbor(idx, x - 1, y);
    pushNeighbor(idx, x + 1, y);
    pushNeighbor(idx, x, y - 1);
    pushNeighbor(idx, x, y + 1);
  }

  for (let i = 0; i < total; i += 1) {
    const alpha = data[i * 4 + 3];
    if (!bgConnected[i] && alpha > 20) mask[i] = 1;
  }
  return mask;
}

export function refineForegroundMask(mask, width, height) {
  if (!mask || width <= 2 || height <= 2) return mask;
  const total = width * height;
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const erode = (input) => {
    const out = new Uint8Array(total);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        if (!input[idx]) continue;
        let ok = true;
        for (let n = 0; n < neighbors.length; n += 1) {
          const nx = x + neighbors[n][0];
          const ny = y + neighbors[n][1];
          if (!input[ny * width + nx]) {
            ok = false;
            break;
          }
        }
        if (ok) out[idx] = 1;
      }
    }
    return out;
  };
  const dilate = (input) => {
    const out = new Uint8Array(total);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (input[idx]) {
          out[idx] = 1;
          continue;
        }
        let on = false;
        for (let n = 0; n < neighbors.length; n += 1) {
          const nx = x + neighbors[n][0];
          const ny = y + neighbors[n][1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (input[ny * width + nx]) {
            on = true;
            break;
          }
        }
        if (on) out[idx] = 1;
      }
    }
    return out;
  };

  const closed = erode(dilate(mask));

  const queue = new Int32Array(Math.max(1, total));
  const visited = new Uint8Array(total);
  const cleaned = new Uint8Array(total);
  const minIslandArea = Math.max(16, Math.floor(total * 0.00022));

  for (let start = 0; start < total; start += 1) {
    if (!closed[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    const pixels = [];
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    while (head < tail) {
      const idx = queue[head];
      head += 1;
      pixels.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      for (let n = 0; n < neighbors.length; n += 1) {
        const nx = x + neighbors[n][0];
        const ny = y + neighbors[n][1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!closed[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
    if (pixels.length >= minIslandArea) {
      for (let i = 0; i < pixels.length; i += 1) cleaned[pixels[i]] = 1;
    }
  }

  const invVisited = new Uint8Array(total);
  const holesQueue = new Int32Array(Math.max(1, total));
  let holesHead = 0;
  let holesTail = 0;
  const pushHole = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (cleaned[idx] || invVisited[idx]) return;
    invVisited[idx] = 1;
    holesQueue[holesTail] = idx;
    holesTail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    pushHole(x, 0);
    pushHole(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    pushHole(0, y);
    pushHole(width - 1, y);
  }
  while (holesHead < holesTail) {
    const idx = holesQueue[holesHead];
    holesHead += 1;
    const x = idx % width;
    const y = Math.floor(idx / width);
    for (let n = 0; n < neighbors.length; n += 1) {
      pushHole(x + neighbors[n][0], y + neighbors[n][1]);
    }
  }
  for (let i = 0; i < total; i += 1) {
    if (!cleaned[i] && !invVisited[i]) cleaned[i] = 1;
  }
  return cleaned;
}

export function mergeNearbyBounds(bounds = [], maxGap = 2) {
  const items = (Array.isArray(bounds) ? bounds : []).map((item) => ({ ...item }));
  if (items.length < 2) return items;
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        const ax2 = a.x + a.width - 1;
        const ay2 = a.y + a.height - 1;
        const bx2 = b.x + b.width - 1;
        const by2 = b.y + b.height - 1;
        const horizontalGap = b.x > ax2 ? b.x - ax2 - 1 : a.x > bx2 ? a.x - bx2 - 1 : 0;
        const verticalGap = b.y > ay2 ? b.y - ay2 - 1 : a.y > by2 ? a.y - by2 - 1 : 0;
        const overlapX = !(ax2 < b.x || bx2 < a.x);
        const overlapY = !(ay2 < b.y || by2 < a.y);
        if ((horizontalGap <= maxGap && overlapY) || (verticalGap <= maxGap && overlapX) || (overlapX && overlapY)) {
          const nextX = Math.min(a.x, b.x);
          const nextY = Math.min(a.y, b.y);
          const nextRight = Math.max(ax2, bx2);
          const nextBottom = Math.max(ay2, by2);
          items[i] = {
            x: nextX,
            y: nextY,
            width: nextRight - nextX + 1,
            height: nextBottom - nextY + 1,
            area: (a.area || 0) + (b.area || 0),
          };
          items.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return items;
}

export function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

export function blurImageData3x3(imageData, width, height) {
  const src = imageData?.data;
  if (!src || width <= 2 || height <= 2) return imageData;
  const out = new Uint8ClampedArray(src.length);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let aa = 0;
      let weightSum = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const nx = Math.max(0, Math.min(width - 1, x + kx));
          const ny = Math.max(0, Math.min(height - 1, y + ky));
          const nIdx = (ny * width + nx) * 4;
          const w = kernel[ki];
          ki += 1;
          rr += src[nIdx] * w;
          gg += src[nIdx + 1] * w;
          bb += src[nIdx + 2] * w;
          aa += src[nIdx + 3] * w;
          weightSum += w;
        }
      }
      const safeW = weightSum || kernelSum;
      out[base] = clampByte(rr / safeW);
      out[base + 1] = clampByte(gg / safeW);
      out[base + 2] = clampByte(bb / safeW);
      out[base + 3] = clampByte(aa / safeW);
    }
  }
  return new ImageData(out, width, height);
}

export function applySharpenToImageData(imageData, width, height, amount = 0.58, threshold = 3) {
  const src = imageData?.data;
  if (!src || width <= 2 || height <= 2) return imageData;
  const blurred = blurImageData3x3(imageData, width, height);
  const blur = blurred?.data;
  if (!blur) return imageData;
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = src[idx + 3];
      if (alpha <= 10) {
        out[idx] = src[idx];
        out[idx + 1] = src[idx + 1];
        out[idx + 2] = src[idx + 2];
        out[idx + 3] = alpha;
        continue;
      }
      const baseR = src[idx];
      const baseG = src[idx + 1];
      const baseB = src[idx + 2];
      const diffR = baseR - blur[idx];
      const diffG = baseG - blur[idx + 1];
      const diffB = baseB - blur[idx + 2];
      out[idx] = Math.abs(diffR) < threshold ? baseR : clampByte(baseR + diffR * amount);
      out[idx + 1] = Math.abs(diffG) < threshold ? baseG : clampByte(baseG + diffG * amount);
      out[idx + 2] = Math.abs(diffB) < threshold ? baseB : clampByte(baseB + diffB * amount);
      out[idx + 3] = alpha;
    }
  }
  return new ImageData(out, width, height);
}

export async function renderDataUrlOnBackground(sourceDataUrl, fillColor = "#ffffff") {
  const image = await loadImageElement(sourceDataUrl);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return sourceDataUrl;
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

const SPLIT_STANDARD_ASPECT_RATIOS = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
];

function getStandardAspectCanvasSize(width, height) {
  const sourceWidth = Math.max(1, Math.round(Number(width) || 1));
  const sourceHeight = Math.max(1, Math.round(Number(height) || 1));
  const sourceRatio = sourceWidth / sourceHeight;
  const orientationRatio = sourceWidth >= sourceHeight ? sourceRatio : sourceHeight / sourceWidth;
  let best = null;
  for (let i = 0; i < SPLIT_STANDARD_ASPECT_RATIOS.length; i += 1) {
    const option = SPLIT_STANDARD_ASPECT_RATIOS[i];
    const targetRatio = sourceWidth >= sourceHeight ? option.value : 1 / option.value;
    let targetWidth = sourceWidth;
    let targetHeight = sourceHeight;
    if (sourceRatio < targetRatio) {
      targetWidth = Math.max(sourceWidth, Math.ceil(sourceHeight * targetRatio));
    } else if (sourceRatio > targetRatio) {
      targetHeight = Math.max(sourceHeight, Math.ceil(sourceWidth / targetRatio));
    }
    const addedArea = targetWidth * targetHeight - sourceWidth * sourceHeight;
    const ratioDistance = Math.abs(orientationRatio - option.value);
    const candidate = {
      width: targetWidth,
      height: targetHeight,
      label: sourceWidth >= sourceHeight || option.value === 1
        ? option.label
        : option.label.split(":").reverse().join(":"),
      addedArea,
      ratioDistance,
    };
    if (
      !best ||
      candidate.addedArea < best.addedArea ||
      (candidate.addedArea === best.addedArea && candidate.ratioDistance < best.ratioDistance)
    ) {
      best = candidate;
    }
  }
  return best || { width: sourceWidth, height: sourceHeight, label: "1:1", addedArea: 0, ratioDistance: 0 };
}

export async function expandDataUrlToStandardAspect(sourceDataUrl, options = {}) {
  if (!sourceDataUrl) return { dataUrl: "", width: 0, height: 0, aspectRatio: "" };
  const image = await loadImageElement(sourceDataUrl);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const target = getStandardAspectCanvasSize(sourceWidth, sourceHeight);
  if (target.width === sourceWidth && target.height === sourceHeight) {
    return {
      dataUrl: sourceDataUrl,
      width: sourceWidth,
      height: sourceHeight,
      aspectRatio: target.label,
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      dataUrl: sourceDataUrl,
      width: sourceWidth,
      height: sourceHeight,
      aspectRatio: target.label,
    };
  }
  const fillColor = typeof options.fillColor === "string" && options.fillColor.trim() ? options.fillColor : "";
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(0, 0, target.width, target.height);
  } else {
    ctx.clearRect(0, 0, target.width, target.height);
  }
  const drawX = Math.floor((target.width - sourceWidth) / 2);
  const drawY = Math.floor((target.height - sourceHeight) / 2);
  ctx.drawImage(image, drawX, drawY, sourceWidth, sourceHeight);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: target.width,
    height: target.height,
    aspectRatio: target.label,
  };
}

export async function enhanceSplitImageDataUrl(sourceDataUrl, options = {}) {
  const minLongSide = Math.max(256, Number(options.minLongSide) || 1024);
  const image = await loadImageElement(sourceDataUrl);
  const srcWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const srcHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const longSide = Math.max(srcWidth, srcHeight);
  const scale = longSide >= minLongSide ? 1 : minLongSide / longSide;
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      dataUrl: sourceDataUrl,
      width: srcWidth,
      height: srcHeight,
    };
  }
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Progressive upscale gives cleaner edges than one-shot scaling.
  if (scale > 1.8) {
    let tempWidth = srcWidth;
    let tempHeight = srcHeight;
    let tempCanvas = document.createElement("canvas");
    tempCanvas.width = tempWidth;
    tempCanvas.height = tempHeight;
    const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    if (tempCtx) {
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = "high";
      tempCtx.drawImage(image, 0, 0, tempWidth, tempHeight);
      while (tempWidth * 1.45 < targetWidth || tempHeight * 1.45 < targetHeight) {
        const nextWidth = Math.min(targetWidth, Math.round(tempWidth * 1.45));
        const nextHeight = Math.min(targetHeight, Math.round(tempHeight * 1.45));
        const stepCanvas = document.createElement("canvas");
        stepCanvas.width = nextWidth;
        stepCanvas.height = nextHeight;
        const stepCtx = stepCanvas.getContext("2d");
        if (!stepCtx) break;
        stepCtx.imageSmoothingEnabled = true;
        stepCtx.imageSmoothingQuality = "high";
        stepCtx.drawImage(tempCanvas, 0, 0, nextWidth, nextHeight);
        tempCanvas = stepCanvas;
        tempWidth = nextWidth;
        tempHeight = nextHeight;
      }
      ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    } else {
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    }
  } else {
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  }
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const denoised = blurImageData3x3(imageData, targetWidth, targetHeight);
  const sharpened = applySharpenToImageData(denoised, targetWidth, targetHeight, 0.55, 2.5);
  ctx.putImageData(sharpened, 0, 0);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: targetWidth,
    height: targetHeight,
  };
}

function dilateMaskSquare(mask, width, height, radius = 1) {
  const total = width * height;
  const r = Math.max(0, Math.floor(Number(radius) || 0));
  if (!mask || total <= 0 || r <= 0) return mask;
  const horizontal = new Uint8Array(total);
  const output = new Uint8Array(total);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= r && x < width; x += 1) {
      if (mask[row + x]) count += 1;
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = count > 0 ? 1 : 0;
      const removeX = x - r;
      if (removeX >= 0 && mask[row + removeX]) count -= 1;
      const addX = x + r + 1;
      if (addX < width && mask[row + addX]) count += 1;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= r && y < height; y += 1) {
      if (horizontal[y * width + x]) count += 1;
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = count > 0 ? 1 : 0;
      const removeY = y - r;
      if (removeY >= 0 && horizontal[removeY * width + x]) count -= 1;
      const addY = y + r + 1;
      if (addY < height && horizontal[addY * width + x]) count += 1;
    }
  }

  return output;
}

function erodeMaskSquare(mask, width, height, radius = 1) {
  const total = width * height;
  const r = Math.max(0, Math.floor(Number(radius) || 0));
  if (!mask || total <= 0 || r <= 0) return mask;
  const horizontal = new Uint8Array(total);
  const output = new Uint8Array(total);
  const windowSize = r * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= r && x < width; x += 1) {
      if (mask[row + x]) count += 1;
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = x - r >= 0 && x + r < width && count === windowSize ? 1 : 0;
      const removeX = x - r;
      if (removeX >= 0 && mask[row + removeX]) count -= 1;
      const addX = x + r + 1;
      if (addX < width && mask[row + addX]) count += 1;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let count = 0;
    for (let y = 0; y <= r && y < height; y += 1) {
      if (horizontal[y * width + x]) count += 1;
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = y - r >= 0 && y + r < height && count === windowSize ? 1 : 0;
      const removeY = y - r;
      if (removeY >= 0 && horizontal[removeY * width + x]) count -= 1;
      const addY = y + r + 1;
      if (addY < height && horizontal[addY * width + x]) count += 1;
    }
  }

  return output;
}

export function addForegroundGapTolerance(mask, width, height) {
  if (!mask || width <= 2 || height <= 2) return mask;
  const shortSide = Math.min(width, height);
  const radius = Math.max(1, Math.min(4, Math.round(shortSide * 0.0035)));
  const closed = erodeMaskSquare(dilateMaskSquare(mask, width, height, radius), width, height, radius);
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) closed[i] = 1;
  }
  return closed;
}

export function buildForegroundMask(imageData, width, height) {
  const total = width * height;
  const data = imageData?.data;
  const mask = new Uint8Array(total);
  if (!data || total <= 0) return mask;

  let opaqueCount = 0;
  let visibleCount = 0;
  for (let i = 0; i < total; i += 1) {
    const alpha = data[i * 4 + 3];
    if (alpha > 245) opaqueCount += 1;
    if (alpha > 20) visibleCount += 1;
  }
  const transparencyRatio = 1 - opaqueCount / Math.max(1, total);
  const hasUsefulAlpha = transparencyRatio > 0.015 && visibleCount > 0;

  if (hasUsefulAlpha) {
    for (let i = 0; i < total; i += 1) {
      if (data[i * 4 + 3] > 20) mask[i] = 1;
    }
    return refineForegroundMask(mask, width, height);
  }

  const bgPalette = collectBorderPalette(imageData, width, height);
  const bgStats = collectBorderBackgroundStats(imageData, width, height, bgPalette);
  const bgThreshold = Math.max(14, Math.min(86, Math.max(bgStats.p70 + 8, bgStats.p85 + 2, bgStats.median + 12)));
  const initialMask = buildAdaptiveBackgroundRemovalMask(imageData, width, height, bgPalette, bgStats, bgThreshold);
  return refineForegroundMask(addForegroundGapTolerance(initialMask, width, height), width, height);
}

export function collectSubjectBounds(mask, width, height) {
  const total = width * height;
  if (!mask || total <= 0) return [];
  const visited = new Uint8Array(total);
  const queue = new Int32Array(Math.max(1, total));
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const minArea = Math.max(20, Math.floor(total * 0.00035));
  const minSide = Math.max(2, Math.floor(Math.min(width, height) * 0.01));
  const bounds = [];

  for (let start = 0; start < total; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    const pixels = [];

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      pixels.push(idx);
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let n = 0; n < neighbors.length; n += 1) {
        const nextX = x + neighbors[n][0];
        const nextY = y + neighbors[n][1];
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (area < minArea || (boxWidth < minSide && boxHeight < minSide)) continue;
    bounds.push({
      x: minX,
      y: minY,
      width: boxWidth,
      height: boxHeight,
      area,
      pixels,
    });
  }

  if (!bounds.length) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    for (let i = 0; i < total; i += 1) {
      if (!mask[i]) continue;
      area += 1;
      const x = i % width;
      const y = Math.floor(i / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (area > 0 && maxX >= minX && maxY >= minY) {
      bounds.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area,
        pixels: [],
      });
    }
  }

  return bounds
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .slice(0, MAX_SPLIT_EXPORT_ITEMS);
}

export function normalizeSplitShapeMode(mode) {
  return SPLIT_SHAPE_MODE_ORDER.includes(mode) ? mode : DEFAULT_SPLIT_SHAPE_MODE;
}

export function normalizeSplitRenderMode(mode) {
  return SPLIT_RENDER_MODE_ORDER.includes(mode) ? mode : DEFAULT_SPLIT_RENDER_MODE;
}

export function normalizeSplitGroupMode(mode) {
  return SPLIT_GROUP_MODE_ORDER.includes(mode) ? mode : DEFAULT_SPLIT_GROUP_MODE;
}

export function buildSteppedPolygonMask(localMask, width, height) {
  if (!localMask || width <= 0 || height <= 0) return new Uint8Array(Math.max(0, width * height));
  const output = new Uint8Array(width * height);
  const bandHeight = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) / 80) || 1));
  for (let bandTop = 0; bandTop < height; bandTop += bandHeight) {
    const bandBottom = Math.min(height - 1, bandTop + bandHeight - 1);
    let inRun = false;
    let runStart = 0;
    for (let x = 0; x <= width; x += 1) {
      let active = false;
      if (x < width) {
        for (let y = bandTop; y <= bandBottom; y += 1) {
          if (localMask[y * width + x]) {
            active = true;
            break;
          }
        }
      }
      if (active && !inRun) {
        inRun = true;
        runStart = x;
      } else if (!active && inRun) {
        for (let y = bandTop; y <= bandBottom; y += 1) {
          const rowOffset = y * width;
          for (let fillX = runStart; fillX < x; fillX += 1) {
            output[rowOffset + fillX] = 1;
          }
        }
        inRun = false;
      }
    }
  }
  return output;
}

export function buildPolygonMaskedImage(rectImageData, localMask, width, height, fallbackImage = "") {
  if (!rectImageData || !localMask || width <= 0 || height <= 0) return fallbackImage;
  const polygonMask = buildSteppedPolygonMask(localMask, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallbackImage;
  const out = ctx.createImageData(width, height);
  const src = rectImageData.data;
  const dst = out.data;
  let visibleCount = 0;
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    if (!polygonMask[i]) {
      dst[offset] = 0;
      dst[offset + 1] = 0;
      dst[offset + 2] = 0;
      dst[offset + 3] = 0;
      continue;
    }
    dst[offset] = src[offset];
    dst[offset + 1] = src[offset + 1];
    dst[offset + 2] = src[offset + 2];
    dst[offset + 3] = src[offset + 3];
    visibleCount += 1;
  }
  if (!visibleCount) return fallbackImage;
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

export function getSplitShapeDataUrl(item, shapeMode) {
  const mode = normalizeSplitShapeMode(shapeMode);
  const rectImage = item?.rectImage || item?.image || "";
  const edgeImage = item?.edgeImage || item?.transparentImage || rectImage;
  const polygonImage = item?.polygonImage || edgeImage;
  if (mode === "rect") return rectImage || edgeImage || polygonImage;
  if (mode === "polygon") return polygonImage || edgeImage || rectImage;
  return edgeImage || polygonImage || rectImage;
}

export function buildSplitProcessPreview(imageData, mask, width, height) {
  const src = imageData?.data;
  if (!src || !mask || width <= 0 || height <= 0) return "";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const out = new ImageData(new Uint8ClampedArray(src), width, height);
  const data = out.data;
  const mark = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = (y * width + x) * 4;
    data[idx] = 255;
    data[idx + 1] = 45;
    data[idx + 2] = 45;
    data[idx + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      const left = x <= 0 ? 0 : mask[idx - 1];
      const right = x >= width - 1 ? 0 : mask[idx + 1];
      const up = y <= 0 ? 0 : mask[idx - width];
      const down = y >= height - 1 ? 0 : mask[idx + width];
      if (left && right && up && down) continue;
      mark(x, y);
      mark(x - 1, y);
      mark(x + 1, y);
      mark(x, y - 1);
      mark(x, y + 1);
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function buildSplitProcessPreviewForShape(sourceImage, baseProcessImage, items = [], shapeMode = DEFAULT_SPLIT_SHAPE_MODE) {
  const mode = normalizeSplitShapeMode(shapeMode);
  const fallbackImage = normalizeImageValue(baseProcessImage) || normalizeImageValue(sourceImage) || "";
  if (mode !== "rect") return fallbackImage;
  const normalizedSource = normalizeImageValue(sourceImage) || fallbackImage;
  if (!normalizedSource) return fallbackImage;
  const image = await loadImageElement(normalizedSource);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallbackImage;
  ctx.drawImage(image, 0, 0, width, height);
  const strokeWidth = Math.max(2, Math.min(6, Math.round(Math.min(width, height) / 220) || 2));
  ctx.strokeStyle = "rgba(255,45,45,0.96)";
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    const x = Math.max(0, Math.round(Number(item?.x) || 0));
    const y = Math.max(0, Math.round(Number(item?.y) || 0));
    const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
    const drawWidth = Math.max(1, Math.min(width - x, Math.round(baseWidth)));
    const drawHeight = Math.max(1, Math.min(height - y, Math.round(baseHeight)));
    const inset = strokeWidth / 2;
    const rectWidth = Math.max(1, drawWidth - strokeWidth);
    const rectHeight = Math.max(1, drawHeight - strokeWidth);
    if (drawWidth <= 0 || drawHeight <= 0) return;
    ctx.strokeRect(x + inset, y + inset, rectWidth, rectHeight);
  });
  return canvas.toDataURL("image/png");
}

export function getSplitItemBaseSize(item) {
  const baseWidth = Math.max(1, Number(item?.baseWidth) || Number(item?.width) || 1);
  const baseHeight = Math.max(1, Number(item?.baseHeight) || Number(item?.height) || 1);
  return { baseWidth, baseHeight };
}

export function getSplitItemSourceByShape(item, shape = "rect") {
  if (shape === "polygon") return item?.polygonImage || item?.edgeImage || item?.transparentImage || item?.rectImage || item?.image || "";
  if (shape === "edge") return item?.edgeImage || item?.transparentImage || item?.rectImage || item?.image || "";
  return item?.rectImage || item?.image || item?.edgeImage || item?.transparentImage || "";
}

export async function composeMergedSplitField(items, shapeMode, bounds) {
  const width = Math.max(1, Number(bounds?.width) || 1);
  const height = Math.max(1, Number(bounds?.height) || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const dataUrl = getSplitItemSourceByShape(item, shapeMode);
    if (!dataUrl) continue;
    try {
      const image = await loadImageElement(dataUrl);
      const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
      const drawX = Math.round((Number(item?.x) || 0) - (Number(bounds?.x) || 0));
      const drawY = Math.round((Number(item?.y) || 0) - (Number(bounds?.y) || 0));
      ctx.drawImage(image, drawX, drawY, baseWidth, baseHeight);
    } catch {
      // Ignore one failed tile and keep merging others.
    }
  }
  return canvas.toDataURL("image/png");
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getSplitItemBounds(item) {
  const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
  return {
    x: Math.max(0, Number(item?.x) || 0),
    y: Math.max(0, Number(item?.y) || 0),
    width: baseWidth,
    height: baseHeight,
    right: Math.max(0, Number(item?.x) || 0) + baseWidth,
    bottom: Math.max(0, Number(item?.y) || 0) + baseHeight,
  };
}

async function collectSplitItemColorFeature(item) {
  const source = item?.edgeImage || item?.transparentImage || item?.polygonImage || item?.rectImage || item?.image || "";
  if (!source) return { r: 128, g: 128, b: 128, count: 0, coverageBounds: null };
  try {
    const image = await loadImageElement(source);
    const width = Math.max(1, image.naturalWidth || image.width || 1);
    const height = Math.max(1, image.naturalHeight || image.height || 1);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { r: 128, g: 128, b: 128, count: 0, coverageBounds: null };
    ctx.drawImage(image, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const step = Math.max(1, Math.floor((width * height) / 3600));
    let rr = 0;
    let gg = 0;
    let bb = 0;
    let count = 0;
    let minAlphaX = Number.POSITIVE_INFINITY;
    let minAlphaY = Number.POSITIVE_INFINITY;
    let maxAlphaX = Number.NEGATIVE_INFINITY;
    let maxAlphaY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < width * height; i += step) {
      const idx = i * 4;
      const alpha = data[idx + 3];
      if (alpha <= 20) continue;
      rr += data[idx];
      gg += data[idx + 1];
      bb += data[idx + 2];
      count += 1;
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        if (data[idx + 3] <= 20) continue;
        minAlphaX = Math.min(minAlphaX, x);
        minAlphaY = Math.min(minAlphaY, y);
        maxAlphaX = Math.max(maxAlphaX, x);
        maxAlphaY = Math.max(maxAlphaY, y);
      }
    }
    const itemBounds = getSplitItemBounds(item);
    const coverageBounds =
      Number.isFinite(minAlphaX) && Number.isFinite(minAlphaY) && Number.isFinite(maxAlphaX) && Number.isFinite(maxAlphaY)
        ? (() => {
            const x = itemBounds.x + (minAlphaX / width) * itemBounds.width;
            const y = itemBounds.y + (minAlphaY / height) * itemBounds.height;
            const right = itemBounds.x + ((maxAlphaX + 1) / width) * itemBounds.width;
            const bottom = itemBounds.y + ((maxAlphaY + 1) / height) * itemBounds.height;
            return {
              x,
              y,
              right,
              bottom,
              width: Math.max(1, right - x),
              height: Math.max(1, bottom - y),
              centerX: (x + right) / 2,
              centerY: (y + bottom) / 2,
              boxArea: Math.max(1, (right - x) * (bottom - y)),
            };
          })()
        : null;
    if (!count) return { r: 128, g: 128, b: 128, count: 0, coverageBounds };
    return {
      r: rr / count,
      g: gg / count,
      b: bb / count,
      count,
      coverageBounds,
    };
  } catch {
    return { r: 128, g: 128, b: 128, count: 0, coverageBounds: null };
  }
}

function buildSplitClusterFeature(items, sourceWidth, sourceHeight) {
  const safeItems = Array.isArray(items) ? items : [];
  const imageArea = Math.max(1, sourceWidth * sourceHeight);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let maxY = 0;
  let area = 0;
  let colorWeight = 0;
  let rr = 0;
  let gg = 0;
  let bb = 0;
  let order = Number.POSITIVE_INFINITY;
  for (let i = 0; i < safeItems.length; i += 1) {
    const item = safeItems[i];
    const bounds = getSplitItemBounds(item);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.right);
    maxY = Math.max(maxY, bounds.bottom);
    const itemArea = Math.max(1, Number(item?.area) || bounds.width * bounds.height);
    area += itemArea;
    const color = item.__clusterColor || { r: 128, g: 128, b: 128, count: 0 };
    const weight = Math.max(1, itemArea);
    rr += color.r * weight;
    gg += color.g * weight;
    bb += color.b * weight;
    colorWeight += weight;
    order = Math.min(order, Number(item?.index) || i + 1);
  }
  if (!safeItems.length || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const boxArea = Math.max(1, width * height);
  return {
    x: minX,
    y: minY,
    right: maxX,
    bottom: maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
    area,
    boxArea,
    density: clampUnit(area / boxArea),
    imageArea,
    order: Number.isFinite(order) ? order : 1,
    color: colorWeight
      ? { r: rr / colorWeight, g: gg / colorWeight, b: bb / colorWeight }
      : { r: 128, g: 128, b: 128 },
  };
}

function getSplitClusterStats(items, sourceWidth, sourceHeight) {
  const areas = items.map((item) => {
    const bounds = getSplitItemBounds(item);
    return Math.max(1, Number(item?.area) || bounds.width * bounds.height);
  });
  return {
    width: Math.max(1, Number(sourceWidth) || 1),
    height: Math.max(1, Number(sourceHeight) || 1),
    minSide: Math.max(1, Math.min(Number(sourceWidth) || 1, Number(sourceHeight) || 1)),
    imageArea: Math.max(1, (Number(sourceWidth) || 1) * (Number(sourceHeight) || 1)),
    medianArea: Math.max(1, getMedianNumber(areas)),
  };
}

function isProtectedSplitCluster(cluster, stats) {
  const feature = cluster.feature;
  const longSide = Math.max(feature.width, feature.height);
  const largeByArea = feature.area > stats.medianArea * 3.2 && feature.boxArea > stats.imageArea * 0.025;
  const largeBySide = longSide > stats.minSide * 0.35 && feature.area > stats.medianArea * 2.4;
  const veryLargeBox = feature.boxArea > stats.imageArea * 0.12;
  return largeByArea || largeBySide || veryLargeBox;
}

function getSplitClusterSpatialMetrics(a, b, stats) {
  const ax2 = a.right;
  const ay2 = a.bottom;
  const bx2 = b.right;
  const by2 = b.bottom;
  const gapX = b.x > ax2 ? b.x - ax2 : a.x > bx2 ? a.x - bx2 : 0;
  const gapY = b.y > ay2 ? b.y - ay2 : a.y > by2 ? a.y - by2 : 0;
  const gap = Math.hypot(gapX, gapY);
  const avgSide = (Math.sqrt(a.boxArea) + Math.sqrt(b.boxArea)) / 2;
  const gapScale = Math.max(stats.minSide * 0.12, avgSide * 1.15, 1);
  const gapScore = Math.exp(-gap / gapScale);
  const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const xOverlapRatio = overlapX / Math.max(1, Math.min(a.width, b.width));
  const yOverlapRatio = overlapY / Math.max(1, Math.min(a.height, b.height));
  const rowScore = Math.max(
    yOverlapRatio,
    1 - Math.abs(a.centerY - b.centerY) / Math.max(stats.minSide * 0.16, (a.height + b.height) * 0.75, 1)
  );
  const colScore = Math.max(
    xOverlapRatio,
    1 - Math.abs(a.centerX - b.centerX) / Math.max(stats.minSide * 0.16, (a.width + b.width) * 0.75, 1)
  );
  const lineScore = clampUnit(Math.max(rowScore, colScore));
  const unionX1 = Math.min(a.x, b.x);
  const unionY1 = Math.min(a.y, b.y);
  const unionX2 = Math.max(ax2, bx2);
  const unionY2 = Math.max(ay2, by2);
  const unionWidth = Math.max(1, unionX2 - unionX1);
  const unionHeight = Math.max(1, unionY2 - unionY1);
  const unionArea = Math.max(1, unionWidth * unionHeight);
  const compactScore = clampUnit(((a.boxArea + b.boxArea) / unionArea - 0.06) / 0.42);
  const orderScore = clampUnit(1 - Math.abs(a.order - b.order) / 5);
  const score = clampUnit(gapScore * 0.5 + lineScore * 0.25 + compactScore * 0.2 + orderScore * 0.05);
  return {
    score,
    gapScore,
    lineScore,
    compactScore,
    orderScore,
    gap,
    unionArea,
    unionAreaRatio: unionArea / Math.max(1, stats.imageArea),
    unionWidth,
    unionHeight,
  };
}

function getSplitClusterPositionScore(a, b, stats) {
  return getSplitClusterSpatialMetrics(a, b, stats).score;
}

function isLikelyPanelPair(fa, fb, spatial, sizeScore, aspectScore, stats) {
  const sameRow = Math.abs(fa.centerY - fb.centerY) <= Math.max(stats.minSide * 0.18, Math.min(fa.height, fb.height) * 0.48);
  const similarScale = sizeScore >= 0.48 && aspectScore >= 0.42;
  const closeEnough = spatial.gapScore >= 0.42 && spatial.compactScore >= 0.14;
  const notTooHuge = spatial.unionAreaRatio <= 0.34;
  return sameRow && similarScale && closeEnough && notTooHuge;
}

function isElongatedSplitFeature(feature) {
  return getNormalizedAspectRatio(feature?.width, feature?.height) >= 3.2;
}

function getSplitClusterSizeTier(feature, stats) {
  const areaRatio = feature.area / Math.max(1, stats.medianArea);
  const boxRatio = feature.boxArea / Math.max(1, stats.imageArea);
  const longSideRatio = Math.max(feature.width, feature.height) / Math.max(1, stats.minSide);
  if (boxRatio >= 0.1 || areaRatio >= 5 || longSideRatio >= 0.48) return 3;
  if (boxRatio >= 0.035 || areaRatio >= 2.2 || longSideRatio >= 0.28) return 2;
  if (areaRatio >= 0.72 || longSideRatio >= 0.16) return 1;
  return 0;
}

function isSplitClusterPairLocalEnough(fa, fb, spatial, stats) {
  const tierA = getSplitClusterSizeTier(fa, stats);
  const tierB = getSplitClusterSizeTier(fb, stats);
  const maxTier = Math.max(tierA, tierB);
  const avgSide = (Math.sqrt(fa.boxArea) + Math.sqrt(fb.boxArea)) / 2;
  const smallPair = maxTier <= 1;
  const gapLimit = Math.max(
    stats.minSide * (smallPair ? 0.2 : 0.28),
    avgSide * (smallPair ? 2.2 : 2.6)
  );
  const nearByGap = spatial.gap <= gapLimit || spatial.gapScore >= (smallPair ? 0.28 : 0.24);
  const compactEnough = spatial.compactScore >= (smallPair ? 0.16 : 0.12);
  const alignedEnough = spatial.lineScore >= (smallPair ? 0.64 : 0.56);
  const notSweepingAcrossImage = spatial.unionAreaRatio <= (smallPair ? 0.16 : 0.28);
  return notSweepingAcrossImage && nearByGap && (compactEnough || alignedEnough);
}

function getSplitClusterPairScore(a, b, stats) {
  const fa = a.feature;
  const fb = b.feature;
  const spatial = getSplitClusterSpatialMetrics(fa, fb, stats);
  const positionScore = spatial.score;
  const colorDistance = Math.sqrt(colorDistanceSq(fa.color.r, fa.color.g, fa.color.b, fb.color));
  const colorScore = clampUnit(1 - colorDistance / Math.sqrt(3 * 255 * 255));
  const areaRatio = Math.max(fa.area, fb.area) / Math.max(1, Math.min(fa.area, fb.area));
  const areaScore = clampUnit(1 - Math.log(areaRatio) / Math.log(16));
  const aspectA = fa.width / Math.max(1, fa.height);
  const aspectB = fb.width / Math.max(1, fb.height);
  const aspectRatio = Math.max(aspectA, aspectB) / Math.max(0.01, Math.min(aspectA, aspectB));
  const aspectScore = clampUnit(1 - Math.log(aspectRatio) / Math.log(8));
  const sizeScore = areaScore * 0.65 + aspectScore * 0.35;
  const panelPair = isLikelyPanelPair(fa, fb, spatial, sizeScore, aspectScore, stats);
  const strongSpatialLink = spatial.gapScore >= 0.56 && spatial.lineScore >= 0.62 && spatial.compactScore >= 0.22;
  const tierA = getSplitClusterSizeTier(fa, stats);
  const tierB = getSplitClusterSizeTier(fb, stats);
  const tierGap = Math.abs(tierA - tierB);
  const elongatedMismatch = isElongatedSplitFeature(fa) !== isElongatedSplitFeature(fb);
  const crossTierElongated = tierGap > 0 && (isElongatedSplitFeature(fa) || isElongatedSplitFeature(fb));
  const localEnough = isSplitClusterPairLocalEnough(fa, fb, spatial, stats);
  if (a.protected && b.protected && !panelPair) return Number.NEGATIVE_INFINITY;
  if ((a.protected || b.protected) && !(panelPair || strongSpatialLink)) return Number.NEGATIVE_INFINITY;
  const bothTiny = fa.area < stats.medianArea * 1.8 && fb.area < stats.medianArea * 1.8;
  if (positionScore < 0.3 && !bothTiny) return Number.NEGATIVE_INFINITY;
  if (tierGap >= 2 && crossTierElongated && !panelPair) return Number.NEGATIVE_INFINITY;
  if (tierGap >= 2 && spatial.compactScore < 0.34 && !bothTiny && !panelPair) return Number.NEGATIVE_INFINITY;
  if (elongatedMismatch && spatial.compactScore < 0.38 && !panelPair) return Number.NEGATIVE_INFINITY;
  const shapeScore = clampUnit(1 - Math.abs(fa.density - fb.density));
  let score = positionScore * 0.82 + colorScore * 0.1 + sizeScore * 0.05 + shapeScore * 0.03;
  if (panelPair) score += 0.12;
  else if (strongSpatialLink) score += 0.06;
  if (tierGap > 0) score -= tierGap * (crossTierElongated ? 0.2 : 0.1);
  if (elongatedMismatch) score -= 0.16;
  if (!localEnough && !panelPair) score -= bothTiny ? 0.32 : 0.22;
  if (a.protected || b.protected) score -= panelPair ? 0.02 : 0.2;
  const longSideRatio = Math.max(fa.width, fa.height, fb.width, fb.height) / Math.max(1, Math.min(fa.width, fa.height, fb.width, fb.height));
  if ((a.protected || b.protected) && longSideRatio > 4.2 && spatial.compactScore < 0.35) score -= 0.2;
  if ((a.protected || b.protected) && spatial.unionAreaRatio > 0.28 && !panelPair) score -= 0.22;
  return score;
}

function mergeSplitClusters(a, b, stats) {
  const items = [...a.items, ...b.items].sort((left, right) => (Number(left?.index) || 0) - (Number(right?.index) || 0));
  const cluster = {
    items,
    protected: a.protected || b.protected,
    feature: null,
  };
  cluster.feature = buildSplitClusterFeature(items, stats.width, stats.height);
  return cluster;
}

function getSplitClusterMergeBand(a, b, stats) {
  const tierA = getSplitClusterSizeTier(a.feature, stats);
  const tierB = getSplitClusterSizeTier(b.feature, stats);
  const maxTier = Math.max(tierA, tierB);
  const minTier = Math.min(tierA, tierB);
  const tierGap = maxTier - minTier;
  if (maxTier <= 1) return 0;
  if (maxTier <= 2 && tierGap <= 1) return 1;
  if (maxTier <= 2) return 2;
  if (minTier <= 1) return 4;
  return 3;
}

function getEffectiveSplitClusterMergeBand(band, score) {
  const thresholds = [0.28, 0.3, 0.32, 0.34, 0.36];
  const threshold = thresholds[Math.max(0, Math.min(thresholds.length - 1, band))];
  return score >= threshold ? band : band + 10;
}

function getSplitClusterCandidateBand(a, b, stats, score, spatial) {
  const rawBand = getSplitClusterMergeBand(a, b, stats);
  let band = getEffectiveSplitClusterMergeBand(rawBand, score);
  if (!isSplitClusterPairLocalEnough(a.feature, b.feature, spatial, stats)) {
    band += rawBand <= 1 ? 8 : 4;
  }
  return { rawBand, band };
}

function isBetterSplitClusterCandidate(candidate, current) {
  if (!current) return true;
  if (candidate.band !== current.band) return candidate.band < current.band;
  if (candidate.score !== current.score) return candidate.score > current.score;
  return candidate.rawBand < current.rawBand;
}

function findBestSplitClusterPair(clusters, stats) {
  let best = null;
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const score = getSplitClusterPairScore(clusters[i], clusters[j], stats);
      if (!Number.isFinite(score)) continue;
      const spatial = getSplitClusterSpatialMetrics(clusters[i].feature, clusters[j].feature, stats);
      const bandInfo = getSplitClusterCandidateBand(clusters[i], clusters[j], stats, score, spatial);
      const candidate = {
        i,
        j,
        score,
        rawBand: bandInfo.rawBand,
        band: bandInfo.band,
      };
      if (isBetterSplitClusterCandidate(candidate, best)) best = candidate;
    }
  }
  return best;
}

function findFallbackSplitClusterPair(clusters, stats) {
  let best = null;
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const a = clusters[i];
      const b = clusters[j];
      const spatial = getSplitClusterSpatialMetrics(a.feature, b.feature, stats);
      const tierGap = Math.abs(getSplitClusterSizeTier(a.feature, stats) - getSplitClusterSizeTier(b.feature, stats));
      const elongatedMismatch = isElongatedSplitFeature(a.feature) !== isElongatedSplitFeature(b.feature);
      const crossTierElongated = tierGap > 0 && (isElongatedSplitFeature(a.feature) || isElongatedSplitFeature(b.feature));
      const score = spatial.score
        - (a.protected && b.protected ? 0.72 : a.protected || b.protected ? 0.5 : 0)
        - (spatial.unionAreaRatio > 0.32 ? 0.16 : 0)
        - tierGap * (crossTierElongated ? 0.22 : 0.1)
        - (elongatedMismatch ? 0.18 : 0);
      const bandInfo = getSplitClusterCandidateBand(a, b, stats, score, spatial);
      const candidate = {
        i,
        j,
        score,
        rawBand: bandInfo.rawBand,
        band: bandInfo.band,
      };
      if (isBetterSplitClusterCandidate(candidate, best)) best = candidate;
    }
  }
  return best;
}

function getExpandedFeatureBounds(feature, padding) {
  const pad = Math.max(0, Number(padding) || 0);
  return {
    x: feature.x - pad,
    y: feature.y - pad,
    right: feature.right + pad,
    bottom: feature.bottom + pad,
  };
}

function getClusterMemberCoverageBounds(cluster) {
  const items = Array.isArray(cluster?.items) ? cluster.items : [];
  if (!items.length) return cluster?.feature || null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const coverage = item?.__clusterCoverageBounds;
    if (coverage && coverage.right > coverage.x && coverage.bottom > coverage.y) {
      minX = Math.min(minX, coverage.x);
      minY = Math.min(minY, coverage.y);
      maxX = Math.max(maxX, coverage.right);
      maxY = Math.max(maxY, coverage.bottom);
    } else {
      const bounds = getSplitItemBounds(item);
      const insetX = Math.max(0, Math.min(bounds.width * 0.18, bounds.width < 24 ? 0 : 14));
      const insetY = Math.max(0, Math.min(bounds.height * 0.18, bounds.height < 24 ? 0 : 14));
      minX = Math.min(minX, bounds.x + insetX);
      minY = Math.min(minY, bounds.y + insetY);
      maxX = Math.max(maxX, bounds.right - insetX);
      maxY = Math.max(maxY, bounds.bottom - insetY);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return cluster?.feature || null;
  }
  if (maxX <= minX || maxY <= minY) return cluster?.feature || null;
  return {
    x: minX,
    y: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    boxArea: Math.max(1, (maxX - minX) * (maxY - minY)),
  };
}

function getContainedClusterScore(inner, outer, stats) {
  if (!inner?.feature || !outer?.feature) return 0;
  if (inner === outer) return 0;
  const outerFeature = outer.feature;
  const innerCoverage = getClusterMemberCoverageBounds(inner) || inner.feature;
  const innerCoverageTier = getSplitClusterSizeTier(
    {
      ...innerCoverage,
      area: innerCoverage.boxArea,
    },
    stats
  );
  if (innerCoverageTier > 1) return 0;
  const areaRatio = innerCoverage.boxArea / Math.max(1, outerFeature.boxArea);
  if (areaRatio > 0.22) return 0;
  const outerBox = getExpandedFeatureBounds(outerFeature, 0);
  const ix1 = Math.max(innerCoverage.x, outerBox.x);
  const iy1 = Math.max(innerCoverage.y, outerBox.y);
  const ix2 = Math.min(innerCoverage.right, outerBox.right);
  const iy2 = Math.min(innerCoverage.bottom, outerBox.bottom);
  const intersectionArea = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const containedRatio = intersectionArea / Math.max(1, innerCoverage.boxArea);
  const centerInside =
    innerCoverage.centerX >= outerBox.x &&
    innerCoverage.centerX <= outerBox.right &&
    innerCoverage.centerY >= outerBox.y &&
    innerCoverage.centerY <= outerBox.bottom;
  if (containedRatio < 0.94 || !centerInside) return 0;
  return containedRatio + 0.08 - areaRatio * 0.12;
}

function absorbContainedClusters(clusters, stats, options = {}) {
  let next = [...clusters];
  const minCount = Math.max(1, Number(options.minCount) || 1);
  const maxMerges = Math.max(0, Number(options.maxMerges) || Number.POSITIVE_INFINITY);
  let mergeCount = 0;
  let changed = true;
  while (changed && next.length > minCount && mergeCount < maxMerges) {
    changed = false;
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let innerIndex = 0; innerIndex < next.length; innerIndex += 1) {
      for (let outerIndex = 0; outerIndex < next.length; outerIndex += 1) {
        if (innerIndex === outerIndex) continue;
        const score = getContainedClusterScore(next[innerIndex], next[outerIndex], stats);
        if (score > bestScore) {
          bestScore = score;
          best = { innerIndex, outerIndex };
        }
      }
    }
    if (!best || bestScore < 0.9) break;
    if (next.length <= minCount) break;
    const innerCluster = next[best.innerIndex];
    const outerCluster = next[best.outerIndex];
    const merged = mergeSplitClusters(innerCluster, outerCluster, stats);
    next = next.filter((_, index) => index !== best.innerIndex && index !== best.outerIndex);
    next.push(merged);
    next.sort((a, b) => (a.feature.y === b.feature.y ? a.feature.x - b.feature.x : a.feature.y - b.feature.y));
    mergeCount += 1;
    changed = true;
  }
  return next;
}

function getNormalizedAspectRatio(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  return Math.max(safeWidth / safeHeight, safeHeight / safeWidth);
}

const SPLIT_PACK_EMPTY_RATIO_THRESHOLD = 0.6;
const SPLIT_PACK_MIN_FINAL_AREA_REDUCTION = 0.18;
const SPLIT_PACK_MIN_EMPTY_RATIO_REDUCTION = 0.16;

function getSplitClusterMemberBoxArea(items = []) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const bounds = getSplitItemBounds(item);
    return sum + Math.max(1, bounds.width * bounds.height);
  }, 0);
}

function getStandardAspectArea(width, height) {
  const target = getStandardAspectCanvasSize(width, height);
  return Math.max(1, target.width * target.height);
}

function getSparseSplitClusterPackMetrics(cluster) {
  const items = Array.isArray(cluster?.items) ? cluster.items : [];
  const feature = cluster?.feature || {};
  const originalArea = getStandardAspectArea(feature.width, feature.height);
  const memberBoxArea = Math.max(1, getSplitClusterMemberBoxArea(items));
  const emptyRatio = clampUnit(1 - memberBoxArea / originalArea);
  const packedLayout = buildPackedSplitLayout(items);
  const packedArea = getStandardAspectArea(packedLayout.width, packedLayout.height);
  const packedEmptyRatio = clampUnit(1 - memberBoxArea / packedArea);
  return {
    emptyRatio,
    finalAreaReduction: clampUnit(1 - packedArea / originalArea),
    emptyRatioReduction: Math.max(0, emptyRatio - packedEmptyRatio),
  };
}

function shouldPackSplitCluster(cluster) {
  const count = Array.isArray(cluster?.items) ? cluster.items.length : 0;
  if (count < 2) return false;
  const feature = cluster?.feature || {};
  const normalizedAspect = getNormalizedAspectRatio(feature.width, feature.height);
  const wideOrTall = normalizedAspect > 16 / 9;
  const extremelyWideOrTall = normalizedAspect > 5;
  if (count >= 6 && wideOrTall && !cluster.protected) return true;
  if (count >= 3 && extremelyWideOrTall) return true;
  const sparseMetrics = getSparseSplitClusterPackMetrics(cluster);
  if (
    sparseMetrics.emptyRatio >= SPLIT_PACK_EMPTY_RATIO_THRESHOLD &&
    (
      sparseMetrics.finalAreaReduction >= SPLIT_PACK_MIN_FINAL_AREA_REDUCTION ||
      sparseMetrics.emptyRatioReduction >= SPLIT_PACK_MIN_EMPTY_RATIO_REDUCTION
    )
  ) {
    return true;
  }
  return false;
}

function sortSplitItemsForPacking(items = []) {
  return [...items].sort((a, b) => {
    const ba = getSplitItemBounds(a);
    const bb = getSplitItemBounds(b);
    const rowThreshold = Math.max(10, Math.min(ba.height, bb.height) * 0.45);
    if (Math.abs(ba.y - bb.y) > rowThreshold) return ba.y - bb.y;
    return ba.x - bb.x;
  });
}

function buildPackedSplitLayout(items = []) {
  const ordered = sortSplitItemsForPacking(items);
  const sizes = ordered.map((item) => {
    const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
    return {
      item,
      width: Math.max(1, Math.round(baseWidth)),
      height: Math.max(1, Math.round(baseHeight)),
    };
  });
  if (!sizes.length) return { width: 1, height: 1, placements: [], gap: 0 };
  const longSides = sizes.map((size) => Math.max(size.width, size.height));
  const medianLongSide = getMedianNumber(longSides);
  const gap = Math.max(8, Math.min(32, Math.round(medianLongSide * 0.1)));
  const padding = gap;
  const maxAspect = 16 / 9;
  let best = null;

  for (let cols = 1; cols <= sizes.length; cols += 1) {
    const rows = Math.ceil(sizes.length / cols);
    const colWidths = Array.from({ length: cols }, () => 1);
    const rowHeights = Array.from({ length: rows }, () => 1);
    sizes.forEach((size, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      colWidths[col] = Math.max(colWidths[col], size.width);
      rowHeights[row] = Math.max(rowHeights[row], size.height);
    });
    const width = padding * 2 + colWidths.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, cols - 1);
    const height = padding * 2 + rowHeights.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, rows - 1);
    const aspect = getNormalizedAspectRatio(width, height);
    const overflowPenalty = aspect > maxAspect ? (aspect - maxAspect) * 100000 : 0;
    const score = overflowPenalty + aspect * 100 + (width * height) / 100000;
    if (!best || score < best.score) {
      best = { cols, rows, colWidths, rowHeights, width, height, aspect, score };
    }
  }

  const layout = best || {
    cols: sizes.length,
    rows: 1,
    colWidths: sizes.map((size) => size.width),
    rowHeights: [Math.max(...sizes.map((size) => size.height))],
    width: 1,
    height: 1,
  };
  const colOffsets = [];
  let xCursor = padding;
  for (let col = 0; col < layout.cols; col += 1) {
    colOffsets[col] = xCursor;
    xCursor += layout.colWidths[col] + gap;
  }
  const rowOffsets = [];
  let yCursor = padding;
  for (let row = 0; row < layout.rows; row += 1) {
    rowOffsets[row] = yCursor;
    yCursor += layout.rowHeights[row] + gap;
  }
  const placements = sizes.map((size, index) => {
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    return {
      item: size.item,
      x: Math.round(colOffsets[col] + (layout.colWidths[col] - size.width) / 2),
      y: Math.round(rowOffsets[row] + (layout.rowHeights[row] - size.height) / 2),
      width: size.width,
      height: size.height,
    };
  });
  return {
    width: Math.max(1, Math.round(layout.width)),
    height: Math.max(1, Math.round(layout.height)),
    placements,
    gap,
  };
}

async function composePackedSplitField(layout, shapeMode) {
  const width = Math.max(1, Number(layout?.width) || 1);
  const height = Math.max(1, Number(layout?.height) || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const placements = Array.isArray(layout?.placements) ? layout.placements : [];
  for (let i = 0; i < placements.length; i += 1) {
    const placement = placements[i];
    const dataUrl = getSplitItemSourceByShape(placement.item, shapeMode);
    if (!dataUrl) continue;
    try {
      const image = await loadImageElement(dataUrl);
      ctx.drawImage(image, placement.x, placement.y, placement.width, placement.height);
    } catch {
      // Ignore one failed packed item and keep composing the rest.
    }
  }
  return canvas.toDataURL("image/png");
}

async function materializeSplitCluster(cluster, index) {
  const items = cluster.items;
  if (items.length === 1) {
    const item = items[0];
    const { __clusterColor, __clusterCoverageBounds, ...cleanItem } = item;
    return {
      ...cleanItem,
      index: index + 1,
      clusterCount: 1,
      clusterMemberIds: [item.id].filter(Boolean),
      clusterMemberIndexes: [Number(item.index) || index + 1],
    };
  }
  const feature = cluster.feature;
  const bounds = {
    x: Math.max(0, Math.floor(feature.x)),
    y: Math.max(0, Math.floor(feature.y)),
    width: Math.max(1, Math.ceil(feature.right) - Math.max(0, Math.floor(feature.x))),
    height: Math.max(1, Math.ceil(feature.bottom) - Math.max(0, Math.floor(feature.y))),
  };
  const shouldPack = shouldPackSplitCluster(cluster);
  const packedLayout = shouldPack ? buildPackedSplitLayout(items) : null;
  const [rectImage, edgeImage, polygonImage] = await Promise.all(
    packedLayout
      ? [
          composePackedSplitField(packedLayout, "rect"),
          composePackedSplitField(packedLayout, "edge"),
          composePackedSplitField(packedLayout, "polygon"),
        ]
      : [
          composeMergedSplitField(items, "rect", bounds),
          composeMergedSplitField(items, "edge", bounds),
          composeMergedSplitField(items, "polygon", bounds),
        ]
  );
  const id = `cluster-${index + 1}-${items.map((item) => item.id || item.index || "item").join("-")}`;
  const outputWidth = packedLayout?.width || bounds.width;
  const outputHeight = packedLayout?.height || bounds.height;
  return {
    id,
    index: index + 1,
    x: bounds.x,
    y: bounds.y,
    width: outputWidth,
    height: outputHeight,
    baseWidth: bounds.width,
    baseHeight: bounds.height,
    area: items.reduce((sum, item) => sum + (Number(item?.area) || 0), 0) || bounds.width * bounds.height,
    rectImage: rectImage || edgeImage || polygonImage,
    edgeImage: edgeImage || polygonImage || rectImage,
    polygonImage: polygonImage || edgeImage || rectImage,
    transparentImage: edgeImage || polygonImage || rectImage,
    enhancedRectImage: "",
    enhancedRectWidth: 0,
    enhancedRectHeight: 0,
    enhancedEdgeImage: "",
    enhancedEdgeWidth: 0,
    enhancedEdgeHeight: 0,
    enhancedPolygonImage: "",
    enhancedPolygonWidth: 0,
    enhancedPolygonHeight: 0,
    paintedRectImage: "",
    paintedEdgeImage: "",
    paintedPolygonImage: "",
    paintedEnhancedRectImage: "",
    paintedEnhancedEdgeImage: "",
    paintedEnhancedPolygonImage: "",
    paintedBackgroundColor: "",
    image: edgeImage || polygonImage || rectImage,
    layoutMode: packedLayout ? "packed" : "original",
    originalClusterBounds: bounds,
    packedWidth: packedLayout?.width || 0,
    packedHeight: packedLayout?.height || 0,
    clusterCount: items.length,
    clusterMemberIds: items.map((item) => item.id).filter(Boolean),
    clusterMemberIndexes: items.map((item) => Number(item.index) || 0).filter(Boolean),
  };
}

function buildClusterPreviewItemsFromClusters(clusters = []) {
  return (Array.isArray(clusters) ? clusters : []).map((cluster, index) => {
    const feature = cluster?.feature || buildSplitClusterFeature(cluster?.items || [], 1, 1);
    const x = Math.max(0, Math.floor(Number(feature.x) || 0));
    const y = Math.max(0, Math.floor(Number(feature.y) || 0));
    const right = Math.max(x + 1, Math.ceil(Number(feature.right) || x + 1));
    const bottom = Math.max(y + 1, Math.ceil(Number(feature.bottom) || y + 1));
    const items = Array.isArray(cluster?.items) ? cluster.items : [];
    return {
      id: `cluster-preview-${index + 1}`,
      index: index + 1,
      x,
      y,
      width: right - x,
      height: bottom - y,
      baseWidth: right - x,
      baseHeight: bottom - y,
      area: Number(feature.area) || 0,
      clusterCount: items.length,
      clusterMemberIds: items.map((item) => item.id).filter(Boolean),
      clusterMemberIndexes: items.map((item) => Number(item.index) || 0).filter(Boolean),
    };
  });
}

export async function buildClusteredSplitItems(items = [], options = {}) {
  const source = (Array.isArray(items) ? items : []).filter((item) => item && (item.edgeImage || item.rectImage || item.image));
  const maxCount = Math.max(1, Number(options.maxCount) || MAX_CLUSTERED_SPLIT_ITEMS);
  const includeStages = options.includeStages === true;
  if (!source.length) return includeStages ? { items: [], clusterStageItems: [], absorbedStageItems: [] } : [];
  const sourceWidth = Math.max(1, Number(options.width) || Math.max(...source.map((item) => getSplitItemBounds(item).right), 1));
  const sourceHeight = Math.max(1, Number(options.height) || Math.max(...source.map((item) => getSplitItemBounds(item).bottom), 1));
  const colorFeatures = await Promise.all(source.map((item) => collectSplitItemColorFeature(item)));
  const seeds = source.map((item, index) => ({
    ...item,
    index: Number(item.index) || index + 1,
    __clusterColor: colorFeatures[index],
    __clusterCoverageBounds: colorFeatures[index]?.coverageBounds || null,
  }));
  const stats = getSplitClusterStats(seeds, sourceWidth, sourceHeight);
  if (seeds.length <= maxCount) {
    const output = seeds.map(({ __clusterColor, __clusterCoverageBounds, ...item }, index) => ({
      ...item,
      index: index + 1,
      clusterCount: 1,
      clusterMemberIds: [item.id].filter(Boolean),
      clusterMemberIndexes: [Number(item.index) || index + 1],
    }));
    return includeStages
      ? { items: output, clusterStageItems: output, absorbedStageItems: output }
      : output;
  }
  let clusters = seeds.map((item) => {
    const cluster = {
      items: [item],
      protected: false,
      feature: buildSplitClusterFeature([item], sourceWidth, sourceHeight),
    };
    cluster.protected = isProtectedSplitCluster(cluster, stats);
    return cluster;
  });

  while (clusters.length > maxCount) {
    let best = findBestSplitClusterPair(clusters, stats);
    if (!best) best = findFallbackSplitClusterPair(clusters, stats);
    if (!best) break;
    const merged = mergeSplitClusters(clusters[best.i], clusters[best.j], stats);
    clusters = clusters.filter((_, index) => index !== best.i && index !== best.j);
    clusters.push(merged);
    clusters.sort((a, b) => (a.feature.y === b.feature.y ? a.feature.x - b.feature.x : a.feature.y - b.feature.y));
  }
  const clusterStageItems = buildClusterPreviewItemsFromClusters(clusters);
  clusters = absorbContainedClusters(clusters, stats);
  const absorbedStageItems = buildClusterPreviewItemsFromClusters(clusters);

  const output = await Promise.all(clusters.map((cluster, index) => materializeSplitCluster(cluster, index)));
  const finalItems = output.map((item, index) => ({ ...item, index: index + 1 }));
  return includeStages
    ? { items: finalItems, clusterStageItems, absorbedStageItems }
    : finalItems;
}

export async function buildClusterProcessPreview(sourceImage, baseProcessImage, items = [], options = {}) {
  const fallbackImage = normalizeImageValue(baseProcessImage) || normalizeImageValue(sourceImage) || "";
  if (!fallbackImage) return "";
  const image = await loadImageElement(fallbackImage);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const sourceWidth = Math.max(1, Number(options.width) || width);
  const sourceHeight = Math.max(1, Number(options.height) || height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallbackImage;
  ctx.drawImage(image, 0, 0, width, height);
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;
  const strokeWidth = Math.max(2, Math.min(8, Math.round(Math.min(width, height) / 170) || 2));
  ctx.save();
  ctx.strokeStyle = options.strokeStyle || "rgba(34,197,94,0.98)";
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(2,6,23,0.9)";
  ctx.shadowBlur = strokeWidth * 1.5;
  const safeItems = Array.isArray(items) ? items : [];
  safeItems.forEach((item) => {
    const bounds = getSplitItemBounds(item);
    const x = bounds.x * scaleX;
    const y = bounds.y * scaleY;
    const drawWidth = bounds.width * scaleX;
    const drawHeight = bounds.height * scaleY;
    const inset = strokeWidth / 2;
    ctx.strokeRect(x + inset, y + inset, Math.max(1, drawWidth - strokeWidth), Math.max(1, drawHeight - strokeWidth));
  });
  ctx.restore();
  return canvas.toDataURL("image/png");
}

export async function splitImageBySubjects(source) {
  const normalized = normalizeImageValue(source);
  if (!normalized) throw new Error("Invalid image source");
  const image = await loadImageElement(normalized);
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const mask = buildForegroundMask(imageData, width, height);
  const processImage = buildSplitProcessPreview(imageData, mask, width, height);
  const boxes = collectSubjectBounds(mask, width, height);
  const bgPalette = collectBorderPalette(imageData, width, height);
  const dominantBg = bgPalette[0] || { r: 255, g: 255, b: 255 };
  const backgroundColor = rgbToHexColor(dominantBg.r, dominantBg.g, dominantBg.b);

  const removedCanvas = document.createElement("canvas");
  removedCanvas.width = width;
  removedCanvas.height = height;
  const removedCtx = removedCanvas.getContext("2d");
  if (removedCtx) {
    const removedData = removedCtx.createImageData(width, height);
    const srcData = imageData.data;
    const dstData = removedData.data;
    for (let i = 0; i < width * height; i += 1) {
      const dst = i * 4;
      if (!mask[i]) {
        dstData[dst] = 0;
        dstData[dst + 1] = 0;
        dstData[dst + 2] = 0;
        dstData[dst + 3] = 0;
        continue;
      }
      dstData[dst] = srcData[dst];
      dstData[dst + 1] = srcData[dst + 1];
      dstData[dst + 2] = srcData[dst + 2];
      dstData[dst + 3] = srcData[dst + 3];
    }
    removedCtx.putImageData(removedData, 0, 0);
  }

  const padding = Math.max(1, Math.min(16, Math.floor(Math.min(width, height) * 0.012)));
  const items = boxes.map((box, index) => {
    const x = Math.max(0, box.x - padding);
    const y = Math.max(0, box.y - padding);
    const right = Math.min(width - 1, box.x + box.width - 1 + padding);
    const bottom = Math.min(height - 1, box.y + box.height - 1 + padding);
    const cropWidth = Math.max(1, right - x + 1);
    const cropHeight = Math.max(1, bottom - y + 1);
    const out = document.createElement("canvas");
    out.width = cropWidth;
    out.height = cropHeight;
    const outCtx = out.getContext("2d");
    const rectOut = document.createElement("canvas");
    rectOut.width = cropWidth;
    rectOut.height = cropHeight;
    const rectCtx = rectOut.getContext("2d");
    if (outCtx && rectCtx) {
      const outImageData = outCtx.createImageData(cropWidth, cropHeight);
      const rectImageData = rectCtx.createImageData(cropWidth, cropHeight);
      const srcData = imageData.data;
      const outData = outImageData.data;
      const rectData = rectImageData.data;
      const localMask = new Uint8Array(cropWidth * cropHeight);
      const componentPixels = Array.isArray(box.pixels) ? box.pixels : [];
      if (componentPixels.length) {
        for (let p = 0; p < componentPixels.length; p += 1) {
          const sourceIndex = componentPixels[p];
          const gx = sourceIndex % width;
          const gy = Math.floor(sourceIndex / width);
          if (gx < x || gx > right || gy < y || gy > bottom) continue;
          localMask[(gy - y) * cropWidth + (gx - x)] = 1;
        }
      }
      for (let py = 0; py < cropHeight; py += 1) {
        for (let px = 0; px < cropWidth; px += 1) {
          const gx = x + px;
          const gy = y + py;
          const srcMaskIndex = gy * width + gx;
          const localMaskIndex = py * cropWidth + px;
          const outIndex = (py * cropWidth + px) * 4;
          const srcIndex = srcMaskIndex * 4;
          rectData[outIndex] = srcData[srcIndex];
          rectData[outIndex + 1] = srcData[srcIndex + 1];
          rectData[outIndex + 2] = srcData[srcIndex + 2];
          rectData[outIndex + 3] = srcData[srcIndex + 3];
          if (!componentPixels.length) {
            localMask[localMaskIndex] = mask[srcMaskIndex] ? 1 : 0;
          }
          const isForeground = localMask[localMaskIndex] === 1;
          if (!isForeground) {
            outData[outIndex] = 0;
            outData[outIndex + 1] = 0;
            outData[outIndex + 2] = 0;
            outData[outIndex + 3] = 0;
            continue;
          }
          outData[outIndex] = srcData[srcIndex];
          outData[outIndex + 1] = srcData[srcIndex + 1];
          outData[outIndex + 2] = srcData[srcIndex + 2];
          outData[outIndex + 3] = srcData[srcIndex + 3];
        }
      }
      rectCtx.putImageData(rectImageData, 0, 0);
      outCtx.putImageData(outImageData, 0, 0);
      const edgeImage = out.toDataURL("image/png");
      const rectImage = rectOut.toDataURL("image/png");
      const polygonImage = buildPolygonMaskedImage(rectImageData, localMask, cropWidth, cropHeight, edgeImage);
      return {
        id: `subject-${index + 1}`,
        index: index + 1,
        x,
        y,
        width: cropWidth,
        height: cropHeight,
        baseWidth: cropWidth,
        baseHeight: cropHeight,
        area: box.area,
        rectImage,
        edgeImage,
        polygonImage,
        transparentImage: edgeImage,
        enhancedRectImage: "",
        enhancedRectWidth: 0,
        enhancedRectHeight: 0,
        enhancedEdgeImage: "",
        enhancedEdgeWidth: 0,
        enhancedEdgeHeight: 0,
        enhancedPolygonImage: "",
        enhancedPolygonWidth: 0,
        enhancedPolygonHeight: 0,
        paintedRectImage: "",
        paintedEdgeImage: "",
        paintedPolygonImage: "",
        paintedEnhancedRectImage: "",
        paintedEnhancedEdgeImage: "",
        paintedEnhancedPolygonImage: "",
        image: edgeImage,
      };
    }
    return {
      id: `subject-${index + 1}`,
      index: index + 1,
      x,
      y,
      width: cropWidth,
      height: cropHeight,
      baseWidth: cropWidth,
      baseHeight: cropHeight,
      area: box.area,
      rectImage: "",
      edgeImage: "",
      polygonImage: "",
      transparentImage: "",
      enhancedRectImage: "",
      enhancedRectWidth: 0,
      enhancedRectHeight: 0,
      enhancedEdgeImage: "",
      enhancedEdgeWidth: 0,
      enhancedEdgeHeight: 0,
      enhancedPolygonImage: "",
      enhancedPolygonWidth: 0,
      enhancedPolygonHeight: 0,
      paintedRectImage: "",
      paintedEdgeImage: "",
      paintedPolygonImage: "",
      paintedEnhancedRectImage: "",
      paintedEnhancedEdgeImage: "",
      paintedEnhancedPolygonImage: "",
      image: "",
    };
  });
  return {
    sourceImage: canvas.toDataURL("image/png"),
    removedImage: removedCanvas.toDataURL("image/png"),
    processImage,
    backgroundColor,
    width,
    height,
    items,
  };
}

export async function resolveSplitSourceDataUrl(rawImage, options = {}) {
  const runtimeConfig = getRuntimeConfig();
  const apiBaseUrl = options.apiBaseUrl || runtimeConfig.apiBaseUrl || "";
  const proxyUrl = options.proxyUrl || runtimeConfig.proxyUrl || "";
  let normalized = normalizeImageValue(rawImage, apiBaseUrl);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) {
    const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
    normalized = normalizeImageValue(proxied, apiBaseUrl) || normalized;
  }
  if (/^https?:\/\//i.test(normalized)) {
    const resp = await fetch(normalized);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    normalized = await blobToDataUrl(blob);
  }
  return normalizeImageValue(normalized, apiBaseUrl);
}

export async function buildSplitItemDisplayList(items = [], options = {}) {
  const source = Array.isArray(items) ? items : [];
  const shapeMode = normalizeSplitShapeMode(options.shapeMode);
  const renderMode = normalizeSplitRenderMode(options.renderMode);
  const backgroundColor = typeof options.backgroundColor === "string" && options.backgroundColor.trim()
    ? options.backgroundColor
    : DEFAULT_SPLIT_BG_COLOR;
  const enhance = options.enhance !== false;
  const result = [];
  for (let index = 0; index < source.length; index += 1) {
    const item = source[index];
    const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
    const rectImage = item.rectImage || item.image || "";
    const edgeImage = item.edgeImage || item.transparentImage || rectImage;
    const polygonImage = item.polygonImage || edgeImage;
    let displayBaseImage = getSplitShapeDataUrl({ rectImage, edgeImage, polygonImage, image: item.image }, shapeMode);
    if (!displayBaseImage) continue;
    let width = item.width || 0;
    let height = item.height || 0;

    let enhancedRectImage = item.enhancedRectImage || "";
    let enhancedRectWidth = Number(item.enhancedRectWidth) || 0;
    let enhancedRectHeight = Number(item.enhancedRectHeight) || 0;
    let enhancedEdgeImage = item.enhancedEdgeImage || "";
    let enhancedEdgeWidth = Number(item.enhancedEdgeWidth) || 0;
    let enhancedEdgeHeight = Number(item.enhancedEdgeHeight) || 0;
    let enhancedPolygonImage = item.enhancedPolygonImage || "";
    let enhancedPolygonWidth = Number(item.enhancedPolygonWidth) || 0;
    let enhancedPolygonHeight = Number(item.enhancedPolygonHeight) || 0;

    if (enhance) {
      if (shapeMode === "rect" && (!enhancedRectImage || !enhancedRectWidth || !enhancedRectHeight)) {
        const enhanced = await enhanceSplitImageDataUrl(rectImage || displayBaseImage, { minLongSide: 1024 });
        enhancedRectImage = enhanced.dataUrl;
        enhancedRectWidth = enhanced.width;
        enhancedRectHeight = enhanced.height;
      } else if (shapeMode === "polygon" && (!enhancedPolygonImage || !enhancedPolygonWidth || !enhancedPolygonHeight)) {
        const enhanced = await enhanceSplitImageDataUrl(polygonImage || edgeImage || displayBaseImage, { minLongSide: 1024 });
        enhancedPolygonImage = enhanced.dataUrl;
        enhancedPolygonWidth = enhanced.width;
        enhancedPolygonHeight = enhanced.height;
      } else if (shapeMode === "edge" && (!enhancedEdgeImage || !enhancedEdgeWidth || !enhancedEdgeHeight)) {
        const enhanced = await enhanceSplitImageDataUrl(edgeImage || displayBaseImage, { minLongSide: 1024 });
        enhancedEdgeImage = enhanced.dataUrl;
        enhancedEdgeWidth = enhanced.width;
        enhancedEdgeHeight = enhanced.height;
      }
    }

    let displayImage = displayBaseImage;
    if (enhance) {
      if (shapeMode === "rect") {
        displayImage = enhancedRectImage || displayBaseImage;
        width = enhancedRectWidth || width;
        height = enhancedRectHeight || height;
      } else if (shapeMode === "polygon") {
        displayImage = enhancedPolygonImage || displayBaseImage;
        width = enhancedPolygonWidth || width;
        height = enhancedPolygonHeight || height;
      } else {
        displayImage = enhancedEdgeImage || displayBaseImage;
        width = enhancedEdgeWidth || width;
        height = enhancedEdgeHeight || height;
      }
    }

    let paintedRectImage = item.paintedRectImage || "";
    let paintedEdgeImage = item.paintedEdgeImage || "";
    let paintedPolygonImage = item.paintedPolygonImage || "";
    let paintedEnhancedRectImage = item.paintedEnhancedRectImage || "";
    let paintedEnhancedEdgeImage = item.paintedEnhancedEdgeImage || "";
    let paintedEnhancedPolygonImage = item.paintedEnhancedPolygonImage || "";
    const paintedBackgroundColor = item.paintedBackgroundColor || "";
    if (paintedBackgroundColor !== backgroundColor) {
      paintedRectImage = "";
      paintedEdgeImage = "";
      paintedPolygonImage = "";
      paintedEnhancedRectImage = "";
      paintedEnhancedEdgeImage = "";
      paintedEnhancedPolygonImage = "";
    }

    if (renderMode === "painted") {
      if (enhance) {
        if (shapeMode === "rect") {
          if (!paintedEnhancedRectImage) paintedEnhancedRectImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEnhancedRectImage;
        } else if (shapeMode === "polygon") {
          if (!paintedEnhancedPolygonImage) paintedEnhancedPolygonImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEnhancedPolygonImage;
        } else {
          if (!paintedEnhancedEdgeImage) paintedEnhancedEdgeImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEnhancedEdgeImage;
        }
      } else {
        if (shapeMode === "rect") {
          if (!paintedRectImage) paintedRectImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedRectImage;
        } else if (shapeMode === "polygon") {
          if (!paintedPolygonImage) paintedPolygonImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedPolygonImage;
        } else {
          if (!paintedEdgeImage) paintedEdgeImage = await renderDataUrlOnBackground(displayImage, backgroundColor);
          displayImage = paintedEdgeImage;
        }
      }
    }

    const expanded = await expandDataUrlToStandardAspect(displayImage, {
      fillColor: renderMode === "painted" ? backgroundColor : "",
    });
    displayImage = expanded.dataUrl || displayImage;
    width = expanded.width || width;
    height = expanded.height || height;

    result.push({
      ...item,
      index: index + 1,
      baseWidth,
      baseHeight,
      width: width || item.width || 0,
      height: height || item.height || 0,
      outputAspectRatio: expanded.aspectRatio || "",
      rectImage,
      edgeImage,
      polygonImage,
      transparentImage: edgeImage,
      enhancedRectImage,
      enhancedRectWidth,
      enhancedRectHeight,
      enhancedEdgeImage,
      enhancedEdgeWidth,
      enhancedEdgeHeight,
      enhancedPolygonImage,
      enhancedPolygonWidth,
      enhancedPolygonHeight,
      paintedRectImage,
      paintedEdgeImage,
      paintedPolygonImage,
      paintedEnhancedRectImage,
      paintedEnhancedEdgeImage,
      paintedEnhancedPolygonImage,
      paintedBackgroundColor: backgroundColor,
      image: displayImage,
    });
  }
  return result;
}

export async function buildRemovedDisplayImage(baseImage, options = {}) {
  const source = typeof baseImage === "string" ? baseImage : "";
  if (!source) return { image: "", enhancedImage: "" };
  const enhance = options.enhance !== false;
  const cachedEnhanced = typeof options.cachedEnhanced === "string" ? options.cachedEnhanced : "";
  if (!enhance) {
    return {
      image: source,
      enhancedImage: cachedEnhanced,
    };
  }
  if (cachedEnhanced) {
    return {
      image: cachedEnhanced,
      enhancedImage: cachedEnhanced,
    };
  }
  const enhanced = await enhanceSplitImageDataUrl(source, { minLongSide: 1024 });
  return {
    image: enhanced.dataUrl,
    enhancedImage: enhanced.dataUrl,
  };
}

export function normalizePromptVariant(variant, index = 0) {
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

const COMPARE_KEYS = ["a", "b", "c", "d"];
const COMPARE_LABELS = ["PROMPT A", "PROMPT B", "PROMPT C", "PROMPT D"];

export function getComposerPromptVariants(taskMode, prompt, comparePrompts, styleThemes = []) {
  if (taskMode === "compare") {
    const list = Array.isArray(comparePrompts)
      ? comparePrompts
      : [comparePrompts?.a || "", comparePrompts?.b || ""];
    return list.map((p, i) =>
      normalizePromptVariant(
        { key: COMPARE_KEYS[i] || `variant-${i}`, label: COMPARE_LABELS[i] || `PROMPT ${i + 1}`, prompt: p || "" },
        i + 1
      )
    );
  }
  if (taskMode === "style") {
    return buildStylePromptVariants(prompt, styleThemes);
  }
  return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: prompt || "" }, 0)];
}

export function getTurnPromptVariants(turn) {
  if (Array.isArray(turn?.promptVariants) && turn.promptVariants.length) {
    return turn.promptVariants.map((variant, index) => normalizePromptVariant(variant, index));
  }
  return [normalizePromptVariant({ key: "single", label: "PROMPT", prompt: turn?.prompt || "" }, 0)];
}

export function getTurnMode(turn) {
  if (turn?.mode === "style") return "style";
  if (turn?.mode === "compare") return "compare";
  if (turn?.mode === "single") return "single";
  return getTurnPromptVariants(turn).length > 1 ? "compare" : "single";
}

export function getResultPromptKey(result) {
  return typeof result?.promptKey === "string" && result.promptKey ? result.promptKey : "single";
}

export function buildTurnImageKey(turnId, modelId, promptKey = "single", index = 1) {
  return `${turnId}:${modelId}:${promptKey || "single"}:${Math.max(1, Number(index) || 1)}`;
}

export function buildTurnTaskKey(turnId, modelId, promptKey = "single") {
  return `${turnId}:${modelId}:${promptKey || "single"}`;
}

export function toPersistableTurns(turns) {
  return turns.slice(0, 30);
}

export function toLightweightTurns(turns) {
  return turns.slice(0, 30).map((t) => ({
    ...t,
    results: (t.results || []).map((r) => ({
      ...r,
      images: (r.images || []).filter((img) => typeof img === "string" && img.startsWith("http")).slice(0, 1),
    })),
  }));
}

export function safeName(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return "unknown";
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return cleaned || "unknown";
}

export function buildResultFileStem(result) {
  const rawPromptKey = getResultPromptKey(result);
  const promptKey = safeName(rawPromptKey);
  const promptLabel = safeName(result?.promptLabel || "");
  const promptPrefix =
    rawPromptKey !== "single"
      ? `${promptKey}${promptLabel !== "unknown" ? `_${promptLabel}` : ""}_`
      : "";
  return `${promptPrefix}${safeName(result?.modelName || result?.modelId || "model")}`;
}

export function isSameResultTask(result, modelId, promptKey = "single") {
  return result?.modelId === modelId && getResultPromptKey(result) === (promptKey || "single");
}

export function normalizeTemplate(input, index = 0) {
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

export function normalizeTemplates(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_TEMPLATES.map((preset, index) => {
    const found = list.find((item) => item?.id === preset.id);
    return normalizeTemplate(found || preset, index);
  });
}

export function normalizeStyleTemplate(input, index = 0) {
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

export function normalizeStyleTemplates(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_STYLE_TEMPLATES.map((preset, index) => {
    const found = list.find((item) => item?.id === preset.id);
    return normalizeStyleTemplate(found || preset, index);
  });
}

export function pickStyleTemplateId(templates, preferredId) {
  if (!templates.length) return null;
  if (typeof preferredId === "string" && preferredId && templates.some((item) => item.id === preferredId)) return preferredId;
  return null;
}

export function normalizeStyleThemes(input) {
  const list = Array.isArray(input) ? input : [];
  return DEFAULT_STYLE_THEMES.map((_, index) => {
    const next = list[index];
    return typeof next === "string" ? next : "";
  });
}

export function pickTemplateId(templates, preferredId) {
  if (!templates.length) return null;
  if (typeof preferredId === "string" && preferredId && templates.some((item) => item.id === preferredId)) return preferredId;
  return null;
}

export function getTurnDirName(turn) {
  return `turn-${String(turn?.seq || 0).padStart(4, "0")}-${turn?.id}`;
}

export function dataUrlToBytes(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "png";
  return { bytes, ext, mime };
}

export function extFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  } catch {}
  return "png";
}

export async function fetchImageBytes(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const type = resp.headers.get("content-type") || "";
  const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : extFromUrl(url);
  return { bytes: buf, ext };
}

export function supportsFileSystemAccess() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function ensureDirectoryPermission(handle, write = false) {
  if (!handle?.queryPermission || !handle?.requestPermission) return false;
  const mode = write ? "readwrite" : "read";
  let permission = await handle.queryPermission({ mode });
  if (permission === "granted") return true;
  permission = await handle.requestPermission({ mode });
  return permission === "granted";
}

export async function writeTextFile(dirHandle, fileName, text) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function writeBinaryFile(dirHandle, fileName, content) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function saveTurnToLocalFolder(rootHandle, turn) {
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
    apiKeys: normalizeApiKeys(turn.apiKeys),
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

const SPLIT_HISTORY_FOLDER_NAME = "split-history";

async function writeDataUrlImageFile(dirHandle, fileNameBase, dataUrl) {
  const data = typeof dataUrl === "string" ? dataUrlToBytes(dataUrl) : null;
  if (!data) return "";
  const fileName = `${fileNameBase}.${data.ext}`;
  await writeBinaryFile(dirHandle, fileName, data.bytes);
  return fileName;
}

async function readSplitHistoryImageFile(dirHandle, fileName) {
  if (typeof fileName !== "string" || !fileName) return "";
  try {
    const handle = await dirHandle.getFileHandle(fileName);
    const file = await handle.getFile();
    const dataUrl = await fileToDataUrlFromFile(file);
    return typeof dataUrl === "string" ? dataUrl : "";
  } catch {
    return "";
  }
}

async function writeSplitHistoryItemGroup(dirHandle, prefix, items = []) {
  const sourceItems = Array.isArray(items) ? items : [];
  const manifestItems = [];
  for (let index = 0; index < Math.min(sourceItems.length, MAX_SPLIT_EXPORT_ITEMS); index += 1) {
    const item = sourceItems[index];
    const file = await writeDataUrlImageFile(dirHandle, `${prefix}_${String(index + 1).padStart(3, "0")}`, item?.image || item?.edgeImage || "");
    if (!file) continue;
    manifestItems.push({
      index: index + 1,
      file,
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0,
      width: Number(item?.width) || 0,
      height: Number(item?.height) || 0,
      area: Number(item?.area) || 0,
      clusterCount: Number(item?.clusterCount) || 1,
      clusterMemberIndexes: Array.isArray(item?.clusterMemberIndexes) ? item.clusterMemberIndexes : [],
      outputAspectRatio: typeof item?.outputAspectRatio === "string" ? item.outputAspectRatio : "",
      layoutMode: typeof item?.layoutMode === "string" ? item.layoutMode : "",
    });
  }
  return manifestItems;
}

async function readSplitHistoryItemGroup(dirHandle, items = []) {
  const output = [];
  const metaItems = Array.isArray(items) ? items : [];
  for (const item of metaItems) {
    const image = await readSplitHistoryImageFile(dirHandle, item.file);
    if (!image) continue;
    output.push({
      ...item,
      image,
    });
  }
  return output;
}

export async function saveSplitHistoryToLocalFolder(rootHandle, record = {}) {
  const createdAt = Number(record.createdAt) || Date.now();
  const stem = safeName(record.fileStem || "image");
  const folderName = record.folderName || `split-${stem}-${createdAt}`;
  const splitRoot = await rootHandle.getDirectoryHandle(SPLIT_HISTORY_FOLDER_NAME, { create: true });
  const splitDir = await splitRoot.getDirectoryHandle(folderName, { create: true });
  const sourceFile = await writeDataUrlImageFile(splitDir, "original", record.originalImage || record.sourceImage || "");
  const processFile = await writeDataUrlImageFile(splitDir, "process", record.processImage || "");
  const clusterProcessFile = await writeDataUrlImageFile(splitDir, "cluster_process", record.clusterProcessImage || "");
  const absorbedProcessFile = await writeDataUrlImageFile(splitDir, "absorbed_process", record.absorbedProcessImage || "");
  const sourceItems = Array.isArray(record.items) ? record.items : [];
  const sourceSplitItems = Array.isArray(record.splitItems) ? record.splitItems : sourceItems;
  const sourceClusterItems = Array.isArray(record.clusterItems) ? record.clusterItems : sourceItems;
  const sourceUpscaledItems = Array.isArray(record.upscaledItems) ? record.upscaledItems : [];
  const manifestItems = await writeSplitHistoryItemGroup(splitDir, "subject", sourceItems);
  const splitItems = await writeSplitHistoryItemGroup(splitDir, "split", sourceSplitItems);
  const clusterItems = await writeSplitHistoryItemGroup(splitDir, "cluster", sourceClusterItems);
  const upscaledItems = [];
  for (let index = 0; index < Math.min(sourceUpscaledItems.length, MAX_SPLIT_EXPORT_ITEMS); index += 1) {
    const item = sourceUpscaledItems[index];
    const beforeFile = await writeDataUrlImageFile(splitDir, `upscale_before_${String(index + 1).padStart(3, "0")}`, item?.beforeImage || item?.before || "");
    const afterFile = await writeDataUrlImageFile(splitDir, `upscale_after_${String(index + 1).padStart(3, "0")}`, item?.afterImage || item?.after || "");
    if (!beforeFile && !afterFile) continue;
    upscaledItems.push({
      index: index + 1,
      beforeFile,
      afterFile,
      width: Number(item?.width) || 0,
      height: Number(item?.height) || 0,
    });
  }
  const manifest = {
    version: 1,
    id: record.id || folderName,
    createdAt,
    sourceKey: record.sourceKey || "",
    sourceHash: record.sourceHash || "",
    fileStem: record.fileStem || stem,
    modelName: record.modelName || "",
    promptText: record.promptText || "",
    groupMode: record.groupMode || DEFAULT_SPLIT_GROUP_MODE,
    splitSource: record.splitSource || "original",
    renderMode: record.renderMode || DEFAULT_SPLIT_RENDER_MODE,
    shapeMode: record.shapeMode || DEFAULT_SPLIT_SHAPE_MODE,
    backgroundColor: record.backgroundColor || DEFAULT_SPLIT_BG_COLOR,
    enhanced: record.enhanced !== false,
    timing: record.timing || {},
    upscaleError: typeof record.upscaleError === "string" ? record.upscaleError : "",
    upscaleErrorAt: Number(record.upscaleErrorAt) || 0,
    source: {
      width: Number(record.width) || 0,
      height: Number(record.height) || 0,
      file: sourceFile,
    },
    processFile,
    clusterProcessFile,
    absorbedProcessFile,
    itemCount: manifestItems.length,
    items: manifestItems,
    splitItems,
    clusterItems,
    upscaledItems,
  };
  await writeTextFile(splitDir, "manifest.json", JSON.stringify(manifest, null, 2));
  return {
    ...record,
    ...manifest,
    folderName,
    folderSyncedAt: Date.now(),
    originalImage: record.originalImage || record.sourceImage || "",
    processImage: record.processImage || "",
    clusterProcessImage: record.clusterProcessImage || "",
    absorbedProcessImage: record.absorbedProcessImage || "",
    items: manifestItems.map((item, index) => ({
      ...item,
      image: sourceItems[index]?.image || "",
    })),
    splitItems: splitItems.map((item, index) => ({
      ...item,
      image: sourceSplitItems[index]?.image || sourceSplitItems[index]?.edgeImage || "",
    })),
    clusterItems: clusterItems.map((item, index) => ({
      ...item,
      image: sourceClusterItems[index]?.image || "",
    })),
    upscaledItems: upscaledItems.map((item, index) => ({
      ...item,
      beforeImage: sourceUpscaledItems[index]?.beforeImage || sourceUpscaledItems[index]?.before || "",
      afterImage: sourceUpscaledItems[index]?.afterImage || sourceUpscaledItems[index]?.after || "",
    })),
    upscaleError: typeof record.upscaleError === "string" ? record.upscaleError : "",
    upscaleErrorAt: Number(record.upscaleErrorAt) || 0,
  };
}

export async function fileToDataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function loadSplitHistoryFromLocalFolder(rootHandle) {
  const records = [];
  let splitRoot = null;
  try {
    splitRoot = await rootHandle.getDirectoryHandle(SPLIT_HISTORY_FOLDER_NAME);
  } catch {
    return [];
  }
  for await (const [entryName, entryHandle] of splitRoot.entries()) {
    if (entryHandle.kind !== "directory") continue;
    try {
      const manifestHandle = await entryHandle.getFileHandle("manifest.json");
      const manifestFile = await manifestHandle.getFile();
      const meta = JSON.parse(await manifestFile.text());
      const items = await readSplitHistoryItemGroup(entryHandle, meta.items);
      const splitItems = await readSplitHistoryItemGroup(entryHandle, meta.splitItems || meta.items);
      const clusterItems = await readSplitHistoryItemGroup(entryHandle, meta.clusterItems || meta.items);
      const upscaledItems = [];
      const metaUpscaledItems = Array.isArray(meta.upscaledItems) ? meta.upscaledItems : [];
      for (const item of metaUpscaledItems) {
        const beforeImage = await readSplitHistoryImageFile(entryHandle, item.beforeFile);
        const afterImage = await readSplitHistoryImageFile(entryHandle, item.afterFile);
        if (!beforeImage && !afterImage) continue;
        upscaledItems.push({
          ...item,
          beforeImage,
          afterImage,
        });
      }
      const originalImage = await readSplitHistoryImageFile(entryHandle, meta?.source?.file);
      const processImage = await readSplitHistoryImageFile(entryHandle, meta.processFile);
      const clusterProcessImage = await readSplitHistoryImageFile(entryHandle, meta.clusterProcessFile);
      const absorbedProcessImage = await readSplitHistoryImageFile(entryHandle, meta.absorbedProcessFile);
      records.push({
        id: meta.id || entryName,
        folderName: entryName,
        createdAt: Number(meta.createdAt) || 0,
        sourceKey: meta.sourceKey || "",
        sourceHash: meta.sourceHash || "",
        fileStem: meta.fileStem || entryName,
        modelName: meta.modelName || "",
        promptText: meta.promptText || "",
        groupMode: normalizeSplitGroupMode(meta.groupMode),
        splitSource: meta.splitSource || "original",
        renderMode: normalizeSplitRenderMode(meta.renderMode),
        shapeMode: normalizeSplitShapeMode(meta.shapeMode),
        backgroundColor: meta.backgroundColor || DEFAULT_SPLIT_BG_COLOR,
        enhanced: meta.enhanced !== false,
        timing: meta.timing || {},
        width: Number(meta?.source?.width) || 0,
        height: Number(meta?.source?.height) || 0,
        originalImage,
        processImage,
        clusterProcessImage,
        absorbedProcessImage,
        itemCount: Number(meta.itemCount) || items.length,
        items,
        splitItems,
        clusterItems,
        upscaledItems,
        upscaleError: typeof meta.upscaleError === "string" ? meta.upscaleError : "",
        upscaleErrorAt: Number(meta.upscaleErrorAt) || 0,
        folderSyncedAt: Date.now(),
      });
    } catch {
      // Ignore malformed split history entries.
    }
  }
  return records.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

async function prepareWan21BaseImage(sourceDataUrl) {
  const image = await loadImageElement(sourceDataUrl);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const minSide = Math.min(sourceWidth, sourceHeight);
  const maxSide = Math.max(sourceWidth, sourceHeight);
  let scale = minSide < 512 ? 512 / minSide : 1;
  if (maxSide * scale > 4096) scale = 4096 / maxSide;
  const drawWidth = Math.max(1, Math.min(4096, Math.round(sourceWidth * scale)));
  const drawHeight = Math.max(1, Math.min(4096, Math.round(sourceHeight * scale)));
  const targetWidth = Math.max(512, drawWidth);
  const targetHeight = Math.max(512, drawHeight);
  if (targetWidth === sourceWidth && targetHeight === sourceHeight && drawWidth === sourceWidth && drawHeight === sourceHeight) {
    return {
      dataUrl: sourceDataUrl,
      width: sourceWidth,
      height: sourceHeight,
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      dataUrl: sourceDataUrl,
      width: sourceWidth,
      height: sourceHeight,
    };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, Math.floor((targetWidth - drawWidth) / 2), Math.floor((targetHeight - drawHeight) / 2), drawWidth, drawHeight);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: targetWidth,
    height: targetHeight,
  };
}

export async function callWan21ImageSuperResolution(proxyUrl, imageDataUrl, options = {}) {
  const { signal } = options;
  const apiPlatform = "bailian";
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const prepared = await prepareWan21BaseImage(imageDataUrl);
  const longSide = Math.max(prepared.width, prepared.height);
  const upscaleFactor = Math.max(1, Math.min(4, Number(options.upscaleFactor) || Math.ceil(1024 / Math.max(1, longSide))));
  const body = {
    model: "wanx2.1-imageedit",
    input: {
      function: "super_resolution",
      prompt: "图像超分。",
      base_image_url: prepared.dataUrl,
    },
    parameters: {
      upscale_factor: upscaleFactor,
      n: 1,
      watermark: false,
    },
  };
  const submitData = await postJsonWithRetry(proxyUrl, "/api/v1/services/aigc/image2image/image-synthesis", body, {
    signal,
    maxAttempts: 2,
    baseDelayMs: 1200,
    apiBaseUrl,
    apiKey,
    apiPlatform,
    extraHeaders: { "X-DashScope-Async": "enable" },
  });
  const taskId = submitData?.output?.task_id;
  if (!taskId) {
    const message = submitData?.message || submitData?.output?.message || "百炼超分任务创建失败";
    throw new Error(message);
  }
  let lastData = null;
  for (let attempt = 0; attempt < 28; attempt += 1) {
    await sleep(attempt < 2 ? 1200 : 1800, signal);
    const resp = await fetch(proxyUrl, {
      method: "GET",
      headers: buildProxyHeaders(`/api/v1/tasks/${encodeURIComponent(taskId)}`, apiBaseUrl, apiKey, {}, apiPlatform),
      signal,
    });
    lastData = await readProxyResponse(resp);
    if (!resp.ok) {
      throw new Error(`API ${resp.status}: ${JSON.stringify(lastData).slice(0, 300)}`);
    }
    const status = String(lastData?.output?.task_status || "").toUpperCase();
    if (status === "SUCCEEDED") {
      const images = [];
      const results = Array.isArray(lastData?.output?.results) ? lastData.output.results : [];
      results.forEach((item) => {
        const normalized = normalizeImageValue(item?.url || item?.image || item?.image_url || "", apiBaseUrl);
        if (normalized) images.push(normalized);
      });
      if (!images.length) extractImageCandidates(lastData, images, apiBaseUrl);
      const first = images[0] ? await proxyFetchImageAsDataUrl(proxyUrl, images[0]) : "";
      const normalized = normalizeImageValue(first, apiBaseUrl) || normalizeImageValue(images[0], apiBaseUrl);
      if (!normalized) throw new Error("百炼超分未返回可用图片");
      return buildWorkerImageProxyUrl(proxyUrl, normalized) || normalized;
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      const code = lastData?.output?.code || "";
      const message = lastData?.output?.message || `百炼超分任务失败: ${status}`;
      throw new Error(code ? `${code}: ${message}` : message);
    }
  }
  throw new Error(`百炼超分任务未完成: ${lastData?.output?.task_status || "timeout"}`);
}

export async function loadTurnsFromLocalFolder(rootHandle) {
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
        apiKeys: normalizeApiKeys(
          meta.apiKeys && typeof meta.apiKeys === "object"
            ? meta.apiKeys
            : {
                [normalizeApiPlatform(meta.apiPlatform)]: normalizeApiKey(meta.apiKey),
              }
        ),
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

export async function loadTemplatesFromLocalFolder(rootHandle) {
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

export async function saveTemplatesToLocalFolder(rootHandle, templates, activeTemplateId) {
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

export async function loadStyleTemplatesFromLocalFolder(rootHandle) {
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

export async function saveStyleTemplatesToLocalFolder(rootHandle, templates, activeTemplateId) {
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

export async function loadGptAssistFromLocalFolder(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(GPT_ASSIST_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = JSON.parse(await file.text());
    return {
      prompt: normalizeGptAssistPrompt(raw?.prompt),
      styleThemePrompt: normalizeStyleThemeAssistPrompt(raw?.styleThemePrompt),
      sendPromptText: normalizeGptAssistFlag(raw?.sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT),
      sendPromptImage: normalizeGptAssistFlag(raw?.sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE),
    };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") {
      return {
        prompt: DEFAULT_GPT_ASSIST_PROMPT,
        styleThemePrompt: DEFAULT_STYLE_THEME_ASSIST_PROMPT,
        sendPromptText: DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT,
        sendPromptImage: DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE,
      };
    }
    return {
      prompt: DEFAULT_GPT_ASSIST_PROMPT,
      styleThemePrompt: DEFAULT_STYLE_THEME_ASSIST_PROMPT,
      sendPromptText: DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT,
      sendPromptImage: DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE,
    };
  }
}

export async function saveGptAssistToLocalFolder(rootHandle, prompt, styleThemePrompt, sendPromptText, sendPromptImage) {
  const normalizedPrompt = normalizeGptAssistPrompt(prompt);
  const normalizedStyleThemePrompt = normalizeStyleThemeAssistPrompt(styleThemePrompt);
  await writeTextFile(
    rootHandle,
    GPT_ASSIST_FILE_NAME,
    JSON.stringify(
      {
        prompt: normalizedPrompt,
        styleThemePrompt: normalizedStyleThemePrompt,
        sendPromptText: normalizeGptAssistFlag(sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT),
        sendPromptImage: normalizeGptAssistFlag(sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE),
      },
      null,
      2
    )
  );
}

export async function loadApiConfigFromLocalFolder(rootHandle) {
  async function recoverApiKeysFromTurns() {
    let bestSeq = -1;
    let bestCreatedAt = -1;
    let recovered = normalizeApiKeys(DEFAULT_API_KEYS);
    let found = false;

    for await (const [entryName, entryHandle] of rootHandle.entries()) {
      if (entryHandle.kind !== "directory" || !entryName.startsWith("turn-")) continue;
      try {
        const promptHandle = await entryHandle.getFileHandle("prompt.json");
        const promptFile = await promptHandle.getFile();
        const raw = JSON.parse(await promptFile.text());
        const candidateKeys = normalizeApiKeys(
          raw?.apiKeys && typeof raw.apiKeys === "object"
            ? raw.apiKeys
            : {
                [normalizeApiPlatform(raw?.apiPlatform)]: raw?.apiKey,
              }
        );
        if (!candidateKeys.comet && !candidateKeys.bailian && !candidateKeys.lumina) continue;
        const seq = Number(raw?.seq) || 0;
        const createdAt = Number(raw?.createdAt) || 0;
        const isNewer = seq > bestSeq || (seq === bestSeq && createdAt >= bestCreatedAt);
        if (!isNewer) continue;
        bestSeq = seq;
        bestCreatedAt = createdAt;
        recovered = candidateKeys;
        found = true;
      } catch {}
    }

    return {
      ...recovered,
      exists: found,
    };
  }

  try {
    const fileHandle = await rootHandle.getFileHandle(API_CONFIG_FILE_NAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const raw = JSON.parse(text);
    const rawObject = raw && typeof raw === "object" ? raw : {};
    const rawString = typeof raw === "string" ? raw : "";
    const legacyPlatform = normalizeApiPlatform(raw?.apiPlatform);
    const legacyKey = normalizeApiKey(raw?.apiKey);
    const normalizedKeys = normalizeApiKeys({
      comet:
        rawObject?.cometKey ||
        rawObject?.cometapiKey ||
        rawObject?.apiKeys?.comet ||
        rawObject?.apiKeys?.cometKey ||
        (legacyPlatform === "comet" ? legacyKey : ""),
      bailian:
        rawObject?.bailianKey ||
        rawObject?.dashscopeKey ||
        rawObject?.apiKeys?.bailian ||
        rawObject?.apiKeys?.dashscopeKey ||
        (legacyPlatform === "bailian" ? legacyKey : ""),
      lumina:
        rawObject?.luminaKey ||
        rawObject?.apiKeys?.lumina ||
        rawObject?.apiKeys?.luminaKey ||
        (legacyPlatform === "lumina" ? legacyKey : ""),
    });
    if (!normalizedKeys.comet && !normalizedKeys.bailian && !normalizedKeys.lumina) {
      return recoverApiKeysFromTurns();
    }
    return {
      ...normalizedKeys,
      exists: true,
    };
  } catch (err) {
    if (String(err?.name || "") === "NotFoundError") {
      return recoverApiKeysFromTurns();
    }
    const recovered = await recoverApiKeysFromTurns();
    if (recovered.exists) return recovered;
    return {
      ...DEFAULT_API_KEYS,
      exists: false,
    };
  }
}

export async function saveApiConfigToLocalFolder(rootHandle, apiKeys) {
  const normalizedKeys = normalizeApiKeys(apiKeys);
  await writeTextFile(
    rootHandle,
    API_CONFIG_FILE_NAME,
    JSON.stringify(
      {
        cometKey: normalizedKeys.comet,
        bailianKey: normalizedKeys.bailian,
        luminaKey: normalizedKeys.lumina,
        apiKeys: {
          comet: normalizedKeys.comet,
          bailian: normalizedKeys.bailian,
          lumina: normalizedKeys.lumina,
        },
        // Keep legacy single-key fields so old folders remain readable by older builds.
        apiKey: normalizedKeys.comet || normalizedKeys.lumina,
        apiPlatform: normalizedKeys.comet
          ? "comet"
          : normalizedKeys.bailian
          ? "bailian"
          : normalizedKeys.lumina
          ? "lumina"
          : "comet",
      },
      null,
      2
    )
  );
}

export async function downloadAllAsZip(turns) {
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
          apiKeys: normalizeApiKeys(turn.apiKeys),
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

// ─── Image API Call Functions ───

export async function callTextAssistAPI(proxyUrl, sourcePrompt, imageBase64, assistPrompt, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const sendPromptText = normalizeGptAssistFlag(options.sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
  const sendPromptImage = normalizeGptAssistFlag(options.sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  const normalizedAssistPrompt = normalizeGptAssistPrompt(assistPrompt);
  const targetPath = resolveTextAssistTargetPath(apiPlatform);
  const placeholders = extractPlaceholderTokens(sourcePrompt);
  if (!placeholders.length) return sourcePrompt;

  const textInstructionLines = [
    "以下 GPT 改写指令必须严格执行：",
    normalizedAssistPrompt,
    "",
    "只改写 {{ }} 内的内容，不改动大括号外内容。",
    "输出严格 JSON：{\"replacements\":[\"...\", \"...\"]}。",
    "replacements 数组长度必须与占位符数量一致。",
    "改写要保留用户原有语气和随机感，不要模板化。",
    "",
    `占位符数量: ${placeholders.length}`,
  ];
  if (sendPromptText) {
    textInstructionLines.push(`原始 prompt: ${sourcePrompt}`);
    textInstructionLines.push(`占位符原文: ${JSON.stringify(placeholders)}`);
  } else {
    textInstructionLines.push("本次未发送 prompt 文本，请只根据系统提示和已发送的上下文生成替换内容。");
  }
  const textInstruction = textInstructionLines.join("\n");

  const userContent = [{ type: "text", text: textInstruction }];
  if (sendPromptImage && imageBase64) {
    userContent.push({ type: "image_url", image_url: { url: imageBase64 } });
  }

  const body = {
    model: resolveTextAssistModelId(apiPlatform),
    stream: false,
    temperature: 1.15,
    messages: [
      { role: "system", content: normalizedAssistPrompt },
      { role: "user", content: userContent },
    ],
  };

  const data = await postJsonWithRetry(proxyUrl, targetPath, body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
    apiPlatform,
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

export async function callThemeAssistAPI(proxyUrl, seedText, assistPrompt, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const targetPath = resolveTextAssistTargetPath(apiPlatform);
  const normalizedSeed = typeof seedText === "string" ? seedText.trim() : "";
  if (!normalizedSeed) return [];

  const contentLines = [
    // Theme assist depends on the seed input itself; do not gate it behind the general prompt-text toggle.
    `主题词：${normalizedSeed}`,
  ];
  contentLines.push(`请输出 ${STYLE_THEME_SLOTS} 个与主题相关、可用于生图的视觉元素。`);
  contentLines.push("请严格输出 JSON。");

  const body = {
    model: resolveTextAssistModelId(apiPlatform),
    stream: false,
    temperature: 1.1,
    messages: [
      { role: "system", content: normalizeStyleThemeAssistPrompt(assistPrompt) },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: contentLines.join("\n"),
          },
        ],
      },
    ],
  };

  const data = await postJsonWithRetry(proxyUrl, targetPath, body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  const rawText = assistantMessageToText(data?.choices?.[0]?.message?.content);
  return parseThemeSuggestions(rawText);
}

export async function callTextAssistWithFallback(proxyUrl, sourcePrompt, imageBase64, assistPrompt, options = {}) {
  const apiKeys = normalizeApiKeys(options.apiKeys);
  const platformOrder = getAssistPlatformOrder(apiKeys);
  let lastError = null;
  for (const platform of platformOrder) {
    try {
      return await callTextAssistAPI(proxyUrl, sourcePrompt, imageBase64, assistPrompt, {
        ...options,
        ...getApiConfigForPlatform(platform, apiKeys),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Text assist request failed");
}

export async function callThemeAssistWithFallback(proxyUrl, seedText, assistPrompt, options = {}) {
  const apiKeys = normalizeApiKeys(options.apiKeys);
  const platformOrder = getAssistPlatformOrder(apiKeys);
  let lastError = null;
  for (const platform of platformOrder) {
    try {
      return await callThemeAssistAPI(proxyUrl, seedText, assistPrompt, {
        ...options,
        ...getApiConfigForPlatform(platform, apiKeys),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Theme assist request failed");
}

// 1. OpenAI Chat Completions format (gpt-4o-image, gpt-5-image)
export async function callChatAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const targetPath = resolveTextAssistTargetPath(apiPlatform);
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

  const data = await postJsonWithRetry(proxyUrl, targetPath, body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 900,
    apiBaseUrl,
    apiKey,
    apiPlatform,
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

export function collectImagesApiResponseImages(data, apiBaseUrl) {
  const images = [];
  if (Array.isArray(data?.data)) {
    data.data.forEach((item) => {
      const normalized =
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.b64_json, apiBaseUrl) ||
        normalizeImageValue(item?.image_base64, apiBaseUrl) ||
        normalizeImageValue(item?.base64, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length) {
    const normalized = normalizeImageValue(data?.image_base64, apiBaseUrl) || normalizeImageValue(data?.url, apiBaseUrl);
    if (normalized) images.push(normalized);
  }
  if (!images.length && Array.isArray(data?.images)) {
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
  if (!images.length && Array.isArray(data?.result)) {
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
  return Array.from(new Set(images.map((value) => normalizeImageValue(value, apiBaseUrl)).filter(Boolean)));
}

export async function finalizeImagesApiResponse(proxyUrl, data, apiBaseUrl) {
  const deduped = collectImagesApiResponseImages(data, apiBaseUrl);
  const resolved = await Promise.all(deduped.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
  return resolved
    .map((v) => normalizeImageValue(v, apiBaseUrl))
    .filter(Boolean)
    .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
}

export async function resolveEditImageDataUrls(proxyUrl, imageInputs, apiBaseUrl) {
  const resolved = await Promise.all(
    (Array.isArray(imageInputs) ? imageInputs : []).map(async (image) => {
      const normalized = normalizeImageValue(image, apiBaseUrl);
      if (!normalized) return null;
      if (normalized.startsWith("data:image/")) return normalized;
      if (!/^https?:\/\//i.test(normalized)) return null;
      const proxied = await proxyFetchImageAsDataUrl(proxyUrl, normalized);
      const dataUrl = normalizeImageValue(proxied, apiBaseUrl);
      return typeof dataUrl === "string" && dataUrl.startsWith("data:image/") ? dataUrl : null;
    })
  );
  return Array.from(new Set(resolved.filter(Boolean)));
}

export function appendImageToFormData(formData, fieldName, dataUrl, index = 0) {
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed) return false;
  const blob = new Blob([parsed.bytes], { type: parsed.mime || "image/png" });
  formData.append(fieldName, blob, `${fieldName}-${index + 1}.${parsed.ext || "png"}`);
  return true;
}

export async function callOpenAiImageEditAPI(proxyUrl, model, prompt, imageInputs, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const editableImages = await resolveEditImageDataUrls(proxyUrl, imageInputs, apiBaseUrl);
  if (!editableImages.length) {
    throw new Error("图像编辑需要至少 1 张可用输入图");
  }

  const formData = new FormData();
  editableImages.forEach((image, index) => {
    appendImageToFormData(formData, "image", image, index);
  });
  formData.append("model", model.id);
  formData.append("prompt", prompt || "Generate a creative image");
  formData.append("n", String(Math.max(1, Number(count) || 1)));
  if (apiPlatform === "lumina") {
    // Lumina 使用 ratio（如 "1:1"）而非 size；auto 时不传。
    const ratio = mapAspectRatioToLuminaRatio(options.aspectRatio);
    if (ratio !== "auto") formData.append("ratio", ratio);
  } else {
    formData.append("size", mapAspectRatioToOpenAiImageSize(options.aspectRatio));
  }

  const data = await postFormDataWithRetry(proxyUrl, "/v1/images/edits", formData, {
    signal,
    maxAttempts: 4,
    baseDelayMs: 1200,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  return finalizeImagesApiResponse(proxyUrl, data, apiBaseUrl);
}

// 2. OpenAI-compatible Images format (all Lumina models; Comet GPT/Seedream)
export async function callImagesAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const primaryImage = imageInputs[0] || "";
  const isSeedream = model.provider === "ByteDance";
  const isOpenAiImageModel = model.provider === "OpenAI" && /^gpt-image-/i.test(String(model?.id || ""));
  if ((apiPlatform === "lumina" || supportsOpenAiImageEdits(model)) && imageInputs.length) {
    return callOpenAiImageEditAPI(proxyUrl, model, prompt, imageInputs, options);
  }
  const isLumina = apiPlatform === "lumina";
  const body = {
    model: model.id,
    prompt: prompt || "Generate a creative image",
    n: Math.max(1, Number(count) || 1),
  };
  if (isLumina) {
    // Lumina（OpenAI 兼容网关）使用 ratio 而非 size；auto 时不传，让上游按输入图自适应。
    const ratio = mapAspectRatioToLuminaRatio(options.aspectRatio);
    if (ratio !== "auto") body.ratio = ratio;
  } else {
    body.size = isSeedream ? "2K" : mapAspectRatioToOpenAiImageSize(options.aspectRatio);
  }
  if (isSeedream && !isLumina) {
    // Use URL response to avoid oversized base64 payload causing network failures.
    body.response_format = "url";
    body.watermark = true;
    body.guidance_scale = 3;
  }
  if (primaryImage && (isSeedream || isOpenAiImageModel)) {
    // For gpt-image-1.5 / gpt-image-2 we keep image-conditioned generation on JSON path
    // to avoid multipart parsing issues on some compatible channels.
    body.image = primaryImage;
  }

  const data = await postJsonWithRetry(proxyUrl, "/v1/images/generations", body, {
    signal,
    maxAttempts: 4,
    baseDelayMs: 1200,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });
  return finalizeImagesApiResponse(proxyUrl, data, apiBaseUrl);
}

export async function callBailianImageAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
  const apiKey = normalizeApiKey(options.apiKey);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const isQwenModel = isQwenImageModel(model);
  const isQwen3Model = isQwenImage3Model(model);
  const promptExtend = options.promptExtend !== false;
  const promptExtendMode = normalizeQwenPromptExtendMode(options.promptExtendMode);
  const effectiveImageInputs = imageInputs
    .slice(0, getBailianImageInputLimit(model))
    .map((image) => normalizeImageValue(image, apiBaseUrl))
    .filter(Boolean);
  const content = [];

  const textPrompt = typeof prompt === "string" && prompt.trim() ? prompt.trim() : "Generate a creative image";
  effectiveImageInputs.forEach((image) => {
    content.push({
      image,
    });
  });
  content.push({ text: textPrompt });
  const imageSize = getBailianImageSize(model, options.aspectRatio, effectiveImageInputs.length > 0);

  const body = {
    model: model.id,
    input: {
      messages: [
        {
          role: "user",
          content,
        },
      ],
    },
    parameters: {
      ...(!isQwen3Model ? { n: Math.min(Math.max(1, Number(count) || 1), isQwenModel ? 6 : 4) } : {}),
      ...(imageSize ? { size: imageSize } : {}),
      watermark: false,
      ...(isQwenModel ? { prompt_extend: promptExtend } : {}),
      ...(isQwen3Model && promptExtend ? { prompt_extend_mode: promptExtendMode } : {}),
      ...(!isQwenModel && !effectiveImageInputs.length && model?.id === "wan2.7-image-pro" ? { thinking_mode: true } : {}),
    },
  };

  const data = await postJsonWithRetry(proxyUrl, "/api/v1/services/aigc/multimodal-generation/generation", body, {
    signal,
    maxAttempts: 3,
    baseDelayMs: 1200,
    apiBaseUrl,
    apiKey,
    apiPlatform,
  });

  const topLevelCode = typeof data?.code === "string" ? data.code.trim() : "";
  const topLevelMessage = typeof data?.message === "string" ? data.message.trim() : "";
  if (topLevelMessage) {
    throw new Error(topLevelCode ? `${topLevelCode}: ${topLevelMessage}` : topLevelMessage);
  }

  const taskStatus = String(data?.output?.task_status || "").toUpperCase();
  const taskCode = typeof data?.output?.code === "string" ? data.output.code.trim() : "";
  const taskMessage = typeof data?.output?.message === "string" ? data.output.message.trim() : "";
  if (taskStatus === "FAILED" || taskStatus === "CANCELED") {
    const resolvedMessage = taskMessage || topLevelMessage || "百炼任务失败";
    const resolvedCode = taskCode || topLevelCode;
    throw new Error(resolvedCode ? `${resolvedCode}: ${resolvedMessage}` : resolvedMessage);
  }

  const images = [];
  if (Array.isArray(data?.output?.choices)) {
    data.output.choices.forEach((choice) => {
      const blocks = Array.isArray(choice?.message?.content) ? choice.message.content : [];
      blocks.forEach((item) => {
        const normalized =
          normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
          normalizeImageValue(item?.image, apiBaseUrl) ||
          normalizeImageValue(item?.url, apiBaseUrl) ||
          normalizeImageValue(item?.image_url, apiBaseUrl);
        if (normalized) images.push(normalized);
      });
    });
  }
  if (Array.isArray(data?.output?.images)) {
    data.output.images.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.image, apiBaseUrl) ||
        normalizeImageValue(item?.image_url, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length && Array.isArray(data?.output?.results)) {
    data.output.results.forEach((item) => {
      const normalized =
        normalizeImageValue(typeof item === "string" ? item : null, apiBaseUrl) ||
        normalizeImageValue(item?.url, apiBaseUrl) ||
        normalizeImageValue(item?.image, apiBaseUrl) ||
        normalizeImageValue(item?.image_url, apiBaseUrl);
      if (normalized) images.push(normalized);
    });
  }
  if (!images.length) {
    extractImageCandidates(data, images, apiBaseUrl);
  }

  const deduped = Array.from(new Set(images.map((value) => normalizeImageValue(value, apiBaseUrl)).filter(Boolean)));
  if (!deduped.length) {
    if (data?.output?.task_id && taskStatus && taskStatus !== "SUCCEEDED") {
      throw new Error(`百炼任务未完成: ${taskStatus}`);
    }
    throw new Error("百炼未返回可用图片");
  }

  const resolved = await Promise.all(deduped.map((u) => proxyFetchImageAsDataUrl(proxyUrl, u)));
  return resolved
    .map((v) => normalizeImageValue(v, apiBaseUrl))
    .filter(Boolean)
    .map((v) => buildWorkerImageProxyUrl(proxyUrl, v) || v);
}

// 3. Gemini generateContent format
export async function callGeminiAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
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
        headers: buildProxyHeaders(`/v1beta/models/${currentModelId}:generateContent`, apiBaseUrl, apiKey, { "Content-Type": "application/json" }, apiPlatform),
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
export async function callMidjourneyAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
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
      }, apiPlatform),
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
        headers: buildProxyHeaders(`/mj/task/${taskId}/fetch`, apiBaseUrl, apiKey, {}, apiPlatform),
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
export async function callReplicateNanoBananaAPI(proxyUrl, model, prompt, imageBase64, options = {}) {
  const { signal, count = 1 } = options;
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const apiBaseUrl = resolveApiBaseUrl(options.apiBaseUrl, apiPlatform);
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
    }, apiPlatform),
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
      headers: buildProxyHeaders(`/replicate/v1/predictions/${predictionId}`, apiBaseUrl, apiKey, {}, apiPlatform),
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

export async function generateImage(proxyUrl, model, prompt, imageBase64, options = {}) {
  const requested = Math.max(1, Number(options.count) || 1);
  const aspectRatio = normalizeAspectRatio(options.aspectRatio);
  const imageInputs = normalizeImageInputs(imageBase64, options.imageInputs);
  const apiPlatform = normalizeApiPlatform(options.apiPlatform);
  const primaryImage = imageInputs[0] || "";
  const expandedPrompt = expandPlaceholderValues(prompt || "");
  if (!isModelAvailableOnPlatform(model, apiPlatform)) {
    const platformLabel = apiPlatform === "bailian" ? "百炼" : apiPlatform === "lumina" ? "Lumina" : "Comet";
    throw new Error(`${model?.name || model?.id || "当前模型"} 当前不支持 ${platformLabel} 平台`);
  }
  const promptWithAspectRatio =
    // Lumina, Gemini and Bailian carry aspect ratio structurally.
    model.apiType === "gemini" || model.apiType === "bailian" || apiPlatform === "lumina"
      ? expandedPrompt.trim()
      : mergePromptWithAspectRatio(expandedPrompt, aspectRatio, model);
  const nextOptions = { ...options, apiPlatform, aspectRatio, imageInputs };
  if (apiPlatform === "lumina") {
    return callImagesAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, {
      ...nextOptions,
      count: requested,
    });
  }
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
    case "bailian": {
      if (isQwenImage3Model(model) && requested > 1) {
        const all = [];
        for (let index = 0; index < requested; index += 1) {
          const one = await callBailianImageAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: 1 });
          if (Array.isArray(one) && one.length) all.push(one[0]);
        }
        return all;
      }
      return callBailianImageAPI(proxyUrl, model, promptWithAspectRatio, primaryImage, { ...nextOptions, count: requested });
    }
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
