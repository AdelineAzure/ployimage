import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import * as AppConfig from "./config/appConfig";
import { CF_WORKER_CODE } from "./config/cloudflareWorkerCode";
import * as AppI18n from "./i18n";
import { useUndoRedoText } from "./hooks/useUndoRedoText";
import { getRuntimeConfig, setRuntimeConfig } from "./services/runtimeConfig";
import * as AppCore from "./services/appCore";
import { mono, S } from "./styles/appStyles";
import { AtlasThumbnailModal } from "./features/atlas/AtlasThumbnailModal";
import { CanvasPage } from "./features/canvas/CanvasPage";
import { HelpPage } from "./features/help/HelpPage";
import { ImagePreviewModal, TurnPanel, buildTurnPreviewItems, normalizePreviewPayload } from "./features/history/components";
import { ApiKeyModal, GptAssistModal, InputImagesModal, PromptImageEditorModal, SelectionLimitModal, SettingsModal, StyleTemplateEditorModal, TemplateEditorModal } from "./features/settings/components";
import { SpriteSplitModal } from "./features/split/SpriteSplitModal";
import { useTaskQueue } from "./features/tasks/useTaskQueue";
import { ModelChip } from "./features/workspace/ModelChip";
import { PromptTextWithChips, TokenPromptInput } from "./features/workspace/promptControls";

const {
  IMAGE_MODELS,
  IMAGE_MODEL_ROWS,
  PROVIDER_COLORS,
  LOCAL_STATE_KEY,
  DEFAULT_PROXY_URL,
  DEFAULT_SELECTED_MODELS,
  DEFAULT_MODEL_COUNTS,
  COUNT_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  DEFAULT_TASK_MODE,
  DEFAULT_COMPARE_PROMPTS,
  MAX_COMPARE_PROMPTS,
  DEFAULT_LAST_EDITED_COUNT,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_QWEN_PROMPT_EXTEND,
  DEFAULT_QWEN_PROMPT_EXTEND_MODE,
  DEFAULT_API_PLATFORM,
  DEFAULT_API_BASE_URLS,
  DEFAULT_API_BASE_URL,
  DEFAULT_API_KEY,
  DEFAULT_API_KEYS,
  DEFAULT_GPT_ASSIST_MODEL,
  DEFAULT_BAILIAN_ASSIST_MODEL,
  DEFAULT_GPT_ASSIST_PROMPT,
  DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT,
  DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE,
  DEFAULT_STYLE_THEME_ASSIST_PROMPT,
  PROMPT_EDITOR_MIN_HEIGHT,
  MAX_TEMPLATES,
  MAX_STYLE_TEMPLATES,
  STYLE_THEME_SLOTS,
  MAX_STYLE_REFERENCE_IMAGES,
  MAX_ATLAS_SELECTED_IMAGES,
  MAX_INPUT_IMAGES_PER_BATCH,
  INPUT_IMAGE_EDITOR_COLORS,
  MAX_SPLIT_EXPORT_ITEMS,
  MAX_CLUSTERED_SPLIT_ITEMS,
  SPLIT_SHAPE_MODE_ORDER,
  SPLIT_RENDER_MODE_ORDER,
  SPLIT_GROUP_MODE_ORDER,
  DEFAULT_SPLIT_SHAPE_MODE,
  DEFAULT_SPLIT_RENDER_MODE,
  DEFAULT_SPLIT_GROUP_MODE,
  DEFAULT_SPLIT_BG_COLOR,
  TEMPLATE_FILE_NAME,
  STYLE_TEMPLATE_FILE_NAME,
  GPT_ASSIST_FILE_NAME,
  API_CONFIG_FILE_NAME,
  DEFAULT_TEMPLATES,
  DEFAULT_STYLE_TEMPLATES,
  DEFAULT_STYLE_THEMES,
  NANO_PRO_OFFICIAL_MODEL_ID,
  NANO_PRO_LEGACY_MODEL_IDS,
  DEFAULT_UI_LANGUAGE,
} = AppConfig;

const {
  I18nContext,
  UI_TEXT,
  interpolateTemplate,
  translateUiText,
  normalizeUiLanguage,
  useI18n,
  formatUiTime,
  formatUiDateTime,
  getDefaultTemplateTitle,
  getDefaultStyleTemplateTitle,
  getLocalizedTemplateTitle,
  getLocalizedPromptLabel,
  getLocalizedStatusLabel,
  localizeRuntimeMessage,
} = AppI18n;

const {
  fileToBase64,
  stripBase64Prefix,
  getMimeFromDataUrl,
  isAbortError,
  sleep,
  shouldRetryApiFailure,
  normalizeApiBaseUrl,
  normalizeApiPlatform,
  getDefaultApiBaseUrl,
  resolveApiBaseUrl,
  normalizeApiKey,
  normalizeApiKeys,
  mergeApiKeys,
  getApiKeyForPlatform,
  getAssistPlatformOrder,
  resolveTextAssistTargetPath,
  resolveTextAssistModelId,
  isModelAvailableOnPlatform,
  getModelApiPlatform,
  getApiConfigForPlatform,
  getApiConfigForModel,
  normalizeAspectRatio,
  normalizeModelId,
  supportsOpenAiImageEdits,
  isQwenImageModel,
  roundBailianSize,
  getBailianAspectRatioSize,
  getBailianImageInputLimit,
  getBailianImageSize,
  getGeminiModelCandidates,
  mergePromptWithAspectRatio,
  normalizeGptAssistPrompt,
  normalizeGptAssistFlag,
  normalizeStyleThemeAssistPrompt,
  extractPlaceholderTokens,
  applyPlaceholderReplacements,
  clearPlaceholderValues,
  expandPlaceholderValues,
  getFilledPlaceholderTokens,
  splitPromptByPlaceholders,
  assistantMessageToText,
  parseJsonFromText,
  parseThemeSuggestions,
  normalizeImageInputs,
  injectThemeIntoPrompt,
  buildStylePromptVariants,
  formatAtlasFolderName,
  buildAtlasImageFileStem,
  loadImageElement,
  normalizeEditorRect,
  isEditorRectValid,
  getInputImageEditorStrokeWidth,
  drawInputImageEditorShape,
  applyInputImageEditorOperation,
  cropInputImageDataUrl,
  createAtlasThumbnailDataUrl,
  buildProxyHeaders,
  readProxyResponse,
  postJsonWithRetry,
  postFormDataWithRetry,
  downloadDataUrl,
  downloadImageUrl,
  normalizeImageValue,
  extractImageCandidates,
  blobToDataUrl,
  proxyFetchImageAsDataUrl,
  buildWorkerImageProxyUrl,
  getMedianNumber,
  colorDistanceSq,
  rgbToHexColor,
  getPercentileNumber,
  collectBorderPalette,
  getMinPaletteDistanceSq,
  refineForegroundMask,
  mergeNearbyBounds,
  clampByte,
  blurImageData3x3,
  applySharpenToImageData,
  renderDataUrlOnBackground,
  enhanceSplitImageDataUrl,
  buildForegroundMask,
  collectSubjectBounds,
  normalizeSplitShapeMode,
  normalizeSplitRenderMode,
  normalizeSplitGroupMode,
  buildSteppedPolygonMask,
  buildPolygonMaskedImage,
  getSplitShapeDataUrl,
  buildSplitProcessPreview,
  buildSplitProcessPreviewForShape,
  getSplitItemBaseSize,
  getSplitItemSourceByShape,
  composeMergedSplitField,
  buildClusteredSplitItems,
  buildClusterProcessPreview,
  splitImageBySubjects,
  resolveSplitSourceDataUrl,
  buildSplitItemDisplayList,
  buildRemovedDisplayImage,
  normalizePromptVariant,
  getComposerPromptVariants,
  getTurnPromptVariants,
  getTurnMode,
  getResultPromptKey,
  buildTurnImageKey,
  buildTurnTaskKey,
  toPersistableTurns,
  toLightweightTurns,
  safeName,
  buildResultFileStem,
  isSameResultTask,
  normalizeTemplate,
  normalizeTemplates,
  normalizeStyleTemplate,
  normalizeStyleTemplates,
  pickStyleTemplateId,
  normalizeStyleThemes,
  pickTemplateId,
  getTurnDirName,
  dataUrlToBytes,
  extFromUrl,
  fetchImageBytes,
  supportsFileSystemAccess,
  ensureDirectoryPermission,
  writeTextFile,
  writeBinaryFile,
  saveTurnToLocalFolder,
  saveSplitHistoryToLocalFolder,
  fileToDataUrlFromFile,
  loadSplitHistoryFromLocalFolder,
  callWan21ImageSuperResolution,
  loadTurnsFromLocalFolder,
  loadTemplatesFromLocalFolder,
  saveTemplatesToLocalFolder,
  loadStyleTemplatesFromLocalFolder,
  saveStyleTemplatesToLocalFolder,
  loadGptAssistFromLocalFolder,
  saveGptAssistToLocalFolder,
  loadApiConfigFromLocalFolder,
  saveApiConfigToLocalFolder,
  downloadAllAsZip,
  callTextAssistAPI,
  callThemeAssistAPI,
  callTextAssistWithFallback,
  callThemeAssistWithFallback,
  callChatAPI,
  collectImagesApiResponseImages,
  finalizeImagesApiResponse,
  resolveEditImageDataUrls,
  appendImageToFormData,
  callOpenAiImageEditAPI,
  callImagesAPI,
  callBailianImageAPI,
  callGeminiAPI,
  callMidjourneyAPI,
  callReplicateNanoBananaAPI,
  generateImage,
} = AppCore;

function hashSplitHistorySource(value = "") {
  const text = typeof value === "string" ? value : "";
  if (!text) return "";
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getSplitHistorySourceHash(record = {}) {
  return record.sourceHash || hashSplitHistorySource(record.originalImage || record.sourceImage || "");
}

function getSplitHistoryMergeKey(record = {}) {
  const sourceHash = getSplitHistorySourceHash(record);
  if (sourceHash) return `hash:${sourceHash}`;
  const sourceKey = typeof record.sourceKey === "string" ? record.sourceKey.trim() : "";
  if (sourceKey) return `key:${sourceKey}`;
  const stem = typeof record.fileStem === "string" ? record.fileStem.trim() : "";
  const width = Number(record.width) || 0;
  const height = Number(record.height) || 0;
  return stem && width && height ? `meta:${stem}:${width}x${height}` : "";
}

function mergeSplitHistoryRecords(existing = {}, incoming = {}) {
  const incomingMode = normalizeSplitGroupMode(incoming.groupMode);
  const existingSplitItems = Array.isArray(existing.splitItems) ? existing.splitItems : [];
  const existingClusterItems = Array.isArray(existing.clusterItems) ? existing.clusterItems : [];
  const incomingItems = Array.isArray(incoming.items) ? incoming.items : [];
  const incomingSplitItems = Array.isArray(incoming.splitItems) && incoming.splitItems.length
    ? incoming.splitItems
    : incomingMode === "standard"
      ? incomingItems
      : [];
  const incomingClusterItems = Array.isArray(incoming.clusterItems) && incoming.clusterItems.length
    ? incoming.clusterItems
    : incomingMode === "cluster"
      ? incomingItems
      : [];
  const splitItems = incomingSplitItems.length ? incomingSplitItems : existingSplitItems;
  const clusterItems = incomingClusterItems.length ? incomingClusterItems : existingClusterItems;
  const activeItems = incomingMode === "cluster"
    ? (clusterItems.length ? clusterItems : splitItems)
    : (splitItems.length ? splitItems : clusterItems);

  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    folderName: existing.folderName || incoming.folderName,
    createdAt: Number(existing.createdAt) || Number(incoming.createdAt) || Date.now(),
    sourceKey: incoming.sourceKey || existing.sourceKey || "",
    sourceHash: getSplitHistorySourceHash(incoming) || getSplitHistorySourceHash(existing),
    processImage: incoming.processImage || existing.processImage || "",
    clusterProcessImage: incoming.clusterProcessImage || existing.clusterProcessImage || "",
    absorbedProcessImage: incoming.absorbedProcessImage || existing.absorbedProcessImage || "",
    splitItems,
    clusterItems,
    items: activeItems,
    itemCount: activeItems.length || Number(incoming.itemCount) || Number(existing.itemCount) || 0,
    groupMode: clusterItems.length ? "cluster" : incomingMode,
    timing: {
      ...(existing.timing || {}),
      ...(incoming.timing || {}),
    },
    upscaledItems: Array.isArray(incoming.upscaledItems) && incoming.upscaledItems.length
      ? incoming.upscaledItems
      : Array.isArray(existing.upscaledItems)
        ? existing.upscaledItems
        : [],
    upscaleError: typeof incoming.upscaleError === "string" && incoming.upscaleError
      ? incoming.upscaleError
      : typeof existing.upscaleError === "string"
        ? existing.upscaleError
        : "",
    upscaleErrorAt: Number(incoming.upscaleErrorAt) || Number(existing.upscaleErrorAt) || 0,
  };
}

function upsertSplitHistoryRecord(records = [], saved = {}) {
  const savedKey = getSplitHistoryMergeKey(saved);
  const rest = [];
  let merged = saved;
  (Array.isArray(records) ? records : []).forEach((record) => {
    const sameSource = savedKey && getSplitHistoryMergeKey(record) === savedKey;
    const sameId = (record.id || record.folderName) === (saved.id || saved.folderName);
    if (sameSource || sameId) {
      merged = mergeSplitHistoryRecords(record, merged);
      return;
    }
    rest.push(record);
  });
  return [merged, ...rest].slice(0, 30);
}

function consolidateSplitHistoryRecords(records = []) {
  return (Array.isArray(records) ? records : []).reduce(
    (next, record) => upsertSplitHistoryRecord(next, record),
    []
  );
}

// 画布(Canvas)入口暂时隐藏；代码保留，改回 true 即可恢复导航标签。
const SHOW_CANVAS_TAB = false;

// ─── Components ───
// ─── Main App ───
export default function App() {
  const promptEditor = useUndoRedoText("");
  const compareAEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS[0]);
  const compareBEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS[1]);
  const compareCEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS[2]);
  const compareDEditor = useUndoRedoText(DEFAULT_COMPARE_PROMPTS[3]);
  const compareEditors = [compareAEditor, compareBEditor, compareCEditor, compareDEditor];
  const [compareCount, setCompareCount] = useState(2);
  const prompt = promptEditor.value;
  const comparePrompts = useMemo(
    () => compareEditors.map((ed) => ed.value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compareAEditor.value, compareBEditor.value, compareCEditor.value, compareDEditor.value]
  );
  const [activePage, setActivePage] = useState("workspace");
  const [uiLanguage, setUiLanguage] = useState(DEFAULT_UI_LANGUAGE);
  const [taskMode, setTaskMode] = useState(DEFAULT_TASK_MODE);
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [apiKeys, setApiKeys] = useState(DEFAULT_API_KEYS);
  const [draftApiKeys, setDraftApiKeys] = useState(DEFAULT_API_KEYS);
  const [apiKeySavedAt, setApiKeySavedAt] = useState(null);
  const [showApiModal, setShowApiModal] = useState(false);
  const [gptAssistPrompt, setGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [draftGptAssistPrompt, setDraftGptAssistPrompt] = useState(DEFAULT_GPT_ASSIST_PROMPT);
  const [gptAssistSendPromptText, setGptAssistSendPromptText] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
  const [draftGptAssistSendPromptText, setDraftGptAssistSendPromptText] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
  const [gptAssistSendPromptImage, setGptAssistSendPromptImage] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  const [draftGptAssistSendPromptImage, setDraftGptAssistSendPromptImage] = useState(DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
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
  const [showInputImageEditor, setShowInputImageEditor] = useState(false);
  const [inputImageEditorIndex, setInputImageEditorIndex] = useState(0);
  const [showStyleReferenceModal, setShowStyleReferenceModal] = useState(false);
  const [selectedModels, setSelectedModels] = useState(DEFAULT_SELECTED_MODELS);
  const [modelCounts, setModelCounts] = useState(DEFAULT_MODEL_COUNTS);
  const [lastEditedCount, setLastEditedCount] = useState(DEFAULT_LAST_EDITED_COUNT);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [qwenPromptExtend, setQwenPromptExtend] = useState(DEFAULT_QWEN_PROMPT_EXTEND);
  const [qwenPromptExtendMode, setQwenPromptExtendMode] = useState(DEFAULT_QWEN_PROMPT_EXTEND_MODE);
  const [turns, setTurns] = useState([]);
  const [activeTurnId, setActiveTurnId] = useState(null);
  const [historyLimit, setHistoryLimit] = useState(4);
  const [previewImage, setPreviewImage] = useState(null);
  const [canvasImportQueue, setCanvasImportQueue] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [proxyUrl, setProxyUrl] = useState(DEFAULT_PROXY_URL);
  const [historyDirHandle, setHistoryDirHandle] = useState(null);
  const [historyDirName, setHistoryDirName] = useState("");
  const [historyFolderMsg, setHistoryFolderMsg] = useState("");
  const [isPickingHistoryFolder, setIsPickingHistoryFolder] = useState(false);
  const [hiddenTurnIds, setHiddenTurnIds] = useState([]);
  const [selectedAtlasItems, setSelectedAtlasItems] = useState([]);
  const [atlasThumbnail, setAtlasThumbnail] = useState(null);
  const [atlasBusy, setAtlasBusy] = useState(false);
  const [showSelectionLimitModal, setShowSelectionLimitModal] = useState(false);
  const [showAtlasThumbnailModal, setShowAtlasThumbnailModal] = useState(false);
  const [retryingImageKeys, setRetryingImageKeys] = useState(new Set());
  const [splittingImageKeys, setSplittingImageKeys] = useState(new Set());
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitExporting, setSplitExporting] = useState(false);
  const [splitEnhancing, setSplitEnhancing] = useState(false);
  const [splitEnhanceEnabled, setSplitEnhanceEnabled] = useState(true);
  const [splitUseRemovedSource, setSplitUseRemovedSource] = useState(false);
  const [splitRenderMode, setSplitRenderMode] = useState(DEFAULT_SPLIT_RENDER_MODE);
  const [splitShapeMode, setSplitShapeMode] = useState(DEFAULT_SPLIT_SHAPE_MODE);
  const [splitGroupMode, setSplitGroupMode] = useState("cluster");
  const [splitBackgroundColor, setSplitBackgroundColor] = useState(DEFAULT_SPLIT_BG_COLOR);
  const [splitSelectedItemIds, setSplitSelectedItemIds] = useState(new Set());
  const [splitUndoStack, setSplitUndoStack] = useState([]);
  const [splitStatusText, setSplitStatusText] = useState("");
  const [splitStatusTone, setSplitStatusTone] = useState("info");
  const [splitTiming, setSplitTiming] = useState({ splitMs: null, clusterMs: null });
  const [splitHistoryRecords, setSplitHistoryRecords] = useState([]);
  const [splitHistorySaving, setSplitHistorySaving] = useState(false);
  const [splitHistoryUpscalingIds, setSplitHistoryUpscalingIds] = useState(new Set());
  const [splitContext, setSplitContext] = useState({
    key: "",
    image: "",
    originalImage: "",
    sourceImage: "",
    processBaseImage: "",
    processImage: "",
    clusterProcessImage: "",
    absorbedProcessImage: "",
    removedBaseImage: "",
    removedEnhancedImage: "",
    removedImage: "",
    baseItems: [],
    items: [],
    clusterStageItems: [],
    absorbedStageItems: [],
    fileStem: "image",
    turnId: "",
    turnSeq: 0,
    modelId: "",
    modelName: "",
    promptKey: "single",
    promptText: "",
    theme: "",
    index: 1,
    width: 0,
    height: 0,
  });
  const fileRef = useRef(null);
  const activePromptFieldRef = useRef("single");
  const composerSectionRef = useRef(null);
  const promptInputRef = useRef(null);
  const compareAInputRef = useRef(null);
  const compareBInputRef = useRef(null);
  const compareCInputRef = useRef(null);
  const compareDInputRef = useRef(null);
  const compareInputRefs = [compareAInputRef, compareBInputRef, compareCInputRef, compareDInputRef];
  const seqRef = useRef(1);
  const isPickingHistoryFolderRef = useRef(false);
  const hasAutoPromptedHistoryFolderRef = useRef(false);
  const splitHistoryAutoSavedNonceRef = useRef(0);
  const splitHistoryAutoSavingNonceRef = useRef(0);
  const [splitHistoryAutoSaveNonce, setSplitHistoryAutoSaveNonce] = useState(0);
  const t = useCallback((key, params) => translateUiText(uiLanguage, key, params), [uiLanguage]);

  const { isProcessing, cancelModelTask, abortTurnTasks } = useTaskQueue({
    turns,
    setTurns,
    apiKeys,
    historyDirHandle,
    setHistoryFolderMsg,
    t,
  });

  const insertPlaceholderChip = useCallback(() => {
    if (taskMode === "compare") {
      const idx = typeof activePromptFieldRef.current === "number" ? activePromptFieldRef.current : 0;
      compareInputRefs[idx]?.current?.insertPlaceholder?.();
      return;
    }
    promptInputRef.current?.insertPlaceholder?.();
  }, [taskMode, compareInputRefs]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.historyLimit === "number") setHistoryLimit(saved.historyLimit);
        if (Array.isArray(saved.selectedModels) && saved.selectedModels.length) {
          const availableModelIds = new Set(IMAGE_MODELS.map((model) => model.id));
          const migrated = Array.from(
            new Set(saved.selectedModels.map((id) => normalizeModelId(id)).filter((id) => availableModelIds.has(id))),
          );
          setSelectedModels(migrated.length ? migrated : DEFAULT_SELECTED_MODELS);
        }
        if (saved.modelCounts && typeof saved.modelCounts === "object") {
          const migratedCounts = { ...saved.modelCounts };
          if (typeof migratedCounts["nano-banana-pro-all"] === "number" && typeof migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number") {
            migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] = migratedCounts["nano-banana-pro-all"];
          }
          if (typeof migratedCounts["gemini-3-pro-preview"] === "number" && typeof migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] !== "number") {
            migratedCounts[NANO_PRO_OFFICIAL_MODEL_ID] = migratedCounts["gemini-3-pro-preview"];
          }
          const legacyQwen3Count = migratedCounts["qwen-image-3.0"] ?? migratedCounts["qwen-image-3.0-pro"];
          if (typeof legacyQwen3Count === "number" && typeof migratedCounts["qwen-image-invite-beta-v1"] !== "number") {
            migratedCounts["qwen-image-invite-beta-v1"] = legacyQwen3Count;
          }
          if (typeof migratedCounts["qwen-image-plus"] === "number" && typeof migratedCounts["qwen-image-2.0"] !== "number") {
            migratedCounts["qwen-image-2.0"] = migratedCounts["qwen-image-plus"];
          }
          if (typeof migratedCounts["qwen-image-max"] === "number" && typeof migratedCounts["qwen-image-2.0-pro"] !== "number") {
            migratedCounts["qwen-image-2.0-pro"] = migratedCounts["qwen-image-max"];
          }
          setModelCounts((prev) => ({ ...prev, ...migratedCounts }));
        }
        if (saved.taskMode === "single" || saved.taskMode === "compare" || saved.taskMode === "style") setTaskMode(saved.taskMode);
        if (saved.comparePrompts) {
          if (Array.isArray(saved.comparePrompts)) {
            saved.comparePrompts.slice(0, MAX_COMPARE_PROMPTS).forEach((v, i) => {
              if (typeof v === "string") compareEditors[i].resetText(v);
            });
            if (typeof saved.compareCount === "number" && saved.compareCount >= 2 && saved.compareCount <= MAX_COMPARE_PROMPTS) {
              setCompareCount(saved.compareCount);
            }
          } else if (typeof saved.comparePrompts === "object") {
            if (typeof saved.comparePrompts.a === "string") compareEditors[0].resetText(saved.comparePrompts.a);
            if (typeof saved.comparePrompts.b === "string") compareEditors[1].resetText(saved.comparePrompts.b);
          }
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
        } else {
          setApiBaseUrl(DEFAULT_API_BASE_URL);
        }
        if (typeof saved.lastEditedCount === "number") {
          setLastEditedCount(Math.max(1, Math.min(8, Number(saved.lastEditedCount) || 1)));
        }
        if (typeof saved.aspectRatio === "string" || typeof saved.geminiAspectRatio === "string") {
          setAspectRatio(normalizeAspectRatio(saved.aspectRatio ?? saved.geminiAspectRatio));
        }
        if (typeof saved.qwenPromptExtend === "boolean") setQwenPromptExtend(saved.qwenPromptExtend);
        if (saved.qwenPromptExtendMode === "direct" || saved.qwenPromptExtendMode === "agent") {
          setQwenPromptExtendMode(saved.qwenPromptExtendMode);
        }
        if (typeof saved.proxyUrl === "string" && saved.proxyUrl.trim()) setProxyUrl(saved.proxyUrl);
        if (typeof saved.uiLanguage === "string") setUiLanguage(normalizeUiLanguage(saved.uiLanguage));
        if (typeof saved.nextSeq === "number" && Number.isFinite(saved.nextSeq)) seqRef.current = saved.nextSeq;
      } else {
        const s = getRuntimeConfig().proxyUrl;
        if (s) setProxyUrl(s);
      }
    } catch {}
  }, []);
  useEffect(() => {
    setRuntimeConfig({
      proxyUrl,
      apiBaseUrl,
      apiPlatform: DEFAULT_API_PLATFORM,
      apiKeys,
    });
  }, [apiBaseUrl, apiKeys, proxyUrl]);
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = uiLanguage === "zh" ? "zh-CN" : "en";
    }
  }, [uiLanguage]);
  useEffect(() => {
    const state = {
      historyLimit,
      selectedModels,
      modelCounts,
      prompt,
      taskMode,
      comparePrompts,
      compareCount,
      styleThemes,
      styleReferenceImages,
      apiBaseUrl,
      lastEditedCount,
      aspectRatio,
      qwenPromptExtend,
      qwenPromptExtendMode,
      proxyUrl,
      uiLanguage,
      nextSeq: seqRef.current,
    };
    try {
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    } catch {}
  }, [historyLimit, selectedModels, modelCounts, prompt, taskMode, comparePrompts, compareCount, styleThemes, styleReferenceImages, apiBaseUrl, lastEditedCount, aspectRatio, qwenPromptExtend, qwenPromptExtendMode, proxyUrl, uiLanguage]);

  useEffect(() => {
    if (selectedAtlasItems.length > 0) return;
    setAtlasThumbnail(null);
  }, [selectedAtlasItems.length]);

  const handleSaveApiKey = useCallback(() => {
    const nextKeys = normalizeApiKeys(draftApiKeys);
    setApiKeys(nextKeys);
    setDraftApiKeys(nextKeys);
    setApiKeySavedAt(Date.now());
  }, [draftApiKeys]);

  const handleSaveGptAssistPrompt = useCallback(() => {
    if (!historyDirHandle) {
      setHistoryFolderMsg(t("history.needFolderForGpt"));
      return;
    }
    const nextPrompt = normalizeGptAssistPrompt(draftGptAssistPrompt);
    const nextStyleThemePrompt = normalizeStyleThemeAssistPrompt(draftStyleThemeAssistPrompt);
    const nextSendPromptText = normalizeGptAssistFlag(draftGptAssistSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT);
    const nextSendPromptImage = normalizeGptAssistFlag(draftGptAssistSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
    setGptAssistPrompt(nextPrompt);
    setStyleThemeAssistPrompt(nextStyleThemePrompt);
    setGptAssistSendPromptText(nextSendPromptText);
    setGptAssistSendPromptImage(nextSendPromptImage);
    setDraftGptAssistPrompt(nextPrompt);
    setDraftStyleThemeAssistPrompt(nextStyleThemePrompt);
    setDraftGptAssistSendPromptText(nextSendPromptText);
    setDraftGptAssistSendPromptImage(nextSendPromptImage);
    setGptAssistSavedAt(Date.now());
    setShowGptAssistModal(false);
  }, [draftGptAssistPrompt, draftGptAssistSendPromptImage, draftGptAssistSendPromptText, draftStyleThemeAssistPrompt, historyDirHandle, t]);

  const openTemplateEditor = useCallback((templateId) => {
    if (!historyDirHandle) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingTemplateId(template.id);
    setTemplateDraft({
      title: getLocalizedTemplateTitle(template.title, template.id, uiLanguage, false),
      body: template.body || "",
      backup: template.backup || "",
      memo: template.memo || "",
    });
    setShowTemplateModal(true);
  }, [templates, historyDirHandle, uiLanguage]);

  const saveTemplateDraft = useCallback(() => {
    if (!editingTemplateId || !historyDirHandle) return;
    const title = templateDraft.title.trim() || getDefaultTemplateTitle(editingTemplateId, uiLanguage);
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
        if (comparePrompts[0] !== promptA) compareEditors[0].setText(promptA, { record: false });
        if (comparePrompts[1] !== promptB) compareEditors[1].setText(promptB, { record: false });
      } else if (prompt !== promptA) {
        promptEditor.setText(promptA, { record: false });
      }
    }
    setShowTemplateModal(false);
  }, [templateDraft, editingTemplateId, historyDirHandle, activeTemplateId, taskMode, comparePrompts, prompt, compareEditors, promptEditor, uiLanguage]);

  const openStyleTemplateEditor = useCallback((templateId) => {
    if (!historyDirHandle) return;
    const template = styleTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingStyleTemplateId(template.id);
    setStyleTemplateDraft({
      title: getLocalizedTemplateTitle(template.title, template.id, uiLanguage, true),
      body: template.body || "",
    });
    setShowStyleTemplateModal(true);
  }, [styleTemplates, historyDirHandle, uiLanguage]);

  const saveStyleTemplateDraft = useCallback(() => {
    if (!editingStyleTemplateId || !historyDirHandle) return;
    const title = styleTemplateDraft.title.trim() || getDefaultStyleTemplateTitle(editingStyleTemplateId, uiLanguage);
    const body = styleTemplateDraft.body || "";
    setStyleTemplates((prev) => prev.map((item) => (item.id === editingStyleTemplateId ? { ...item, title, body } : item)));
    if (activeStyleTemplateId === editingStyleTemplateId && prompt !== body) {
      promptEditor.setText(body, { record: false });
    }
    setShowStyleTemplateModal(false);
  }, [styleTemplateDraft, editingStyleTemplateId, historyDirHandle, activeStyleTemplateId, prompt, promptEditor, uiLanguage]);

  const selectTemplateUsage = useCallback((templateId) => {
    if (!historyDirHandle) return;
    if (activeTemplateId === templateId) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setActiveTemplateId(template.id);
    const promptA = template.body || "";
    const promptB = template.backup?.trim() ? template.backup : promptA;
    if (taskMode === "compare") {
      if (comparePrompts[0] !== promptA) compareEditors[0].setText(promptA, { record: false });
      if (comparePrompts[1] !== promptB) compareEditors[1].setText(promptB, { record: false });
      return;
    }
    if (prompt !== promptA) promptEditor.setText(promptA, { record: false });
  }, [templates, taskMode, compareEditors, promptEditor, activeTemplateId, comparePrompts, prompt, historyDirHandle]);

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
      ? comparePrompts.slice(0, compareCount).map((p, i) => {
          const key = ["a", "b", "c", "d"][i];
          return { key, prompt: p, clearedPrompt: clearPlaceholderValues(p) };
        })
      : [{ key: "single", prompt, clearedPrompt: clearPlaceholderValues(prompt) }];
    const targetItems = items.filter((item) => extractPlaceholderTokens(item.prompt).length > 0);
    if (!targetItems.length) {
      setHistoryFolderMsg(t("history.noPlaceholder"));
      return;
    }

    if (taskMode === "compare") {
      items.forEach((item, i) => compareEditors[i].setText(item.clearedPrompt, { record: false }));
    } else {
      promptEditor.setText(items[0].clearedPrompt, { record: false });
    }

    setGptAssistBusy(true);
    try {
      const rewritten = {};
      if (taskMode === "compare") {
        const activeIdx = typeof activePromptFieldRef.current === "number" ? activePromptFieldRef.current : 0;
        const sourceItem = targetItems.find((item) => item.key === ["a", "b", "c", "d"][activeIdx]) || targetItems[0];
        const sourceRewritten = await callTextAssistWithFallback(
          proxyUrl,
          sourceItem.clearedPrompt,
          uploadedImage,
          gptAssistPrompt,
          {
            apiKeys,
            sendPromptText: gptAssistSendPromptText,
            sendPromptImage: gptAssistSendPromptImage,
          }
        );
        const syncedReplacements = extractPlaceholderTokens(sourceRewritten);
        items.forEach((item) => {
          rewritten[item.key] = applyPlaceholderReplacements(item.clearedPrompt, syncedReplacements);
        });
      } else {
        const item = targetItems[0];
        rewritten[item.key] = await callTextAssistWithFallback(
          proxyUrl,
          item.clearedPrompt,
          uploadedImage,
          gptAssistPrompt,
          {
            apiKeys,
            sendPromptText: gptAssistSendPromptText,
            sendPromptImage: gptAssistSendPromptImage,
          }
        );
      }

      if (taskMode === "compare") {
        items.forEach((item, i) => {
          if (typeof rewritten[item.key] === "string" && rewritten[item.key] !== comparePrompts[i]) {
            compareEditors[i].setText(rewritten[item.key], { record: false });
          }
        });
      } else if (typeof rewritten.single === "string" && rewritten.single !== prompt) {
        promptEditor.setText(rewritten.single, { record: false });
      }

      setHistoryFolderMsg(t("history.gptRewrote", { count: Object.keys(rewritten).length }));
    } catch (err) {
      if (!isAbortError(err)) {
        setHistoryFolderMsg(t("history.gptRewriteFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
      }
    } finally {
      setGptAssistBusy(false);
    }
  }, [gptAssistBusy, proxyUrl, taskMode, comparePrompts, compareCount, compareEditors, prompt, uploadedImage, gptAssistPrompt, gptAssistSendPromptImage, gptAssistSendPromptText, apiKeys, promptEditor, t]);

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
      setHistoryFolderMsg(t("history.enterThemeSeed"));
      return;
    }

    setStyleThemeAssistBusy(true);
    try {
      const generated = await callThemeAssistWithFallback(
        proxyUrl,
        seed,
        styleThemeAssistPrompt,
        { apiKeys }
      );
      if (!generated.length) {
        setHistoryFolderMsg(t("history.themeAssistInvalid"));
        return;
      }
      setStyleThemes((prev) => {
        const next = normalizeStyleThemes(prev);
        for (let index = 0; index < STYLE_THEME_SLOTS; index += 1) {
          next[index] = generated[index] || "";
        }
        return next;
      });
      setHistoryFolderMsg(t("history.generatedThemes", { count: Math.min(generated.length, STYLE_THEME_SLOTS) }));
    } catch (err) {
      if (!isAbortError(err)) {
        setHistoryFolderMsg(t("history.themeAssistFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
      }
    } finally {
      setStyleThemeAssistBusy(false);
    }
  }, [styleThemeAssistBusy, taskMode, proxyUrl, styleThemeSeedInput, styleThemeAssistPrompt, apiKeys, t]);

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
    setShowInputImageEditor(false);
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

  const openInputImageEditor = useCallback((index = 0) => {
    if (!inputImageList.length) return;
    const safeIndex = Math.max(0, Math.min(inputImageList.length - 1, Number(index) || 0));
    setInputImageEditorIndex(safeIndex);
    setShowInputImageEditor(true);
  }, [inputImageList]);

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

  const confirmInputImageEditor = useCallback((nextImages) => {
    const safeImages = (Array.isArray(nextImages) ? nextImages : [])
      .filter((item) => typeof item === "string" && item.startsWith("data:image/"))
      .slice(0, MAX_INPUT_IMAGES_PER_BATCH);
    setUploadedInputImages(safeImages);
    setUploadedImage(safeImages[0] || null);
    setUploadedPreview(safeImages[0] || null);
    setShowInputImageEditor(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

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

  const updateComparePrompt = useCallback((index, value) => {
    const nextValue = typeof value === "string" ? value : String(value ?? "");
    const prevTokens = extractPlaceholderTokens(comparePrompts[index] || "");
    const nextTokens = extractPlaceholderTokens(nextValue);
    compareEditors[index].setText(nextValue);
    const changed = prevTokens.length !== nextTokens.length || prevTokens.some((v, i) => v !== nextTokens[i]);
    if (changed) {
      for (let i = 0; i < compareCount; i++) {
        if (i === index) continue;
        const synced = applyPlaceholderReplacements(comparePrompts[i] || "", nextTokens);
        if (synced !== comparePrompts[i]) compareEditors[i].setText(synced, { record: false });
      }
    }
  }, [compareEditors, comparePrompts, compareCount]);

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
      setHistoryFolderMsg(t("history.retryTurnNotFound"));
      return;
    }
    const targetResult = (targetTurn.results || []).find((result) => isSameResultTask(result, modelId, promptKey));
    if (!targetResult) {
      setHistoryFolderMsg(t("history.retryResultNotFound"));
      return;
    }
    const model = IMAGE_MODELS.find((item) => item.id === modelId);
    if (!model) {
      setHistoryFolderMsg(t("history.retryModelMissing"));
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
      const requestConfig = getApiConfigForModel(model, mergeApiKeys(targetTurn.apiKeys, apiKeys));
      const generated = await generateImage(targetTurn.proxyUrl || proxyUrl, model, promptText, targetTurn.referenceImage, {
        count: 1,
        ...requestConfig,
        aspectRatio: normalizeAspectRatio(targetTurn.aspectRatio ?? targetTurn.geminiAspectRatio ?? aspectRatio),
        imageInputs: turnImageInputs,
        promptExtend: targetTurn.qwenPromptExtend !== false,
        promptExtendMode: targetTurn.qwenPromptExtendMode,
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
      setHistoryFolderMsg(mode === "append" ? t("history.appendedOne") : t("history.replacedOne"));
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
      setHistoryFolderMsg(t("history.retryFailed", { error: localizeRuntimeMessage(message, t) }));
    } finally {
      setRetryingImageKeys((prev) => {
        const next = new Set(prev);
        busyKeys.forEach((item) => next.delete(item));
        return next;
      });
    }
  }, [turns, proxyUrl, apiKeys, aspectRatio, t]);

  const retryImage = useCallback((payload) => runResultImageAction(payload, "replace"), [runResultImageAction]);
  const appendResultImage = useCallback((payload) => runResultImageAction(payload, "append"), [runResultImageAction]);

  const runSplitForImage = useCallback(async (payload, options = {}) => {
    const openModal = options.openModal !== false;
    const defaultRenderMode = normalizeSplitRenderMode(options.renderMode);
    const defaultShapeMode = normalizeSplitShapeMode(options.shapeMode);
    const defaultGroupMode = normalizeSplitGroupMode(options.groupMode);
    const defaultEnhance = options.enhance !== false;
    const defaultUseRemoved = options.useRemovedSource === true;
    const resetUndo = options.resetUndo !== false;
    const imageKey = payload?.key || `split-${Date.now()}`;
    const rawImage = payload?.image;
    if (!rawImage) return;
    if (openModal) setShowSplitModal(true);
    setSplitRenderMode(defaultRenderMode);
    setSplitShapeMode(defaultShapeMode);
    setSplitGroupMode(defaultGroupMode);
    setSplitEnhanceEnabled(defaultEnhance);
    setSplitUseRemovedSource(defaultUseRemoved);
    setSplitBusy(true);
    setSplitExporting(false);
    setSplitEnhancing(defaultEnhance);
    setSplitSelectedItemIds(new Set());
    if (resetUndo) setSplitUndoStack([]);
    setSplitStatusTone("info");
    setSplitStatusText(t("split.detecting"));
    setSplitTiming({ splitMs: null, clusterMs: null });
    setSplitContext((prev) => ({
      ...prev,
      ...payload,
      key: imageKey,
      image: rawImage,
      originalImage: "",
      removedImage: "",
      removedBaseImage: "",
      removedEnhancedImage: "",
      processBaseImage: "",
      processImage: "",
      clusterProcessImage: "",
      absorbedProcessImage: "",
      baseItems: [],
      items: [],
      clusterStageItems: [],
      absorbedStageItems: [],
      sourceImage: "",
      width: 0,
      height: 0,
    }));
    setSplittingImageKeys((prev) => {
      const next = new Set(prev);
      next.add(imageKey);
      return next;
    });
    try {
      const normalized = await resolveSplitSourceDataUrl(rawImage, { apiBaseUrl, proxyUrl });
      if (!normalized || /^https?:\/\//i.test(normalized)) {
        throw new Error(t("errors.failedToFetch"));
      }
      const splitStartedAt = Date.now();
      const originalSplit = await splitImageBySubjects(normalized);
      let splitResult = originalSplit;
      if (defaultUseRemoved) {
        splitResult = await splitImageBySubjects(originalSplit.removedImage);
      }
      const splitMs = Date.now() - splitStartedAt;
      const splitTarget = defaultUseRemoved ? originalSplit.removedImage : normalized;
      const nextBackgroundColor = originalSplit.backgroundColor || DEFAULT_SPLIT_BG_COLOR;
      setSplitBackgroundColor(nextBackgroundColor);
      const baseItems = splitResult.items.map((item, index) => ({ ...item, index: index + 1 }));
      let clusterMs = null;
      let groupedItems = baseItems;
      let clusterStageItems = [];
      let absorbedStageItems = [];
      if (defaultGroupMode === "cluster") {
        const clusterStartedAt = Date.now();
        const clusteredResult = await buildClusteredSplitItems(baseItems, {
          width: splitResult.width,
          height: splitResult.height,
          maxCount: MAX_CLUSTERED_SPLIT_ITEMS,
          includeStages: true,
        });
        groupedItems = clusteredResult.items || [];
        clusterStageItems = clusteredResult.clusterStageItems || [];
        absorbedStageItems = clusteredResult.absorbedStageItems || groupedItems;
        clusterMs = Date.now() - clusterStartedAt;
      }
      setSplitTiming({ splitMs, clusterMs });
      const preparedItems = await buildSplitItemDisplayList(
        groupedItems.map((item, index) => ({ ...item, index: index + 1 })),
        {
          renderMode: defaultRenderMode,
          shapeMode: defaultShapeMode,
          backgroundColor: nextBackgroundColor,
          enhance: defaultEnhance,
        }
      );
      const removedDisplay = await buildRemovedDisplayImage(originalSplit.removedImage, {
        enhance: defaultEnhance,
        cachedEnhanced: "",
      });
      setSplitContext((prev) => ({
        ...prev,
        ...payload,
        key: imageKey,
        image: splitTarget,
        originalImage: normalized,
        sourceImage: splitResult.sourceImage,
        processBaseImage: splitResult.processImage || splitResult.sourceImage,
        processImage: splitResult.processImage || splitResult.sourceImage,
        clusterProcessImage: "",
        absorbedProcessImage: "",
        removedBaseImage: originalSplit.removedImage,
        removedEnhancedImage: removedDisplay.enhancedImage,
        removedImage: removedDisplay.image,
        baseItems,
        items: preparedItems,
        clusterStageItems,
        absorbedStageItems,
        width: splitResult.width,
        height: splitResult.height,
      }));
      if (preparedItems.length) {
        setSplitStatusTone("info");
        if (defaultGroupMode === "cluster") {
          setSplitStatusText(t("split.clustered", { count: preparedItems.length, sourceCount: baseItems.length }));
        } else {
          setSplitStatusText(
            defaultEnhance
              ? t("split.enhanced", { count: preparedItems.length })
              : t("split.count", { count: preparedItems.length })
          );
        }
      } else {
        setSplitStatusTone("info");
        setSplitStatusText(t("split.noSubjects"));
      }
      setSplitHistoryAutoSaveNonce((prev) => prev + 1);
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
      setSplitContext((prev) => ({
        ...prev,
        ...payload,
        key: imageKey,
        image: rawImage,
        originalImage: "",
        sourceImage: "",
        processBaseImage: "",
        processImage: "",
        clusterProcessImage: "",
        absorbedProcessImage: "",
        removedImage: "",
        removedBaseImage: "",
        removedEnhancedImage: "",
        baseItems: [],
        items: [],
        clusterStageItems: [],
        absorbedStageItems: [],
      }));
    } finally {
      setSplitBusy(false);
      setSplitEnhancing(false);
      setSplittingImageKeys((prev) => {
        const next = new Set(prev);
        next.delete(imageKey);
        return next;
      });
    }
  }, [apiBaseUrl, proxyUrl, t]);

  useEffect(() => {
    const sourceImage = splitContext.sourceImage;
    const processBaseImage = splitContext.processBaseImage || splitContext.processImage || sourceImage;
    if (!sourceImage && !processBaseImage) return;
    let cancelled = false;
    (async () => {
      try {
        let nextClusterProcessImage = "";
        let nextAbsorbedProcessImage = "";
        let nextProcessImage = "";
        if (splitGroupMode === "cluster") {
          const clusterStageItems = Array.isArray(splitContext.clusterStageItems) && splitContext.clusterStageItems.length
            ? splitContext.clusterStageItems
            : splitContext.items;
          const absorbedStageItems = Array.isArray(splitContext.absorbedStageItems) && splitContext.absorbedStageItems.length
            ? splitContext.absorbedStageItems
            : splitContext.items;
          nextClusterProcessImage = await buildClusterProcessPreview(sourceImage, processBaseImage, clusterStageItems, {
            width: splitContext.width,
            height: splitContext.height,
          });
          nextAbsorbedProcessImage = await buildClusterProcessPreview(sourceImage, processBaseImage, absorbedStageItems, {
            width: splitContext.width,
            height: splitContext.height,
            strokeStyle: "rgba(250,204,21,0.98)",
          });
          nextProcessImage = nextAbsorbedProcessImage || nextClusterProcessImage;
        } else {
          nextProcessImage = await buildSplitProcessPreviewForShape(
            sourceImage,
            processBaseImage,
            splitContext.items,
            splitShapeMode
          );
        }
        if (cancelled || !nextProcessImage) return;
        setSplitContext((prev) => {
          if (prev.sourceImage !== sourceImage) return prev;
          if ((prev.processBaseImage || prev.processImage || prev.sourceImage) !== processBaseImage) return prev;
          if (
            prev.processImage === nextProcessImage &&
            prev.clusterProcessImage === nextClusterProcessImage &&
            prev.absorbedProcessImage === nextAbsorbedProcessImage
          ) return prev;
          return {
            ...prev,
            processImage: nextProcessImage,
            clusterProcessImage: nextClusterProcessImage,
            absorbedProcessImage: nextAbsorbedProcessImage,
          };
        });
      } catch {
        // Keep the last preview if regenerating the process image fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    splitContext.absorbedStageItems,
    splitContext.clusterStageItems,
    splitContext.height,
    splitContext.items,
    splitContext.processBaseImage,
    splitContext.sourceImage,
    splitContext.width,
    splitGroupMode,
    splitShapeMode,
  ]);

  const openSplitModalForImage = useCallback((payload) => {
    runSplitForImage(payload, {
      openModal: true,
      renderMode: DEFAULT_SPLIT_RENDER_MODE,
      shapeMode: DEFAULT_SPLIT_SHAPE_MODE,
      groupMode: splitGroupMode,
      enhance: true,
      useRemovedSource: false,
      resetUndo: true,
    });
  }, [runSplitForImage, splitGroupMode]);

  const openSplitModalForCanvasNode = useCallback((node) => {
    if (!node?.image) return;
    openSplitModalForImage({
      key: node.id || `canvas-split-${Date.now()}`,
      image: node.image,
      fileStem: safeName(node.title || "canvas-image"),
      turnId: node.turnId || "",
      turnSeq: Number(node.turnSeq) || 0,
      modelId: node.modelId || "",
      modelName: node.modelName || "",
      promptKey: "single",
      promptText: node.promptText || "",
      theme: node.sourceLabel || "",
      index: 1,
    });
  }, [openSplitModalForImage]);

  const reSplitCurrentImage = useCallback(() => {
    const source = splitContext.originalImage || splitContext.sourceImage || splitContext.image;
    if (!source) return;
    runSplitForImage(
      {
        ...splitContext,
        image: source,
        key: splitContext.key || `split-${Date.now()}`,
      },
      {
        openModal: false,
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        groupMode: splitGroupMode,
        enhance: splitEnhanceEnabled,
        useRemovedSource: splitUseRemovedSource,
        resetUndo: true,
      }
    );
  }, [splitContext, runSplitForImage, splitRenderMode, splitShapeMode, splitGroupMode, splitEnhanceEnabled, splitUseRemovedSource]);

  const uploadSplitImageFromModal = useCallback(async (imageDataUrl, file) => {
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) return;
    const fallbackStem = typeof file?.name === "string" && file.name.trim()
      ? safeName(file.name.replace(/\.[^.]+$/, ""))
      : `upload_${Date.now()}`;
    await runSplitForImage(
      {
        key: `split-upload-${Date.now()}`,
        image: imageDataUrl,
        fileStem: fallbackStem,
        turnId: "",
        turnSeq: 0,
        modelId: "",
        modelName: "",
        promptKey: "single",
        promptText: "",
        theme: "",
        index: 1,
      },
      {
        openModal: activePage !== "split",
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        groupMode: splitGroupMode,
        enhance: splitEnhanceEnabled,
        useRemovedSource: splitUseRemovedSource,
        resetUndo: true,
      }
    );
  }, [activePage, runSplitForImage, splitRenderMode, splitShapeMode, splitGroupMode, splitEnhanceEnabled, splitUseRemovedSource]);

  const toggleSplitSourceMode = useCallback((useRemovedSource) => {
    const nextUseRemoved = useRemovedSource === true;
    if (nextUseRemoved === splitUseRemovedSource) return;
    const source = splitContext.originalImage || splitContext.sourceImage || splitContext.image;
    if (!source) return;
    runSplitForImage(
      {
        ...splitContext,
        image: splitContext.originalImage || source,
        key: splitContext.key || `split-${Date.now()}`,
      },
      {
        openModal: false,
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        groupMode: splitGroupMode,
        enhance: splitEnhanceEnabled,
        useRemovedSource: nextUseRemoved,
        resetUndo: true,
      }
    );
  }, [splitUseRemovedSource, splitContext, runSplitForImage, splitRenderMode, splitShapeMode, splitGroupMode, splitEnhanceEnabled]);

  const setSplitGroupModeMode = useCallback(async (mode) => {
    const nextMode = normalizeSplitGroupMode(mode);
    if (nextMode === splitGroupMode) return;
    const baseItems = Array.isArray(splitContext.baseItems) && splitContext.baseItems.length
      ? splitContext.baseItems
      : Array.isArray(splitContext.items)
        ? splitContext.items
        : [];
    setSplitGroupMode(nextMode);
    setSplitSelectedItemIds(new Set());
    setSplitUndoStack([]);
    if (!baseItems.length) return;
    setSplitBusy(true);
    setSplitEnhancing(splitEnhanceEnabled);
    setSplitStatusTone("info");
    setSplitStatusText(nextMode === "cluster" ? t("split.clustering") : t("split.detecting"));
    try {
      let clusterMs = null;
      let groupedItems = baseItems.map((item, index) => ({ ...item, index: index + 1 }));
      let clusterStageItems = [];
      let absorbedStageItems = [];
      if (nextMode === "cluster") {
        const clusterStartedAt = Date.now();
        const clusteredResult = await buildClusteredSplitItems(baseItems, {
          width: splitContext.width,
          height: splitContext.height,
          maxCount: MAX_CLUSTERED_SPLIT_ITEMS,
          includeStages: true,
        });
        groupedItems = clusteredResult.items || [];
        clusterStageItems = clusteredResult.clusterStageItems || [];
        absorbedStageItems = clusteredResult.absorbedStageItems || groupedItems;
        clusterMs = Date.now() - clusterStartedAt;
      }
      const nextItems = await buildSplitItemDisplayList(groupedItems, {
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        backgroundColor: splitBackgroundColor,
        enhance: splitEnhanceEnabled,
      });
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
        clusterProcessImage: "",
        absorbedProcessImage: "",
        clusterStageItems,
        absorbedStageItems,
      }));
      setSplitTiming((prev) => ({ ...prev, clusterMs: nextMode === "cluster" ? clusterMs : null }));
      setSplitStatusTone("info");
      setSplitStatusText(
        nextMode === "cluster"
          ? t("split.clustered", { count: nextItems.length, sourceCount: baseItems.length })
          : t("split.count", { count: nextItems.length })
      );
      setSplitHistoryAutoSaveNonce((prev) => prev + 1);
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
      setSplitGroupMode(splitGroupMode);
    } finally {
      setSplitBusy(false);
      setSplitEnhancing(false);
    }
  }, [splitGroupMode, splitContext.baseItems, splitContext.height, splitContext.items, splitContext.width, splitRenderMode, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const setSplitRenderModeMode = useCallback(async (mode) => {
    const nextMode = normalizeSplitRenderMode(mode);
    if (nextMode === splitRenderMode) return;
    setSplitRenderMode(nextMode);
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) return;
    setSplitBusy(true);
    try {
      const nextItems = await buildSplitItemDisplayList(items, {
        renderMode: nextMode,
        shapeMode: splitShapeMode,
        backgroundColor: splitBackgroundColor,
        enhance: splitEnhanceEnabled,
      });
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
      }));
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitBusy(false);
    }
  }, [splitRenderMode, splitContext.items, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const setSplitShapeModeMode = useCallback(async (mode) => {
    const nextMode = normalizeSplitShapeMode(mode);
    if (nextMode === splitShapeMode) return;
    setSplitShapeMode(nextMode);
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) return;
    setSplitBusy(true);
    try {
      const nextItems = await buildSplitItemDisplayList(items, {
        renderMode: splitRenderMode,
        shapeMode: nextMode,
        backgroundColor: splitBackgroundColor,
        enhance: splitEnhanceEnabled,
      });
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
      }));
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitBusy(false);
    }
  }, [splitShapeMode, splitContext.items, splitRenderMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const toggleSplitItemSelected = useCallback((itemId) => {
    if (!itemId) return;
    setSplitSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const mergeSelectedSplitItems = useCallback(async () => {
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) return;
    const selected = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => splitSelectedItemIds.has(item.id));
    if (selected.length < 2) {
      setSplitStatusTone("error");
      setSplitStatusText(t("split.mergeNeedTwo"));
      return;
    }
    setSplitBusy(true);
    try {
      const pickedItems = selected.map(({ item }) => item);
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let areaSum = 0;
      for (let i = 0; i < pickedItems.length; i += 1) {
        const item = pickedItems[i];
        const x = Number(item.x) || 0;
        const y = Number(item.y) || 0;
        const { baseWidth, baseHeight } = getSplitItemBaseSize(item);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + baseWidth);
        maxY = Math.max(maxY, y + baseHeight);
        areaSum += Number(item.area) || 0;
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        throw new Error("Invalid merge bounds");
      }
      const mergedBounds = {
        x: Math.max(0, Math.floor(minX)),
        y: Math.max(0, Math.floor(minY)),
      };
      mergedBounds.width = Math.max(1, Math.ceil(maxX) - mergedBounds.x);
      mergedBounds.height = Math.max(1, Math.ceil(maxY) - mergedBounds.y);
      const [rectImage, edgeImage, polygonImage] = await Promise.all([
        composeMergedSplitField(pickedItems, "rect", mergedBounds),
        composeMergedSplitField(pickedItems, "edge", mergedBounds),
        composeMergedSplitField(pickedItems, "polygon", mergedBounds),
      ]);
      const mergedId = `subject-merge-${Date.now()}`;
      const mergedRaw = {
        id: mergedId,
        index: 1,
        x: mergedBounds.x,
        y: mergedBounds.y,
        width: mergedBounds.width,
        height: mergedBounds.height,
        baseWidth: mergedBounds.width,
        baseHeight: mergedBounds.height,
        area: areaSum || mergedBounds.width * mergedBounds.height,
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
      };
      const selectedIdSet = new Set(pickedItems.map((item) => item.id));
      const firstIndex = Math.min(...selected.map((entry) => entry.idx));
      const remaining = items.filter((item) => !selectedIdSet.has(item.id));
      remaining.splice(firstIndex, 0, mergedRaw);
      const nextItems = await buildSplitItemDisplayList(
        remaining.map((item, index) => ({ ...item, index: index + 1 })),
        {
          renderMode: splitRenderMode,
          shapeMode: splitShapeMode,
          backgroundColor: splitBackgroundColor,
          enhance: splitEnhanceEnabled,
        }
      );
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
      }));
      setSplitSelectedItemIds(new Set([mergedId]));
      setSplitStatusTone("info");
      setSplitStatusText(t("split.merged", { count: selected.length }));
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitBusy(false);
    }
  }, [splitContext.items, splitSelectedItemIds, splitRenderMode, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const deleteSplitItem = useCallback((itemId) => {
    if (!itemId) return;
    setSplitSelectedItemIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    setSplitContext((prev) => {
      const items = Array.isArray(prev.items) ? prev.items : [];
      const index = items.findIndex((item) => item.id === itemId);
      if (index < 0) return prev;
      const removed = items[index];
      setSplitUndoStack((stack) => {
        const next = [...stack, { item: removed, index }];
        return next.slice(-120);
      });
      const nextItems = items.filter((item) => item.id !== itemId);
      return {
        ...prev,
        items: nextItems.map((item, itemIndex) => ({ ...item, index: itemIndex + 1 })),
      };
    });
    setSplitStatusTone("info");
    setSplitStatusText(t("split.deletedOne"));
  }, [t]);

  const undoDeleteSplitItem = useCallback(() => {
    setSplitUndoStack((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const last = next.pop();
      if (!last?.item) return next;
      setSplitContext((ctx) => {
        const current = Array.isArray(ctx.items) ? [...ctx.items] : [];
        const insertAt = Math.max(0, Math.min(Number(last.index) || current.length, current.length));
        current.splice(insertAt, 0, last.item);
        return {
          ...ctx,
          items: current.map((item, index) => ({ ...item, index: index + 1 })),
        };
      });
      setSplitStatusTone("info");
      setSplitStatusText(t("split.undoDone"));
      return next;
    });
  }, [t]);

  const setSplitEnhanceMode = useCallback(async (targetEnhance) => {
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    const hasRemoved = !!splitContext.removedBaseImage;
    if (!items.length && !hasRemoved) return;
    const nextEnhance = targetEnhance !== false;
    if (nextEnhance === splitEnhanceEnabled) return;
    setSplitEnhanceEnabled(nextEnhance);
    setSplitEnhancing(nextEnhance);
    setSplitStatusTone("info");
    setSplitStatusText(nextEnhance ? t("split.enhancing") : t("split.qualityOriginal"));
    try {
      const sourceItems = nextEnhance
        ? items.map((item) => ({
            ...item,
            enhancedRectImage: "",
            enhancedRectWidth: 0,
            enhancedRectHeight: 0,
            enhancedEdgeImage: "",
            enhancedEdgeWidth: 0,
            enhancedEdgeHeight: 0,
            enhancedPolygonImage: "",
            enhancedPolygonWidth: 0,
            enhancedPolygonHeight: 0,
            paintedEnhancedRectImage: "",
            paintedEnhancedEdgeImage: "",
            paintedEnhancedPolygonImage: "",
          }))
        : items;
      const nextItems = await buildSplitItemDisplayList(sourceItems, {
        renderMode: splitRenderMode,
        shapeMode: splitShapeMode,
        backgroundColor: splitBackgroundColor,
        enhance: nextEnhance,
      });
      const removedDisplay = await buildRemovedDisplayImage(splitContext.removedBaseImage, {
        enhance: nextEnhance,
        cachedEnhanced: nextEnhance ? "" : splitContext.removedEnhancedImage,
      });
      setSplitContext((prev) => ({
        ...prev,
        items: nextItems,
        removedImage: removedDisplay.image,
        removedEnhancedImage: removedDisplay.enhancedImage,
      }));
      setSplitStatusTone("info");
      if (nextEnhance) {
        setSplitStatusText(t("split.enhanced", { count: nextItems.length }));
      } else {
        setSplitStatusText(t("split.qualityOriginal"));
      }
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.loadFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
      setSplitEnhanceEnabled((prev) => !prev);
    } finally {
      setSplitEnhancing(false);
    }
  }, [splitContext.items, splitContext.removedBaseImage, splitContext.removedEnhancedImage, splitRenderMode, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const exportSplitItems = useCallback(async () => {
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) {
      setSplitStatusTone("error");
      setSplitStatusText(t("split.exportNoItems"));
      return;
    }
    if (!supportsFileSystemAccess()) {
      setSplitStatusTone("error");
      setSplitStatusText(t("split.unsupported"));
      return;
    }
    setSplitExporting(true);
    setSplitStatusTone("info");
    setSplitStatusText("");
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const stem = safeName(splitContext.fileStem || "image");
      const folderName = `split-${stem}-${Date.now()}`;
      const splitDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
      const sourceData = dataUrlToBytes(splitContext.originalImage || splitContext.sourceImage);
      if (sourceData) {
        await writeBinaryFile(splitDir, `original.${sourceData.ext}`, sourceData.bytes);
      }
      const removedData = dataUrlToBytes(splitContext.removedImage);
      if (removedData) {
        await writeBinaryFile(splitDir, `removed_background.${removedData.ext}`, removedData.bytes);
      }
      const manifestItems = [];
      for (let index = 0; index < Math.min(items.length, MAX_SPLIT_EXPORT_ITEMS); index += 1) {
        const item = items[index];
        const exportDataUrl = item.image;
        const data = dataUrlToBytes(exportDataUrl);
        if (!data) continue;
        const fileName = `${String(index + 1).padStart(3, "0")}_subject.${data.ext}`;
        await writeBinaryFile(splitDir, fileName, data.bytes);
        manifestItems.push({
          index: index + 1,
          file: fileName,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          area: item.area || 0,
        });
      }
      await writeTextFile(
        splitDir,
        "manifest.json",
        JSON.stringify(
          {
            createdAt: Date.now(),
            source: {
              width: splitContext.width || 0,
              height: splitContext.height || 0,
              file: sourceData ? `original.${sourceData.ext}` : "",
            },
            splitSource: splitUseRemovedSource ? "removed-background" : "original",
            groupMode: splitGroupMode,
            renderMode: splitRenderMode,
            shapeMode: splitShapeMode,
            backgroundColor: splitBackgroundColor,
            enhanced: splitEnhanceEnabled,
            itemCount: manifestItems.length,
            items: manifestItems,
          },
          null,
          2
        )
      );
      const successText = t("split.exported", { folder: folderName, count: manifestItems.length });
      setSplitStatusTone("info");
      setSplitStatusText(successText);
      setHistoryFolderMsg(successText);
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return;
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.pickFolderFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setSplitExporting(false);
    }
  }, [splitContext, splitUseRemovedSource, splitGroupMode, splitRenderMode, splitShapeMode, splitBackgroundColor, splitEnhanceEnabled, t]);

  const buildCurrentSplitHistoryRecord = useCallback((createdAt = Date.now()) => {
    const items = Array.isArray(splitContext.items) ? splitContext.items : [];
    if (!items.length) return null;
    const originalImage = splitContext.originalImage || splitContext.sourceImage || "";
    const splitItems = (Array.isArray(splitContext.baseItems) && splitContext.baseItems.length
      ? splitContext.baseItems.map((item, index) => ({
          ...item,
          index: index + 1,
          image: item.image || item.edgeImage || item.transparentImage || item.rectImage || "",
        }))
      : splitGroupMode === "standard"
        ? items
        : []
    ).slice(0, MAX_SPLIT_EXPORT_ITEMS);
    const clusterItems = splitGroupMode === "cluster"
      ? items.slice(0, MAX_SPLIT_EXPORT_ITEMS)
      : [];
    return {
      id: `split-history-${createdAt}`,
      createdAt,
      sourceKey: splitContext.key || "",
      sourceHash: hashSplitHistorySource(originalImage || splitContext.image || ""),
      fileStem: safeName(splitContext.fileStem || "image"),
      modelName: splitContext.modelName || "",
      promptText: splitContext.promptText || "",
      originalImage,
      sourceImage: splitContext.sourceImage || "",
      processImage: splitContext.processBaseImage || splitContext.processImage || "",
      clusterProcessImage: splitContext.clusterProcessImage || "",
      absorbedProcessImage: splitContext.absorbedProcessImage || "",
      width: splitContext.width || 0,
      height: splitContext.height || 0,
      items: items.slice(0, MAX_SPLIT_EXPORT_ITEMS),
      splitItems,
      clusterItems,
      groupMode: splitGroupMode,
      splitSource: splitUseRemovedSource ? "removed-background" : "original",
      renderMode: splitRenderMode,
      shapeMode: splitShapeMode,
      backgroundColor: splitBackgroundColor,
      enhanced: splitEnhanceEnabled,
      timing: splitTiming,
    };
  }, [
    splitBackgroundColor,
    splitContext,
    splitEnhanceEnabled,
    splitGroupMode,
    splitRenderMode,
    splitShapeMode,
    splitTiming,
    splitUseRemovedSource,
  ]);

  const persistSplitHistoryRecord = useCallback(async (record, options = {}) => {
    const silent = options?.silent === true;
    const items = Array.isArray(record?.items) ? record.items : [];
    if (!items.length) {
      if (!silent) {
        setSplitStatusTone("error");
        setSplitStatusText(t("split.exportNoItems"));
      }
      return null;
    }
    if (!historyDirHandle) {
      if (!silent) {
        setSplitStatusTone("error");
        setSplitStatusText(t("split.historyFolderRequired"));
      }
      return null;
    }
    setSplitHistorySaving(true);
    setSplitStatusTone("info");
    setSplitStatusText(t("split.historySaving"));
    try {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        throw new Error(t("split.historyWriteDenied"));
      }
      const recordKey = getSplitHistoryMergeKey(record);
      const existing = splitHistoryRecords.find((item) => recordKey && getSplitHistoryMergeKey(item) === recordKey);
      const saveRecord = existing ? mergeSplitHistoryRecords(existing, record) : record;
      const saved = await saveSplitHistoryToLocalFolder(historyDirHandle, saveRecord);
      setSplitHistoryRecords((prev) => upsertSplitHistoryRecord(prev, saved));
      const successText = t("split.historySaved", { folder: saved.folderName, count: saved.items.length });
      setSplitStatusTone("info");
      setSplitStatusText(successText);
      setHistoryFolderMsg(successText);
      return saved;
    } catch (err) {
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.historySaveFailed", {
          error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t),
        })
      );
      return null;
    } finally {
      setSplitHistorySaving(false);
    }
  }, [historyDirHandle, splitHistoryRecords, t]);

  useEffect(() => {
    const nonce = Number(splitHistoryAutoSaveNonce) || 0;
    if (!nonce || splitHistoryAutoSavedNonceRef.current === nonce) return undefined;
    if (splitHistoryAutoSavingNonceRef.current === nonce) return undefined;
    if (!historyDirHandle || splitBusy || splitEnhancing || splitExporting || splitHistorySaving) return undefined;
    const record = buildCurrentSplitHistoryRecord(Date.now());
    if (!record) return undefined;
    const hasProcessPreview = splitGroupMode === "cluster"
      ? !!record.processImage && !!record.clusterProcessImage && !!record.absorbedProcessImage
      : !!record.processImage;
    if (!hasProcessPreview) return undefined;
    splitHistoryAutoSavingNonceRef.current = nonce;
    (async () => {
      await persistSplitHistoryRecord(record, { silent: true });
      splitHistoryAutoSavedNonceRef.current = nonce;
      if (splitHistoryAutoSavingNonceRef.current === nonce) {
        splitHistoryAutoSavingNonceRef.current = 0;
      }
    })();
    return undefined;
  }, [
    buildCurrentSplitHistoryRecord,
    historyDirHandle,
    persistSplitHistoryRecord,
    splitBusy,
    splitEnhancing,
    splitExporting,
    splitGroupMode,
    splitHistoryAutoSaveNonce,
    splitHistorySaving,
  ]);

  const upscaleSplitHistoryRecord = useCallback(async (record) => {
    const recordId = record?.id || record?.folderName || "";
    if (!recordId) return;
    const updateRecord = (patch = {}) => {
      setSplitHistoryRecords((prev) => prev.map((item) => ((item.id || item.folderName) === recordId ? { ...item, ...patch } : item)));
    };
    const sourceItems = Array.isArray(record?.clusterItems) && record.clusterItems.length
      ? record.clusterItems
      : Array.isArray(record?.items)
        ? record.items
        : [];
    if (!sourceItems.length) return;
    const bailianKey = normalizeApiKeys(apiKeys).bailian;
    if (!bailianKey) {
      const message = t("split.upscaleNoKey");
      updateRecord({
        upscaleError: message,
        upscaleErrorAt: Date.now(),
      });
      setSplitStatusTone("error");
      setSplitStatusText(message);
      return;
    }
    setSplitHistoryUpscalingIds((prev) => {
      const next = new Set(prev);
      next.add(recordId);
      return next;
    });
    updateRecord({
      upscaleError: "",
      upscaleErrorAt: 0,
    });
    setSplitStatusTone("info");
    setSplitStatusText(t("split.upscaling"));
    try {
      const upscaledItems = [];
      for (let index = 0; index < sourceItems.length; index += 1) {
        const item = sourceItems[index];
        if (!item?.image) continue;
        const afterImage = await callWan21ImageSuperResolution(proxyUrl, item.image, {
          apiBaseUrl: DEFAULT_API_BASE_URLS.bailian,
          apiKey: bailianKey,
        });
        upscaledItems.push({
          index: index + 1,
          beforeImage: item.image,
          afterImage,
        });
      }
      let nextRecord = {
        ...record,
        upscaledItems,
        upscaledAt: Date.now(),
        upscaleError: "",
        upscaleErrorAt: 0,
      };
      if (historyDirHandle) {
        try {
          const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
          if (canWrite) {
            nextRecord = await saveSplitHistoryToLocalFolder(historyDirHandle, nextRecord);
          }
        } catch {
          // Keep the in-memory upscale result even if folder sync fails.
        }
      }
      setSplitHistoryRecords((prev) => prev.map((item) => ((item.id || item.folderName) === recordId ? nextRecord : item)));
      setSplitStatusTone("info");
      setSplitStatusText(t("split.upscaled", { count: upscaledItems.length }));
    } catch (err) {
      const rawMessage = err?.message || t("common.unknownError");
      const localizedMessage = localizeRuntimeMessage(rawMessage, t);
      const isProxyNetworkError = /failed to fetch|networkerror|load failed/i.test(String(rawMessage));
      const errorText = isProxyNetworkError ? `${localizedMessage} ${t("split.upscaleProxyHint")}` : localizedMessage;
      let nextRecord = {
        ...record,
        upscaledItems: [],
        upscaleError: errorText,
        upscaleErrorAt: Date.now(),
      };
      if (historyDirHandle) {
        try {
          const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
          if (canWrite) {
            nextRecord = await saveSplitHistoryToLocalFolder(historyDirHandle, nextRecord);
          }
        } catch {
          // Keep the visible per-record error even if folder sync fails.
        }
      }
      setSplitHistoryRecords((prev) => prev.map((item) => ((item.id || item.folderName) === recordId ? nextRecord : item)));
      setSplitStatusTone("error");
      setSplitStatusText(
        t("split.upscaleFailed", {
          error: errorText,
        })
      );
    } finally {
      setSplitHistoryUpscalingIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  }, [apiKeys, historyDirHandle, proxyUrl, t]);

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
      setHistoryFolderMsg(t("history.selectImagesFirst"));
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
        setHistoryFolderMsg(t("history.thumbnailFailed"));
        return;
      }
      setAtlasThumbnail(thumbDataUrl);
      setHistoryFolderMsg(t("history.thumbnailReady", { count: ordered.length }));
    } catch (err) {
      setHistoryFolderMsg(t("history.thumbnailFailedDetail", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    } finally {
      setAtlasBusy(false);
    }
  }, [selectedAtlasItems, apiBaseUrl, proxyUrl, t]);

  const exportAtlasSelection = useCallback(async () => {
    if (!historyDirHandle) {
      setHistoryFolderMsg(t("history.selectHistoryFolderFirst"));
      return;
    }
    if (!selectedAtlasItems.length) {
      setHistoryFolderMsg(t("history.selectExportImagesFirst"));
      return;
    }

    setAtlasBusy(true);
    try {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg(t("history.folderWriteDeniedExport"));
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
      setHistoryFolderMsg(t("history.atlasExported", { folder: folderName }));
    } catch (err) {
      setHistoryFolderMsg(t("history.exportFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    } finally {
      setAtlasBusy(false);
    }
  }, [historyDirHandle, selectedAtlasItems, atlasThumbnail, apiBaseUrl, proxyUrl, t]);

  const loadHistoryFromFolder = useCallback(async (dirHandle) => {
    if (!dirHandle) return false;
    const canRead = await ensureDirectoryPermission(dirHandle, false);
    if (!canRead) {
      setHistoryFolderMsg(t("history.folderReadDenied"));
      return false;
    }
    const apiConfig = await loadApiConfigFromLocalFolder(dirHandle);
    const loadedApiKeys = normalizeApiKeys(apiConfig);
    setApiKeys(loadedApiKeys);
    setDraftApiKeys(loadedApiKeys);
    setApiKeySavedAt(apiConfig.exists ? Date.now() : null);
    const loadedGptAssistConfig = await loadGptAssistFromLocalFolder(dirHandle);
    setGptAssistPrompt(loadedGptAssistConfig.prompt);
    setDraftGptAssistPrompt(loadedGptAssistConfig.prompt);
    setGptAssistSendPromptText(loadedGptAssistConfig.sendPromptText);
    setDraftGptAssistSendPromptText(loadedGptAssistConfig.sendPromptText);
    setGptAssistSendPromptImage(loadedGptAssistConfig.sendPromptImage);
    setDraftGptAssistSendPromptImage(loadedGptAssistConfig.sendPromptImage);
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
    const loadedSplitHistory = await loadSplitHistoryFromLocalFolder(dirHandle);
    setSelectedAtlasItems([]);
    setAtlasThumbnail(null);
    setSplitHistoryRecords(consolidateSplitHistoryRecords(loadedSplitHistory));
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
        ? t("history.folderLoadedWithTemplates", {
            turns: loadedTurns.length,
            templates: templatePayload.templates.length,
            styleTemplates: styleTemplatePayload?.templates?.length || MAX_STYLE_TEMPLATES,
          })
        : t("history.folderLoadedInitialized", {
            turns: loadedTurns.length,
            templates: MAX_TEMPLATES,
            styleTemplates: styleTemplatePayload?.templates?.length || MAX_STYLE_TEMPLATES,
          })
    );
    return true;
  }, [t]);

  const handlePickHistoryFolder = useCallback(async (options = {}) => {
    const source = options?.source === "auto" ? "auto" : "manual";
    if (!supportsFileSystemAccess()) {
      setHistoryFolderMsg(t("history.browserUnsupported"));
      return;
    }
    if (isPickingHistoryFolderRef.current) return;
    if (source === "auto") {
      hasAutoPromptedHistoryFolderRef.current = true;
    }
    isPickingHistoryFolderRef.current = true;
    setIsPickingHistoryFolder(true);
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      const loaded = await loadHistoryFromFolder(dirHandle);
      if (!loaded) return;
      setHistoryDirHandle(dirHandle);
      setHistoryDirName(dirHandle.name || "");
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return;
      if (/File picker already active/i.test(String(err?.message || ""))) return;
      setHistoryFolderMsg(t("history.pickFolderFailed", { error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    } finally {
      isPickingHistoryFolderRef.current = false;
      setIsPickingHistoryFolder(false);
    }
  }, [loadHistoryFromFolder, t]);

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
      apiKeys: normalizeApiKeys(apiKeys),
      aspectRatio: normalizeAspectRatio(aspectRatio),
      qwenPromptExtend,
      qwenPromptExtendMode,
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
      setHistoryFolderMsg(t("history.createdTasks", { count: queuedTurns.length }));
    }
    if (taskMode === "compare") {
      compareEditors.slice(0, compareCount).forEach((ed) => ed.setText((prev) => clearPlaceholderValues(prev), { record: false }));
    } else {
      promptEditor.setText((prev) => clearPlaceholderValues(prev), { record: false });
    }
  }, [proxyUrl, selectedModels, modelCounts, taskMode, prompt, comparePrompts, compareCount, compareEditors, styleThemes, styleReferenceImages, apiKeys, apiBaseUrl, aspectRatio, qwenPromptExtend, qwenPromptExtendMode, uploadedInputImages, uploadedImage, promptEditor, t]);

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
    abortTurnTasks(turnId);
    return targetTurn;
  }, [abortTurnTasks, turns]);

  const hideTurn = useCallback((turnId) => {
    removeTurnFromPage(turnId);
  }, [removeTurnFromPage]);

  const deleteTurn = useCallback(async (turnId) => {
    const targetTurn = removeTurnFromPage(turnId);

    if (!historyDirHandle || !targetTurn) return;
    try {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) {
        setHistoryFolderMsg(t("history.folderWriteDeniedDelete"));
        return;
      }
      const dirName = getTurnDirName(targetTurn);
      await historyDirHandle.removeEntry(dirName, { recursive: true });
      setHistoryFolderMsg(t("history.deletedLocal", { seq: targetTurn.seq }));
    } catch (err) {
      setHistoryFolderMsg(t("history.deleteLocalFailed", { seq: targetTurn?.seq || "?", error: localizeRuntimeMessage(err?.message || t("common.unknownError"), t) }));
    }
  }, [historyDirHandle, removeTurnFromPage, t]);

  const reuseTurn = useCallback((turn) => {
    const promptVariants = getTurnPromptVariants(turn);
    const mode = getTurnMode(turn);
    const primaryPrompt = promptVariants[0]?.prompt || turn.prompt || "";
    if (mode === "style") {
      setTaskMode("style");
      const styleBasePrompt =
        typeof turn.styleBasePrompt === "string" && turn.styleBasePrompt.trim()
          ? turn.styleBasePrompt
          : primaryPrompt;
      promptEditor.resetText(styleBasePrompt);
      compareEditors.forEach((ed, i) => ed.resetText(DEFAULT_COMPARE_PROMPTS[i]));
      setCompareCount(2);
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
      const variantCount = Math.max(2, Math.min(MAX_COMPARE_PROMPTS, promptVariants.length));
      setCompareCount(variantCount);
      compareEditors.forEach((ed, i) => ed.resetText(promptVariants[i]?.prompt || ""));
      setStyleThemes(normalizeStyleThemes(DEFAULT_STYLE_THEMES));
      setStyleReferenceImages([]);
    } else {
      setTaskMode("single");
      promptEditor.resetText(primaryPrompt);
      compareEditors.forEach((ed, i) => ed.resetText(DEFAULT_COMPARE_PROMPTS[i]));
      setCompareCount(2);
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
    if (turn.apiKeys && typeof turn.apiKeys === "object") {
      const nextApiKeys = mergeApiKeys(turn.apiKeys, apiKeys);
      setApiKeys(nextApiKeys);
      setDraftApiKeys(nextApiKeys);
    }
    setApiBaseUrl(resolveApiBaseUrl(turn.apiBaseUrl));
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
    activePromptFieldRef.current = mode === "compare" ? 0 : "single";
    setActivePage("workspace");
    setHistoryFolderMsg(t("history.reusedTurn", { seq: turn.seq || "?" }));
    requestAnimationFrame(() => {
      composerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      requestAnimationFrame(() => {
        const targetRef = mode === "compare" ? compareAInputRef : promptInputRef;
        targetRef.current?.focus?.({ end: true, preventScroll: true });
      });
    });
  }, [apiKeys, compareEditors, promptEditor, t]);

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
        await saveGptAssistToLocalFolder(
          historyDirHandle,
          gptAssistPrompt,
          styleThemeAssistPrompt,
          gptAssistSendPromptText,
          gptAssistSendPromptImage
        );
      } catch {}
    })();
  }, [historyDirHandle, gptAssistPrompt, styleThemeAssistPrompt, gptAssistSendPromptText, gptAssistSendPromptImage]);

  useEffect(() => {
    if (!historyDirHandle) return;
    (async () => {
      const canWrite = await ensureDirectoryPermission(historyDirHandle, true);
      if (!canWrite) return;
      try {
        await saveApiConfigToLocalFolder(historyDirHandle, apiKeys);
      } catch {}
    })();
  }, [historyDirHandle, apiKeys]);

  const visibleTurns = turns.filter((turn) => !hiddenTurnIds.includes(turn.id));
  const activeTurn =
    visibleTurns.find((t) => t.id === activeTurnId) ||
    visibleTurns.filter((t) => t.status === "running" || t.status === "queued").sort((a, b) => a.seq - b.seq)[0] ||
    [...visibleTurns].sort((a, b) => b.seq - a.seq)[0] ||
    null;
  const historyTurns = visibleTurns.filter((t) => !activeTurn || t.id !== activeTurn.id).sort((a, b) => b.seq - a.seq);
  const visibleHistory = historyTurns.slice(0, historyLimit);
  const hasMoreHistory = historyTurns.length > historyLimit;
  const previewGalleryItems = useMemo(
    () => [activeTurn, ...visibleHistory].filter(Boolean).flatMap((turn) => buildTurnPreviewItems(turn)),
    [activeTurn, visibleHistory]
  );
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
  const normalizedApiKeys = normalizeApiKeys(apiKeys);
  const normalizedDraftApiKeys = normalizeApiKeys(draftApiKeys);
  const isApiKeyDirty =
    normalizedDraftApiKeys.comet !== normalizedApiKeys.comet ||
    normalizedDraftApiKeys.bailian !== normalizedApiKeys.bailian ||
    normalizedDraftApiKeys.lumina !== normalizedApiKeys.lumina;
  const isGptAssistPromptDirty =
    normalizeGptAssistPrompt(draftGptAssistPrompt) !== normalizeGptAssistPrompt(gptAssistPrompt) ||
    normalizeStyleThemeAssistPrompt(draftStyleThemeAssistPrompt) !== normalizeStyleThemeAssistPrompt(styleThemeAssistPrompt) ||
    normalizeGptAssistFlag(draftGptAssistSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) !== normalizeGptAssistFlag(gptAssistSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) ||
    normalizeGptAssistFlag(draftGptAssistSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE) !== normalizeGptAssistFlag(gptAssistSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  const canSaveGptAssistPrompt = !!historyDirHandle;
  const apiKeySaveStateText = isApiKeyDirty
    ? t("common.unsavedChanges")
    : apiKeySavedAt
    ? t("common.savedAt", { time: formatUiTime(apiKeySavedAt, uiLanguage) })
    : t("common.saved");
  const gptAssistSaveStateText = !historyDirHandle
    ? t("history.selectHistoryFolderFirst")
    : isGptAssistPromptDirty
    ? t("common.unsavedChanges")
    : gptAssistSavedAt
    ? t("common.savedAt", { time: formatUiTime(gptAssistSavedAt, uiLanguage) })
    : t("common.saved");

  const openPreviewImage = useCallback((payload) => {
    if (!payload) {
      setPreviewImage(null);
      return;
    }
    const normalized = normalizePreviewPayload(payload);
    if (!normalized.outputSrc) return;
    if (normalized.imageKey) {
      const galleryIndex = previewGalleryItems.findIndex((item) => item.imageKey === normalized.imageKey);
      if (galleryIndex >= 0) {
        setPreviewImage({
          ...normalized,
          galleryItems: previewGalleryItems,
          currentIndex: galleryIndex,
        });
        return;
      }
    }
    setPreviewImage(normalized);
  }, [previewGalleryItems]);

  const addImageToCanvas = useCallback((payload) => {
    const image = typeof payload?.image === "string" ? payload.image.trim() : "";
    if (!image) return;
    const modelName = typeof payload?.modelName === "string" ? payload.modelName.trim() : "";
    const fileStem = typeof payload?.fileStem === "string" ? payload.fileStem.trim() : "";
    const index = Number(payload?.index) || 0;
    const titleBase = fileStem || modelName || t("canvas.imageNode");
    const requestId = `canvas-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setCanvasImportQueue((prev) => [
      ...prev.slice(-47),
      {
        requestId,
        image,
        title: index > 0 ? `${titleBase} ${index}` : titleBase,
        sourceType: "workspace",
        sourceLabel: "Workspace",
        modelName,
        promptText: typeof payload?.promptText === "string" ? payload.promptText : "",
        turnId: payload?.turnId || "",
        turnSeq: Number(payload?.turnSeq) || 0,
      },
    ]);
    setHistoryFolderMsg(t("workspace.addedToCanvas"));
  }, [t]);

  useEffect(() => {
    if (!folderSupported || historyDirHandle || typeof window === "undefined") return;
    if (hasAutoPromptedHistoryFolderRef.current) return;
    hasAutoPromptedHistoryFolderRef.current = true;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      handlePickHistoryFolder({ source: "auto" });
    });
    return () => {
      cancelled = true;
    };
  }, [folderSupported, handlePickHistoryFolder, historyDirHandle]);

  const splitConsoleProps = {
    sourceImage: splitContext.originalImage || splitContext.sourceImage,
    processImage: splitContext.processImage,
    clusterProcessImage: splitContext.clusterProcessImage,
    absorbedProcessImage: splitContext.absorbedProcessImage,
    modelName: splitContext.modelName,
    promptText: splitContext.promptText,
    splitItems: splitContext.items,
    baseItemCount: Array.isArray(splitContext.baseItems) && splitContext.baseItems.length ? splitContext.baseItems.length : splitContext.items.length,
    splitOnRemoved: splitUseRemovedSource,
    selectedItemIds: splitSelectedItemIds,
    enhanceEnabled: splitEnhanceEnabled,
    renderMode: splitRenderMode,
    shapeMode: splitShapeMode,
    groupMode: splitGroupMode,
    canUndo: splitUndoStack.length > 0,
    busy: splitBusy,
    enhancing: splitEnhancing,
    exporting: splitExporting,
    timing: splitTiming,
    statusText: splitStatusText,
    statusTone: splitStatusTone,
    historyRecords: splitHistoryRecords,
    historyDirName,
    historyUpscalingIds: splitHistoryUpscalingIds,
    onToggleSplitSource: toggleSplitSourceMode,
    onResplit: reSplitCurrentImage,
    onSetRenderMode: setSplitRenderModeMode,
    onSetShapeMode: setSplitShapeModeMode,
    onSetGroupMode: setSplitGroupModeMode,
    onSetEnhanceEnabled: setSplitEnhanceMode,
    onToggleSelectItem: toggleSplitItemSelected,
    onMergeSelectedItems: mergeSelectedSplitItems,
    onDeleteItem: deleteSplitItem,
    onUndoDelete: undoDeleteSplitItem,
    onExport: exportSplitItems,
    onPreview: openPreviewImage,
    onUploadImageDataUrl: uploadSplitImageFromModal,
    onPickHistoryFolder: () => handlePickHistoryFolder({ source: "manual" }),
    onUpscaleHistory: upscaleSplitHistoryRecord,
  };

  return (
    <I18nContext.Provider value={{ uiLanguage, t }}>
    <div style={{ ...S.root, fontWeight: uiLanguage === "zh" ? 360 : undefined }}>
      <div style={S.bgGrain} />
      <header style={S.header}>
        <div style={S.logoArea}>
          <div style={S.logoCube}><span style={{ fontSize: 20 }}>◈</span></div>
          <div>
            <h1 style={S.title}>POLYIMAGE</h1>
            <p style={S.subtitle}>{t("header.subtitle")}</p>
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
              {t("nav.single")}
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "compare" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("compare");
              }}
            >
              {t("nav.compare")}
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "workspace" && taskMode === "style" ? S.modeTabActive : null) }}
              onClick={() => {
                setActivePage("workspace");
                setTaskMode("style");
              }}
            >
              {t("nav.style")}
            </button>
            <button
              type="button"
              style={{ ...S.modeTab, ...(activePage === "split" ? S.modeTabActive : null) }}
              onClick={() => {
                setSplitGroupMode("cluster");
                setActivePage("split");
              }}
            >
              {t("nav.split")}
            </button>
            {SHOW_CANVAS_TAB && (
              <button
                type="button"
                style={{ ...S.modeTab, ...(activePage === "canvas" ? S.modeTabActive : null) }}
                onClick={() => setActivePage("canvas")}
              >
                {t("nav.canvas")}
              </button>
            )}
          </nav>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(activePage === "help" ? S.apiSwitchBtnActive : null) }}
              onClick={() => setActivePage("help")}
            >
              {t("nav.help")}
            </button>
          </div>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(showGptAssistModal ? S.apiSwitchBtnActive : null) }}
              onClick={() => {
                setDraftGptAssistPrompt(gptAssistPrompt);
                setDraftGptAssistSendPromptText(gptAssistSendPromptText);
                setDraftGptAssistSendPromptImage(gptAssistSendPromptImage);
                setDraftStyleThemeAssistPrompt(styleThemeAssistPrompt);
                setShowGptAssistModal(true);
              }}
            >
              {t("nav.gptPrompt")}
            </button>
          </div>
          <div style={S.apiSwitchWrap}>
            <button
              type="button"
              style={{ ...S.apiSwitchBtn, ...(showApiModal ? S.apiSwitchBtnActive : null) }}
              onClick={() => {
                setDraftApiKeys(normalizeApiKeys(apiKeys));
                setShowApiModal(true);
              }}
            >
              {t("nav.api")}
            </button>
          </div>
          <button style={S.settingsBtn} onClick={() => setShowSettings(true)}>⚙</button>
        </div>
      </header>

      <main style={
        activePage === "canvas"
          ? { ...S.main, maxWidth: "min(1760px, calc(100vw - 28px))", padding: "18px 14px 44px" }
          : activePage === "split"
            ? { ...S.main, maxWidth: "min(1280px, calc(100vw - 28px))", padding: "18px 14px 44px" }
            : S.main
      }>
        <div style={activePage === "help" ? undefined : { display: "none" }}>
          <HelpPage />
        </div>
        <div style={activePage === "canvas" ? { position: "relative" } : { display: "none" }}>
          <CanvasPage
            visible={activePage === "canvas"}
            turns={turns}
            activeTurnId={activeTurnId}
            externalImportQueue={canvasImportQueue}
            templates={templates}
            styleTemplates={styleTemplates}
            historyDirHandle={historyDirHandle}
            historyDirName={historyDirName}
            onPickHistoryFolder={handlePickHistoryFolder}
            selectedModels={selectedModels}
            apiKeys={apiKeys}
            apiBaseUrl={apiBaseUrl}
            proxyUrl={proxyUrl}
            aspectRatio={aspectRatio}
            qwenPromptExtend={qwenPromptExtend}
            qwenPromptExtendMode={qwenPromptExtendMode}
            onOpenSplitNode={openSplitModalForCanvasNode}
          />
        </div>
        <div style={activePage === "split" ? undefined : { display: "none" }}>
          <SpriteSplitModal
            show={activePage === "split"}
            embedded
            onClose={() => setActivePage("workspace")}
            {...splitConsoleProps}
          />
        </div>
        <div style={activePage === "workspace" ? undefined : { display: "none" }}>
        <section ref={composerSectionRef} style={{ marginBottom: 24 }}>
          <div style={taskMode === "style" ? S.inputGridStyle : S.inputGrid}>
            <div>
              <div style={S.promptHead}>
                <label style={{ ...S.label, marginBottom: 0 }}>{taskMode === "compare" ? t("workspace.prompts") : t("workspace.prompt")}</label>
                <div style={S.promptHeadActions}>
                  {taskMode === "compare" && <span style={S.inputHint}>{t("workspace.compareHint")}</span>}
                  <button
                    type="button"
                    style={S.placeholderBtn}
                    onClick={insertPlaceholderChip}
                    title={t("template.insertPlaceholder")}
                  >
                    【】
                  </button>
                  <button
                    type="button"
                    style={{ ...S.gptAssistBtn, opacity: canRunGptAssist ? 1 : 0.5, cursor: canRunGptAssist ? "pointer" : "not-allowed" }}
                    onClick={runGptAssist}
                    disabled={!canRunGptAssist}
                    title={hasPlaceholderInComposer ? t("workspace.rewriteByGpt") : t("workspace.noPlaceholder")}
                  >
                    👤
                  </button>
                </div>
              </div>
              {taskMode === "compare" ? (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(compareCount, 2)}, minmax(0, 1fr))`, gap: 12 }}>
                  {Array.from({ length: compareCount }, (_, i) => {
                    const placeholderKeys = ["workspace.promptAPlaceholder", "workspace.promptBPlaceholder", "workspace.promptCPlaceholder", "workspace.promptDPlaceholder"];
                    return (
                      <div key={i} style={{ position: "relative" }}>
                        {compareCount > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              for (let j = i; j < compareCount - 1; j++) {
                                compareEditors[j].resetText(comparePrompts[j + 1] || "");
                              }
                              compareEditors[compareCount - 1].resetText("");
                              setCompareCount((c) => c - 1);
                            }}
                            style={{ position: "absolute", top: 6, right: 6, zIndex: 4, width: 18, height: 18, borderRadius: 9, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, lineHeight: "16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                            title="Remove"
                          >
                            ×
                          </button>
                        )}
                        <TokenPromptInput
                          value={comparePrompts[i]}
                          onChange={(next) => updateComparePrompt(i, next)}
                          onKeyDown={compareEditors[i].handleKeyDown}
                          onFocus={() => { activePromptFieldRef.current = i; }}
                          editorRef={compareInputRefs[i]}
                          placeholder={t(placeholderKeys[i])}
                          rows={4}
                        />
                      </div>
                    );
                  })}
                  {compareCount < MAX_COMPARE_PROMPTS && (
                    <button
                      type="button"
                      onClick={() => setCompareCount(MAX_COMPARE_PROMPTS)}
                      style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "center", height: 32, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.35)", fontSize: 20, lineHeight: 1, cursor: "pointer", transition: "border-color 0.15s, color 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
                    >
                      +
                    </button>
                  )}
                </div>
              ) : (
                <TokenPromptInput
                  value={prompt}
                  onChange={(next) => promptEditor.setText(next)}
                  onKeyDown={promptEditor.handleKeyDown}
                  onFocus={() => { activePromptFieldRef.current = "single"; }}
                  editorRef={promptInputRef}
                  placeholder={t("workspace.promptPlaceholder")}
                  rows={4}
                />
              )}
            </div>
            <div style={S.refColumn}>
              {taskMode === "style" ? (
                <>
                  <div style={S.uploadPairRow}>
                    <div style={S.uploadPairCol}>
                      <div style={S.uploadPairTopLabel}>{t("workspace.reference")} ({styleImageList.length}/{MAX_STYLE_REFERENCE_IMAGES})</div>
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
                      <div style={S.uploadPairTopLabel}>{t("workspace.input")}</div>
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
                            {t("common.edit")}
                          </button>
                        )}
                        {canEditInputImages && (
                          <button
                            type="button"
                            style={S.inputDrawBtn}
                            onClick={(event) => {
                              event.stopPropagation();
                              openInputImageEditor(0);
                            }}
                            title={t("imageEditor.title")}
                          >
                            ✎
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
                  <label style={S.label}>{t("workspace.referenceImage")}</label>
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
                          {t("common.edit")}
                        </button>
                      )}
                      {canEditInputImages && (
                        <button
                          type="button"
                          style={S.inputDrawBtn}
                          onClick={(event) => {
                            event.stopPropagation();
                            openInputImageEditor(0);
                          }}
                          title={t("imageEditor.title")}
                        >
                          ✎
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
                      <span style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{t("common.upload")}</span>
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
                  {t("workspace.models")} <span style={{ color: "#888", fontWeight: 400 }}>({selectedModels.length}/{taskMode === "style" ? 1 : 6})</span>
                </label>
                <button style={S.syncBtn} onClick={syncSelectedCounts} disabled={!selectedModels.length}>
                  {t("workspace.syncCount")}
                </button>
              </div>
              <div style={taskMode === "style" ? S.modelGridStyle : S.modelGrid}>
                {IMAGE_MODEL_ROWS.map((row, rowIndex) => (
                  <div
                    key={`model-row-${rowIndex + 1}`}
                    style={{ ...S.modelGridRow, gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                  >
                    {row.map((m) => (
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
                ))}
              </div>
              <div style={S.imageSizePanel}>
                <div style={S.imageSizeHeadRow}>
                  <label style={{ ...S.label, marginBottom: 0 }}>{t("workspace.imageRatio")}</label>
                  <label style={S.promptExtendToggle}>
                    <input
                      type="checkbox"
                      checked={qwenPromptExtend}
                      onChange={(event) => setQwenPromptExtend(event.target.checked)}
                    />
                    <span>{t("workspace.qwenPromptExtend")}</span>
                  </label>
                  <select
                    value={qwenPromptExtendMode}
                    onChange={(event) => setQwenPromptExtendMode(event.target.value)}
                    style={S.promptExtendModeSelect}
                    disabled={!qwenPromptExtend}
                    title={t("workspace.qwenPromptExtendMode")}
                  >
                    <option value="direct">DPE</option>
                    <option value="agent">APE</option>
                  </select>
                </div>
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
                <label style={{ ...S.label, marginBottom: 0 }}>{taskMode === "style" ? t("workspace.styleTemplates") : t("workspace.templates")}</label>
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
                        <span style={S.templateItemTitle}>{getLocalizedTemplateTitle(item.title, item.id, uiLanguage, true)}</span>
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
                          title={t("template.editStyle")}
                        >
                            ✎
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={S.styleThemesPanel}>
                    <div style={S.styleThemesHeadRow}>
                      <label style={{ ...S.label, marginBottom: 0 }}>{t("workspace.themes")}</label>
                      <button
                        type="button"
                        style={{ ...S.zipBtn, padding: "6px 10px", fontSize: 11, opacity: hasAnyStyleThemeValue ? 1 : 0.5, cursor: hasAnyStyleThemeValue ? "pointer" : "not-allowed" }}
                        onClick={clearAllStyleThemes}
                        disabled={!hasAnyStyleThemeValue}
                      >
                        {t("workspace.clearAll")}
                      </button>
                    </div>
                    <div style={S.styleThemeAssistRow}>
                      <input
                        style={S.styleThemeAssistInput}
                        value={styleThemeSeedInput}
                        onChange={(event) => setStyleThemeSeedInput(event.target.value)}
                        placeholder={t("workspace.themeSeedPlaceholder")}
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
                          placeholder={t("workspace.themePlaceholder", { index: index + 1 })}
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
                      <span style={S.templateItemTitle}>{getLocalizedTemplateTitle(item.title, item.id, uiLanguage, false)}</span>
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
                          title={t("template.edit")}
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
            {isProcessing
              ? <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={S.btnSpin} /> {t("workspace.runningQueued", { running: runningCount, queued: queueCount })}</span>
              : taskMode === "compare"
              ? t("workspace.enqueueCompare")
              : taskMode === "style"
              ? t("workspace.enqueueStyle")
              : t("workspace.enqueueTask")}
          </button>
          {hasAnySuccess && <button style={S.zipBtn} onClick={() => downloadAllAsZip(turns)}>{t("workspace.downloadAll")}</button>}
        </div>
        <div style={S.folderRow}>
          <button
            style={S.zipBtn}
            onClick={() => handlePickHistoryFolder({ source: "manual" })}
            disabled={!folderSupported || isPickingHistoryFolder}
          >
            {historyDirHandle ? t("workspace.switchHistoryFolder") : t("workspace.selectHistoryFolder")}
          </button>
          {historyDirHandle && (
            <button style={S.zipBtn} onClick={() => loadHistoryFromFolder(historyDirHandle)}>
              {t("workspace.reloadHistory")}
            </button>
          )}
          <span style={S.folderHint}>
            {folderSupported
              ? historyDirName
                ? t("workspace.connected", { name: historyDirName })
                : t("workspace.noFolderSelected")
              : t("workspace.folderUnsupported")}
          </span>
        </div>
        <div style={S.atlasRow}>
          <span style={S.atlasCount}>{t("workspace.selectedCount", { count: selectedAtlasItems.length, max: MAX_ATLAS_SELECTED_IMAGES })}</span>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: selectedAtlasItems.length ? 1 : 0.5, cursor: selectedAtlasItems.length ? "pointer" : "not-allowed" }}
            onClick={clearAllSelections}
            disabled={!selectedAtlasItems.length || atlasBusy}
          >
            {t("workspace.clearSelections")}
          </button>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: historyDirHandle && selectedAtlasItems.length ? 1 : 0.5, cursor: historyDirHandle && selectedAtlasItems.length ? "pointer" : "not-allowed" }}
            onClick={exportAtlasSelection}
            disabled={!historyDirHandle || !selectedAtlasItems.length || atlasBusy}
          >
            {t("workspace.exportAtlas")}
          </button>
          {taskMode === "style" && (
            <button
              type="button"
              style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: selectedAtlasItems.length ? 1 : 0.5, cursor: selectedAtlasItems.length ? "pointer" : "not-allowed" }}
              onClick={() => setShowAtlasThumbnailModal(true)}
              disabled={!selectedAtlasItems.length || atlasBusy}
            >
              {t("workspace.thumbnail")}
            </button>
          )}
          {atlasThumbnail && (
            <button
              type="button"
              style={S.atlasThumbBtn}
              onClick={() => setShowAtlasThumbnailModal(true)}
              title={t("atlas.openEditor")}
            >
              <img src={atlasThumbnail} alt={t("workspace.thumbnail")} style={S.atlasThumbImg} />
            </button>
          )}
        </div>
        {!!historyFolderMsg && <div style={S.folderMsg}>{historyFolderMsg}</div>}

        {activeTurn && (
          <section style={{ animation: "fadeIn 0.3s ease", marginBottom: 24 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              {t("workspace.currentDialog")}
            </h3>
            <TurnPanel
              turn={activeTurn}
              onPreview={openPreviewImage}
              onCancelModel={cancelModelTask}
              onDelete={deleteTurn}
              onReuse={reuseTurn}
              onHide={hideTurn}
              onSyncTemplate={syncTurnToTemplate}
              canSyncTemplate={templatesEnabled && (getTurnMode(activeTurn) === "style" ? !!activeStyleTemplateId : !!activeTemplateId)}
              onAddToCanvasImage={addImageToCanvas}
              selectedImageKeys={selectedImageKeys}
              onToggleImageSelect={toggleImageSelection}
              onRetryImage={retryImage}
              onAppendImage={appendResultImage}
              onSplitImage={openSplitModalForImage}
              retryingImageKeys={retryingImageKeys}
              splittingImageKeys={splittingImageKeys}
              compactStyleHistory={false}
              truncatePromptText={false}
              showModelSummary={true}
              enableInlineReferenceViewer={true}
            />
          </section>
        )}

        {historyTurns.length > 0 && (
          <section style={{ marginTop: 8 }}>
            <h3 style={{ fontSize: 12, fontFamily: mono, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: "#888", margin: "0 0 8px" }}>
              {t("workspace.historyDialogs")}
            </h3>
            <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.4)", padding: 12 }}>
              {visibleHistory.map((turn) => (
                <div key={turn.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <TurnPanel
                    turn={turn}
                    onPreview={openPreviewImage}
                    onCancelModel={cancelModelTask}
                    onDelete={deleteTurn}
                    onReuse={reuseTurn}
                    onHide={hideTurn}
                    onSyncTemplate={syncTurnToTemplate}
                    canSyncTemplate={templatesEnabled && (getTurnMode(turn) === "style" ? !!activeStyleTemplateId : !!activeTemplateId)}
                    onAddToCanvasImage={addImageToCanvas}
                    selectedImageKeys={selectedImageKeys}
                    onToggleImageSelect={toggleImageSelection}
                    onRetryImage={retryImage}
                    onAppendImage={appendResultImage}
                    onSplitImage={openSplitModalForImage}
                    retryingImageKeys={retryingImageKeys}
                    splittingImageKeys={splittingImageKeys}
                    compactStyleHistory={false}
                    truncatePromptText={true}
                    showModelSummary={false}
                    enableInlineReferenceViewer={true}
                  />
                </div>
              ))}
              {hasMoreHistory && (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                  <button style={S.zipBtn} onClick={() => setHistoryLimit((n) => n + 4)}>{t("workspace.loadMore")}</button>
                </div>
              )}
            </div>
          </section>
        )}
        </div>
      </main>

      <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} proxyUrl={proxyUrl} setProxyUrl={setProxyUrl} uiLanguage={uiLanguage} setUiLanguage={setUiLanguage} />
      <ApiKeyModal
        show={showApiModal}
        onClose={() => setShowApiModal(false)}
        apiKeys={apiKeys}
        draftApiKeys={draftApiKeys}
        setDraftApiKeys={setDraftApiKeys}
        onSave={handleSaveApiKey}
        saveStateText={apiKeySaveStateText}
      />
      <GptAssistModal
        show={showGptAssistModal}
        onClose={() => setShowGptAssistModal(false)}
        prompt={gptAssistPrompt}
        draftPrompt={draftGptAssistPrompt}
        setDraftPrompt={setDraftGptAssistPrompt}
        sendPromptText={gptAssistSendPromptText}
        draftSendPromptText={draftGptAssistSendPromptText}
        setDraftSendPromptText={setDraftGptAssistSendPromptText}
        sendPromptImage={gptAssistSendPromptImage}
        draftSendPromptImage={draftGptAssistSendPromptImage}
        setDraftSendPromptImage={setDraftGptAssistSendPromptImage}
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
        title={t("images.inputTitle")}
        images={inputImageList}
        maxCount={MAX_INPUT_IMAGES_PER_BATCH}
        onUploadFiles={appendInputImageFiles}
        onRemoveAt={removeInputImageAt}
      />
      <PromptImageEditorModal
        show={showInputImageEditor}
        onClose={() => setShowInputImageEditor(false)}
        images={inputImageList}
        initialIndex={inputImageEditorIndex}
        onConfirm={confirmInputImageEditor}
      />
      <InputImagesModal
        show={showStyleReferenceModal}
        onClose={() => setShowStyleReferenceModal(false)}
        title={t("images.referenceTitle")}
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
        onPreview={openPreviewImage}
      />
      <SpriteSplitModal
        show={showSplitModal && activePage !== "split"}
        onClose={() => {
          setShowSplitModal(false);
          setSplitStatusText("");
          setSplitStatusTone("info");
        }}
        {...splitConsoleProps}
      />
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500&display=swap');
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
    </I18nContext.Provider>
  );
}
