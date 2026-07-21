import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { IMAGE_MODELS, PROVIDER_COLORS } from "../../config/appConfig";
import {
  formatUiDateTime,
  getLocalizedPromptLabel,
  getLocalizedStatusLabel,
  localizeRuntimeMessage,
  useI18n,
} from "../../i18n";
import { getRuntimeConfig } from "../../services/runtimeConfig";
import {
  buildResultFileStem,
  buildTurnImageKey,
  buildTurnTaskKey,
  buildWorkerImageProxyUrl,
  downloadDataUrl,
  downloadImageUrl,
  getFilledPlaceholderTokens,
  getResultPromptKey,
  getTurnMode,
  getTurnPromptVariants,
  normalizeImageValue,
  proxyFetchImageAsDataUrl,
} from "../../services/appCore";
import { mono, S } from "../../styles/appStyles";
import { getPromptPreviewText, PromptTextWithChips } from "../workspace/promptControls";

export function ImageActionBar({
  onSave,
  onRetry,
  onAppend,
  onAddToCanvas,
  compact = false,
  busy = false,
  allowSave = true,
}) {
  const { t } = useI18n();
  const buttonStyle = compact ? S.imageActionBtnCompact : S.imageActionBtn;
  const iconStyle = compact ? S.imageActionIconCompact : S.imageActionIcon;
  const plusStyle = compact ? S.imageActionPlusCompact : S.imageActionPlus;
  const hasCanvasAction = typeof onAddToCanvas === "function";
  return (
    <div
      style={{
        ...S.imageActionBar,
        gridTemplateColumns: `repeat(${hasCanvasAction ? 4 : 3}, minmax(0, 1fr))`,
        ...(compact ? S.imageActionBarCompact : null),
      }}
    >
      <button
        type="button"
        style={{ ...buttonStyle, ...(allowSave ? null : S.imageActionBtnDisabled) }}
        onClick={onSave}
        disabled={!allowSave}
        title={t("action.save")}
      >
        <span style={iconStyle}>↓</span>
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, ...(busy ? S.imageActionBtnBusy : null) }}
        onClick={onRetry}
        disabled={busy || typeof onRetry !== "function"}
        title={t("action.retry")}
      >
        <span style={iconStyle}>↻</span>
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, ...(busy ? S.imageActionBtnBusy : null) }}
        onClick={onAppend}
        disabled={busy || typeof onAppend !== "function"}
        title={t("action.addOne")}
      >
        <span style={plusStyle}>+1</span>
      </button>
      {hasCanvasAction && (
        <button
          type="button"
          style={{ ...buttonStyle, ...(busy ? S.imageActionBtnBusy : null) }}
          onClick={onAddToCanvas}
          disabled={busy}
          title={t("action.addToCanvas")}
        >
          <span style={iconStyle}>□</span>
        </button>
      )}
    </div>
  );
}

export function normalizePreviewTokens(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function normalizePreviewItem(value) {
  if (!value) {
    return {
      outputSrc: "",
      inputSrc: "",
      inputTokens: [],
      imageKey: "",
      modelName: "",
      promptText: "",
    };
  }
  if (typeof value === "string") {
    return {
      outputSrc: normalizeImageValue(value),
      inputSrc: "",
      inputTokens: [],
      imageKey: "",
      modelName: "",
      promptText: "",
    };
  }
  const outputSrc = normalizeImageValue(value?.outputSrc ?? value?.src ?? value?.image ?? "");
  const inputSrc = normalizeImageValue(value?.inputSrc ?? value?.referenceImage ?? "");
  return {
    outputSrc,
    inputSrc: inputSrc && inputSrc !== outputSrc ? inputSrc : "",
    inputTokens: normalizePreviewTokens(value?.inputTokens ?? value?.promptTokens),
    imageKey: typeof value?.imageKey === "string" ? value.imageKey : "",
    modelName: typeof value?.modelName === "string" ? value.modelName.trim() : "",
    promptText: typeof value?.promptText === "string" ? value.promptText.trim() : "",
    meta: value?.meta && typeof value.meta === "object" ? value.meta : null,
  };
}

// 汇总一张图的完整元信息，供预览大图里的信息面板展示。
// turn 提供生成参数（比例 / 提示词加强 / 参考图），result 提供模型与实际走的平台/时间。
export function buildPreviewMeta(turn, resultLike) {
  if (!resultLike) return null;
  const modelId = typeof resultLike.modelId === "string" ? resultLike.modelId : "";
  const model = IMAGE_MODELS.find((m) => m.id === modelId) || null;
  const referenceCount =
    (normalizeImageValue(turn?.referenceImage) ? 1 : 0) +
    (Array.isArray(turn?.styleReferenceImages)
      ? turn.styleReferenceImages.filter((img) => normalizeImageValue(img)).length
      : 0);
  const isBailian = model?.apiType === "bailian";
  return {
    modelId,
    modelName:
      (typeof resultLike.modelName === "string" && resultLike.modelName.trim()) ||
      model?.name ||
      modelId,
    provider: model?.provider || "",
    apiPlatform: typeof resultLike.apiPlatform === "string" ? resultLike.apiPlatform : "",
    generatedAt: Number(resultLike.generatedAt) || 0,
    createdAt: Number(turn?.createdAt) || 0,
    aspectRatio: (typeof turn?.aspectRatio === "string" && turn.aspectRatio) || turn?.geminiAspectRatio || "",
    requestedCount: Math.max(1, Number(resultLike.requestedCount) || 1),
    promptExtend: isBailian ? turn?.qwenPromptExtend !== false : null,
    promptExtendMode: isBailian ? turn?.qwenPromptExtendMode || "" : "",
    referenceCount,
    promptText: typeof resultLike.promptText === "string" ? resultLike.promptText : "",
  };
}

export function normalizePreviewPayload(value) {
  const base = normalizePreviewItem(value);
  const galleryItems = Array.isArray(value?.galleryItems)
    ? value.galleryItems.map((item) => normalizePreviewItem(item)).filter((item) => item.outputSrc)
    : [];
  const fallbackIndex = base.imageKey ? galleryItems.findIndex((item) => item.imageKey === base.imageKey) : -1;
  const requestedIndex = Number(value?.currentIndex);
  const currentIndex = galleryItems.length
    ? Math.max(
        0,
        Math.min(
          galleryItems.length - 1,
          Number.isFinite(requestedIndex)
            ? requestedIndex
            : fallbackIndex >= 0
            ? fallbackIndex
            : 0
        )
      )
    : 0;
  return {
    ...base,
    galleryItems,
    currentIndex,
  };
}

function getPreviewTokens(promptText = "", promptLabel = "", promptKey = "") {
  const placeholderTokens = getFilledPlaceholderTokens(promptText);
  if (placeholderTokens.length) return placeholderTokens;
  const safeLabel = typeof promptLabel === "string" ? promptLabel.trim() : "";
  return /^theme-\d+$/i.test(String(promptKey || "")) && safeLabel ? [safeLabel] : [];
}

function getPreviewModelName(modelId = "", modelName = "") {
  const safeModelName = typeof modelName === "string" ? modelName.trim() : "";
  if (safeModelName) return safeModelName;
  const normalizedModelId = typeof modelId === "string" ? modelId.trim() : "";
  if (!normalizedModelId) return "";
  return IMAGE_MODELS.find((model) => model.id === normalizedModelId)?.name || normalizedModelId;
}

function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (success) resolve();
      else reject(new Error("copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}

function getImagePixelPoint(image, event) {
  if (!image?.naturalWidth || !image?.naturalHeight) return null;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = Math.max(0, Math.min(image.naturalWidth - 1, Math.floor(((event.clientX - rect.left) / rect.width) * image.naturalWidth)));
  const y = Math.max(0, Math.min(image.naturalHeight - 1, Math.floor(((event.clientY - rect.top) / rect.height) * image.naturalHeight)));
  return { x, y };
}

function readImagePixelColorFromImage(image, x, y) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
  return {
    text: `rgb(${r}, ${g}, ${b})`,
    swatch: `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`,
  };
}

function loadPickerImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function readImagePixelColor(image, point, sourceUrl = "") {
  try {
    return readImagePixelColorFromImage(image, point.x, point.y);
  } catch (err) {
    const proxied = await proxyFetchImageAsDataUrl(getRuntimeConfig().proxyUrl || "", sourceUrl || image.currentSrc || image.src);
    if (!proxied?.startsWith?.("data:image/")) throw err;
    const safeImage = await loadPickerImage(proxied);
    const x = Math.max(0, Math.min(safeImage.naturalWidth - 1, Math.floor((point.x / image.naturalWidth) * safeImage.naturalWidth)));
    const y = Math.max(0, Math.min(safeImage.naturalHeight - 1, Math.floor((point.y / image.naturalHeight) * safeImage.naturalHeight)));
    return readImagePixelColorFromImage(safeImage, x, y);
  }
}

function getColorMarkerStyle(sample, imageRef, panelRef) {
  const image = imageRef.current;
  const panel = panelRef.current;
  if (!sample || !image || !panel) return null;
  const imageRect = image.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  if (!imageRect.width || !imageRect.height) return null;
  return {
    ...S.viewerColorMarker,
    left: imageRect.left - panelRect.left + sample.xRatio * imageRect.width,
    top: imageRect.top - panelRect.top + sample.yRatio * imageRect.height,
  };
}

export function PreviewMetaBar({ modelName = "", promptText = "", inline = false, onPromptClick }) {
  const { t } = useI18n();
  const safeModelName = typeof modelName === "string" ? modelName.trim() : "";
  const safePromptText = typeof promptText === "string" ? promptText.trim() : "";
  if (!safeModelName && !safePromptText) return null;
  return (
    <div style={{ ...S.viewerMetaBar, ...(inline ? S.viewerMetaBarInline : null) }}>
      {!!safeModelName && <div style={S.viewerMetaChip} title={safeModelName}>{safeModelName}</div>}
      {!!safePromptText && (
        <button
          type="button"
          style={S.viewerPromptBtn}
          onClick={(event) => {
            event.stopPropagation();
            onPromptClick?.(safePromptText);
          }}
          title={t("viewer.promptButton")}
          aria-label={t("viewer.promptButton")}
        >
          T
        </button>
      )}
    </div>
  );
}

export function buildTurnPreviewItems(turn) {
  if (!turn) return [];
  const promptVariants = getTurnPromptVariants(turn);
  const promptLookup = new Map(promptVariants.map((variant) => [variant.key, variant]));
  const selectedModelIds = Array.isArray(turn?.selectedModelIds) ? turn.selectedModelIds : [];
  const modelOrder = new Map(selectedModelIds.map((id, index) => [id, index]));
  const promptVariantOrder = new Map(promptVariants.map((variant, index) => [variant.key, index]));
  const previewInputImage =
    normalizeImageValue(turn?.referenceImage) ||
    normalizeImageValue(Array.isArray(turn?.styleReferenceImages) ? turn.styleReferenceImages[0] : "");
  const mode = getTurnMode(turn);

  if (mode === "style") {
    return (Array.isArray(turn?.results) ? turn.results : [])
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
      .flatMap((result) => {
        const promptKey = getResultPromptKey(result);
        const promptText =
          typeof result?.promptText === "string"
            ? result.promptText
            : promptLookup.get(promptKey)?.prompt || turn?.prompt || "";
        const inputTokens = getPreviewTokens(
          promptText,
          result?.promptLabel || promptLookup.get(promptKey)?.label || "",
          promptKey
        );
        const images = Array.isArray(result?.images) ? result.images : [];
        const meta = buildPreviewMeta(turn, { ...result, promptText });
        return images.map((image, index) => ({
          imageKey: buildTurnImageKey(turn.id, result.modelId, promptKey, index + 1),
          outputSrc: normalizeImageValue(image),
          inputSrc: previewInputImage,
          inputTokens,
          modelName: getPreviewModelName(result?.modelId, result?.modelName),
          promptText,
          meta,
        }));
      })
      .filter((item) => item.outputSrc);
  }

  return promptVariants
    .flatMap((variant) =>
      (Array.isArray(turn?.results) ? turn.results : [])
        .filter((result) => getResultPromptKey(result) === variant.key)
        .slice()
        .sort((a, b) => {
          const ai = modelOrder.has(a.modelId) ? modelOrder.get(a.modelId) : Number.MAX_SAFE_INTEGER;
          const bi = modelOrder.has(b.modelId) ? modelOrder.get(b.modelId) : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return String(a.modelId).localeCompare(String(b.modelId));
        })
        .flatMap((result) => {
          const promptText =
            typeof result?.promptText === "string"
              ? result.promptText
              : promptLookup.get(variant.key)?.prompt || turn?.prompt || "";
          const inputTokens = getPreviewTokens(
            promptText,
            result?.promptLabel || promptLookup.get(variant.key)?.label || "",
            variant.key
          );
          const images = Array.isArray(result?.images) ? result.images : [];
          const meta = buildPreviewMeta(turn, { ...result, promptText });
          return images.map((image, index) => ({
            imageKey: buildTurnImageKey(turn.id, result.modelId, variant.key, index + 1),
            outputSrc: normalizeImageValue(image),
            inputSrc: previewInputImage,
            inputTokens,
            modelName: getPreviewModelName(result?.modelId, result?.modelName),
            promptText,
            meta,
          }));
        })
    )
    .filter((item) => item.outputSrc);
}

const PLATFORM_LABEL_KEYS = {
  comet: "viewer.platformComet",
  lumina: "viewer.platformLumina",
  bailian: "viewer.platformBailian",
};

export function PreviewInfoPanel({ meta, onClose, onCopyPrompt, docked = false }) {
  const { uiLanguage, t } = useI18n();
  if (!meta) return null;
  const platformLabel = meta.apiPlatform
    ? t(PLATFORM_LABEL_KEYS[meta.apiPlatform] || "viewer.platformUnknown")
    : t("viewer.platformUnknown");
  // 俗名一排（如 NanoBanana 2），正式名/模型 ID 一排（如 gemini-3.1-flash-image）。
  const commonName = meta.provider ? `${meta.modelName} · ${meta.provider}` : meta.modelName || "-";
  const formalName = meta.modelId && meta.modelId !== meta.modelName ? meta.modelId : "";
  const generatedText = meta.generatedAt
    ? formatUiDateTime(meta.generatedAt, uiLanguage)
    : meta.createdAt
    ? formatUiDateTime(meta.createdAt, uiLanguage)
    : "-";
  const aspectText = !meta.aspectRatio || meta.aspectRatio === "auto" ? t("viewer.aspectAuto") : meta.aspectRatio;
  const promptText = typeof meta.promptText === "string" ? meta.promptText.trim() : "";
  const rows = [
    { key: "model", label: t("viewer.infoModel"), value: commonName },
  ];
  if (formalName) {
    rows.push({ key: "modelId", label: t("viewer.infoModelId"), value: formalName });
  }
  rows.push(
    { key: "platform", label: t("viewer.infoPlatform"), value: platformLabel },
    { key: "time", label: t("viewer.infoTime"), value: generatedText },
    { key: "aspect", label: t("viewer.infoAspect"), value: aspectText },
    { key: "count", label: t("viewer.infoCount"), value: `x${meta.requestedCount}` },
  );
  if (meta.referenceCount > 0) {
    rows.push({ key: "ref", label: t("viewer.infoReference"), value: `${meta.referenceCount}` });
  }
  if (meta.promptExtend !== null && meta.promptExtend !== undefined) {
    rows.push({
      key: "extend",
      label: t("viewer.infoPromptExtend"),
      value: meta.promptExtend
        ? meta.promptExtendMode === "agent"
          ? t("viewer.promptExtendAgent")
          : t("viewer.promptExtendDirect")
        : t("common.off"),
    });
  }
  return (
    <div style={docked ? S.viewerInfoPanelDocked : S.viewerInfoPanel} onClick={(event) => event.stopPropagation()}>
      <div style={S.viewerInfoHeader}>
        <span style={S.viewerInfoTitle}>{t("viewer.infoPanel")}</span>
        <button type="button" style={S.viewerInfoClose} onClick={onClose} aria-label={t("common.close")}>
          ✕
        </button>
      </div>
      <div style={S.viewerInfoRows}>
        {rows.map((row) => (
          <div key={row.key} style={S.viewerInfoRow}>
            <span style={S.viewerInfoLabel}>{row.label}</span>
            <span style={S.viewerInfoValue} title={row.value}>{row.value}</span>
          </div>
        ))}
      </div>
      {!!promptText && (
        <div style={docked ? S.viewerInfoPromptWrapDocked : S.viewerInfoPromptWrap}>
          <div style={S.viewerInfoPromptHead}>
            <span style={S.viewerInfoLabel}>{t("viewer.infoPrompt")}</span>
            <button type="button" style={S.viewerInfoCopyBtn} onClick={onCopyPrompt}>
              {t("viewer.infoCopyPrompt")}
            </button>
          </div>
          <div style={docked ? S.viewerInfoPromptTextDocked : S.viewerInfoPromptText}>{promptText}</div>
        </div>
      )}
    </div>
  );
}

export function ImagePreviewModal({ src, onClose }) {
  const { t } = useI18n();
  const modalPanelRef = useRef(null);
  const stageRef = useRef(null);
  const viewportRef = useRef(null);
  const singleImageRef = useRef(null);
  const inputImageRef = useRef(null);
  const outputImageRef = useRef(null);
  const dragRef = useRef(null);
  const swipeRef = useRef({ active: false, startX: 0, startY: 0 });
  const toastTimerRef = useRef(null);
  const preview = useMemo(() => normalizePreviewPayload(src), [src]);
  const [currentIndex, setCurrentIndex] = useState(preview.currentIndex || 0);
  const galleryItems = preview.galleryItems;
  const activePreview = galleryItems[currentIndex] || preview;
  const outputSrc = activePreview.outputSrc;
  const inputSrc = activePreview.inputSrc;
  const inputTokens = activePreview.inputTokens;
  const modelName = activePreview.modelName;
  const promptText = activePreview.promptText;
  const meta = activePreview.meta || null;
  const isComparePreview = !!inputSrc && !!outputSrc;
  const hasGallery = galleryItems.length > 1;
  const canGoPrev = hasGallery && currentIndex > 0;
  const canGoNext = hasGallery && currentIndex < galleryItems.length - 1;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [wheelActive, setWheelActive] = useState(false);
  const [colorPickerActive, setColorPickerActive] = useState(false);
  const [pickedColor, setPickedColor] = useState(null);
  const [colorSamples, setColorSamples] = useState([]);
  const [activeColorSampleId, setActiveColorSampleId] = useState("");
  const [promptPanelOpen, setPromptPanelOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [toastText, setToastText] = useState("");

  const clampScale = useCallback((value) => Math.max(1, Math.min(8, Number(value) || 1)), []);

  const goPrev = useCallback(() => {
    if (galleryItems.length <= 1) return;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, [galleryItems.length]);

  const goNext = useCallback(() => {
    if (galleryItems.length <= 1) return;
    setCurrentIndex((prev) => Math.min(galleryItems.length - 1, prev + 1));
  }, [galleryItems.length]);

  useEffect(() => {
    setCurrentIndex(preview.currentIndex || 0);
  }, [preview.currentIndex, preview.outputSrc, preview.imageKey, galleryItems.length]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    setWheelActive(false);
    setColorPickerActive(false);
    setPickedColor(null);
    setColorSamples([]);
    setActiveColorSampleId("");
    setPromptPanelOpen(false);
    // 信息框由用户点击 ⓘ 控制，左右切换时保持展开，不自动收回。
    dragRef.current = null;
  }, [inputSrc, outputSrc]);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!hasGallery) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, hasGallery]);

  const handleWheel = useCallback((event) => {
    if (!wheelActive) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.18 : -0.18;
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next <= 1.02) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, [clampScale, wheelActive]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const onWheel = (event) => handleWheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMove = (event) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      setOffset({
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    };
    const handleUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  const handleMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (colorPickerActive) return;
    setWheelActive(true);
    if (scale <= 1.02) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  }, [colorPickerActive, offset.x, offset.y, scale]);

  const showToast = useCallback((message) => {
    setToastText(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastText(""), 1800);
  }, []);

  const handlePromptClick = useCallback(async (safePromptText) => {
    if (!safePromptText) return;
    if (!promptPanelOpen) {
      setPromptPanelOpen(true);
      return;
    }
    try {
      await copyTextToClipboard(safePromptText);
      showToast(t("viewer.promptCopied"));
    } catch {
      showToast(t("viewer.promptCopyFailed"));
    }
  }, [promptPanelOpen, showToast, t]);

  const handlePromptCopy = useCallback(async (safePromptText) => {
    const text = typeof safePromptText === "string" ? safePromptText.trim() : "";
    if (!text) return;
    try {
      await copyTextToClipboard(text);
      showToast(t("viewer.promptCopied"));
    } catch {
      showToast(t("viewer.promptCopyFailed"));
    }
  }, [showToast, t]);

  const handleColorPick = useCallback(async (event, sourceUrl = "", target = "output") => {
    if (!colorPickerActive) return;
    event.preventDefault();
    event.stopPropagation();
    const image = event.currentTarget;
    const point = getImagePixelPoint(image, event);
    if (!point) {
      setPickedColor({ text: t("viewer.colorUnavailable"), swatch: "" });
      return;
    }
    setPickedColor({ text: t("common.processing"), swatch: "" });
    try {
      const color = await readImagePixelColor(image, point, sourceUrl);
      if (!color) {
        setPickedColor({ text: t("viewer.colorUnavailable"), swatch: "" });
        return;
      }
      const id = `color-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sample = {
        ...color,
        id,
        sourceUrl,
        target,
        xRatio: point.x / image.naturalWidth,
        yRatio: point.y / image.naturalHeight,
      };
      setPickedColor(color);
      setColorSamples((prev) => [sample, ...prev].slice(0, 24));
      setActiveColorSampleId(id);
    } catch {
      setPickedColor({ text: t("viewer.colorUnavailable"), swatch: "" });
    }
  }, [colorPickerActive, t]);

  if (!outputSrc) return null;
  const activeColorSample = colorSamples.find((sample) => sample.id === activeColorSampleId) || null;
  const singleMarkerStyle =
    !isComparePreview && activeColorSample?.sourceUrl === outputSrc
      ? getColorMarkerStyle(activeColorSample, singleImageRef, stageRef)
      : null;
  const inputMarkerStyle =
    isComparePreview && activeColorSample?.target === "input" && activeColorSample?.sourceUrl === inputSrc
      ? getColorMarkerStyle(activeColorSample, inputImageRef, stageRef)
      : null;
  const outputMarkerStyle =
    isComparePreview && activeColorSample?.target === "output" && activeColorSample?.sourceUrl === outputSrc
      ? getColorMarkerStyle(activeColorSample, outputImageRef, stageRef)
      : null;
  const sharedPreviewImageStyle = {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    transformOrigin: "center center",
    transition: dragging ? "none" : "transform 0.08s ease-out",
    cursor: colorPickerActive ? "crosshair" : scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
    userSelect: "none",
  };
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div
        ref={modalPanelRef}
        style={{
          position: "relative",
          width: "94vw",
          height: "90vh",
          maxWidth: isComparePreview ? 1480 : 1360,
          display: "flex",
          alignItems: "stretch",
          gap: infoPanelOpen && !!meta ? 12 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {infoPanelOpen && !!meta && (
          <PreviewInfoPanel
            meta={meta}
            docked
            onClose={() => setInfoPanelOpen(false)}
            onCopyPrompt={() => handlePromptCopy(meta.promptText || promptText)}
          />
        )}
        <div ref={stageRef} style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
        <button onClick={onClose} style={{ ...S.closeBtn, position: "absolute", top: 12, right: 12, zIndex: 10 }}>✕</button>
        <div style={S.viewerColorPickerBar}>
          {!!meta && (
            <button
              type="button"
              style={{ ...S.viewerColorPickerBtn, ...(infoPanelOpen ? S.viewerColorPickerBtnActive : null) }}
              onClick={() => setInfoPanelOpen((open) => !open)}
              title={t("viewer.infoPanel")}
              aria-label={t("viewer.infoPanel")}
            >
              ⓘ
            </button>
          )}
          <button
            type="button"
            style={{ ...S.viewerColorPickerBtn, ...(colorPickerActive ? S.viewerColorPickerBtnActive : null) }}
            onClick={() => setColorPickerActive((active) => !active)}
            title={colorPickerActive ? t("viewer.colorPickerActive") : t("viewer.colorPicker")}
            aria-label={colorPickerActive ? t("viewer.colorPickerActive") : t("viewer.colorPicker")}
          >
            ◈
          </button>
          {pickedColor && (
            <div style={S.viewerColorValue} title={pickedColor.text}>
              {!!pickedColor.swatch && <span style={{ ...S.viewerColorSwatch, background: pickedColor.swatch }} />}
              <span>{pickedColor.text}</span>
            </div>
          )}
        </div>
        {promptPanelOpen && !!promptText && (
          <div style={S.viewerPromptPanel} onClick={(event) => event.stopPropagation()}>
            {promptText}
          </div>
        )}
        {!!toastText && <div style={S.viewerToast}>{toastText}</div>}
        {colorSamples.length > 0 && (
          <div style={S.viewerColorHistoryPanel} onClick={(event) => event.stopPropagation()}>
            <div style={S.viewerColorHistoryTitle}>{t("viewer.colorHistory")}</div>
            <div style={S.viewerColorHistoryList}>
              {colorSamples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  style={{
                    ...S.viewerColorHistoryItem,
                    ...(sample.id === activeColorSampleId ? S.viewerColorHistoryItemActive : null),
                  }}
                  onClick={() => setActiveColorSampleId(sample.id)}
                  title={sample.text}
                >
                  <span style={{ ...S.viewerColorSwatch, background: sample.swatch }} />
                  <span style={S.viewerColorHistoryText}>{sample.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {singleMarkerStyle && <div style={singleMarkerStyle} />}
        {inputMarkerStyle && <div style={inputMarkerStyle} />}
        {outputMarkerStyle && <div style={outputMarkerStyle} />}
        {hasGallery && (
          <>
            <button
              type="button"
              style={{
                ...S.previewNavBtn,
                left: 14,
                opacity: canGoPrev ? 1 : 0.35,
                cursor: canGoPrev ? "pointer" : "not-allowed",
              }}
              onClick={goPrev}
              disabled={!canGoPrev}
            >
              ‹
            </button>
            <button
              type="button"
              style={{
                ...S.previewNavBtn,
                right: 14,
                opacity: canGoNext ? 1 : 0.35,
                cursor: canGoNext ? "pointer" : "not-allowed",
              }}
              onClick={goNext}
              disabled={!canGoNext}
            >
              ›
            </button>
            <div style={S.previewCounter}>
              {currentIndex + 1} / {galleryItems.length}
            </div>
          </>
        )}
        <div
          ref={viewportRef}
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#0b0b0d",
            overflow: "hidden",
            display: "flex",
            alignItems: "stretch",
            justifyContent: "stretch",
            userSelect: "none",
          }}
          onMouseDown={handleMouseDown}
          onClick={() => {
            setWheelActive(true);
            if (promptPanelOpen) setPromptPanelOpen(false);
          }}
          onTouchStart={(event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            swipeRef.current = {
              active: true,
              startX: touch.clientX,
              startY: touch.clientY,
            };
          }}
          onTouchEnd={(event) => {
            if (!swipeRef.current.active) return;
            const touch = event.changedTouches?.[0];
            swipeRef.current.active = false;
            if (!touch) return;
            const dx = touch.clientX - swipeRef.current.startX;
            const dy = touch.clientY - swipeRef.current.startY;
            if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy)) return;
            if (dx > 0) {
              goPrev();
            } else {
              goNext();
            }
          }}
          onDoubleClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          {isComparePreview ? (
            <div style={S.previewCompareGrid}>
              <div style={S.previewComparePane}>
                <div style={S.previewCompareLabel}>
                  <span>{t("viewer.compareInput")}</span>
                  {inputTokens.length > 0 && (
                    <span style={S.previewCompareTokens}>
                      {inputTokens.map((token, index) => (
                        <span key={`${token}-${index}`} style={S.previewCompareToken}>
                          {token}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <div style={S.previewCompareImageWrap}>
                  <img
                    src={inputSrc}
                    ref={inputImageRef}
                    alt={t("viewer.compareInput")}
                    draggable={false}
                    style={{ ...S.previewCompareImage, ...sharedPreviewImageStyle }}
                    onClick={(event) => handleColorPick(event, inputSrc, "input")}
                  />
                </div>
              </div>
              <div style={{ ...S.previewComparePane, borderRight: "none" }}>
                <div style={S.previewCompareLabel}>
                  <span>{t("viewer.compareOutput")}</span>
                  <PreviewMetaBar modelName={modelName} promptText={promptText} inline onPromptClick={handlePromptClick} />
                </div>
                <div style={S.previewCompareImageWrap}>
                  <img
                    src={outputSrc}
                    ref={outputImageRef}
                    alt={t("viewer.compareOutput")}
                    draggable={false}
                    style={{ ...S.previewCompareImage, ...sharedPreviewImageStyle }}
                    onClick={(event) => handleColorPick(event, outputSrc, "output")}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div style={S.previewSingleWrap}>
              <img
                src={outputSrc}
                ref={singleImageRef}
                alt={t("viewer.fullImage")}
                draggable={false}
                style={sharedPreviewImageStyle}
                onClick={(event) => handleColorPick(event, outputSrc, "output")}
              />
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

export function InlineZoomViewer({
  src,
  onCollapse,
  containerStyle = null,
  collapseButtonStyle = null,
  viewportStyle = null,
  imageStyle = null,
  modelName = "",
  promptText = "",
}) {
  const { t } = useI18n();
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const clampScale = useCallback((value) => Math.max(1, Math.min(6, Number(value) || 1)), []);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [src]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.2 : -0.2;
    setScale((prev) => {
      const next = clampScale(prev + delta);
      if (next <= 1.02) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, [clampScale]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const onWheel = (event) => handleWheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMove = (event) => {
      if (!dragRef.current) return;
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      setOffset({
        x: dragRef.current.originX + dx,
        y: dragRef.current.originY + dy,
      });
    };
    const handleUp = () => {
      setDragging(false);
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  const handleMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (scale <= 1.02) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  }, [offset.x, offset.y, scale]);

  if (!src) return null;

  return (
    <div style={{ ...S.inlineZoomViewer, ...(containerStyle || null) }}>
      <PreviewMetaBar modelName={modelName} promptText={promptText} />
      <button
        type="button"
        style={{ ...S.inlineZoomViewerCollapseBtn, ...(collapseButtonStyle || null) }}
        onClick={onCollapse}
        title={t("viewer.collapse")}
      >
        ↙
      </button>
      <div
        ref={viewportRef}
        style={{ ...S.inlineZoomViewerViewport, ...(viewportStyle || null) }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setScale(1);
          setOffset({ x: 0, y: 0 });
        }}
      >
        <img
          src={src}
          alt={t("viewer.inputImageAlt")}
          draggable={false}
          style={{
            ...S.inlineZoomViewerImage,
            ...(imageStyle || null),
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 0.08s ease-out",
            cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
          }}
        />
      </div>
    </div>
  );
}

export function ResultColumn({
  result,
  onPreview,
  onCancel,
  onAddToCanvasImage,
  turnId,
  turnSeq,
  selectedImageKeys,
  onToggleImageSelect,
  onRetryImage,
  onAppendImage,
  onSplitImage,
  retryingImageKeys,
  splittingImageKeys,
  enableSelect = false,
  showImageLabel = false,
  selectPosition = "top-right",
  compactImages = false,
  showPromptBadge = true,
}) {
  const { uiLanguage, t } = useI18n();
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
            {getLocalizedPromptLabel(result.promptLabel || getResultPromptKey(result), getResultPromptKey(result), uiLanguage)}
          </span>
        )}
        {!!result.requestedCount && <span style={{ ...S.statusBadge, background: "rgba(250,204,21,0.14)", color: "#facc15" }}>x{result.requestedCount}</span>}
        <span style={{ ...S.statusBadge, background: sc + "22", color: sc }}>
          {result.status === "loading" ? "⏳" : result.status === "success" ? "✓" : "✗"} {getLocalizedStatusLabel(result.status, t)}
        </span>
      </div>
      {result.status === "loading" && (
        <div style={S.loadingArea}>
          <div style={S.spinner} />
          <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>
            {t("status.generating", { generated: generatedCount, requested: requestedCount })}
          </p>
          <button style={{ ...S.dlBtn, marginTop: 10, borderRadius: 8, width: 120 }} onClick={onCancel}>{t("status.stop")}</button>
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
                previewPayload={{
                  imageKey,
                  promptText: typeof result?.promptText === "string" ? result.promptText : "",
                  modelName: result.modelName || model?.name || result.modelId,
                  promptKey,
                  promptLabel: result?.promptLabel || "",
                }}
                label={showImageLabel ? (result.promptLabel || "") : ""}
                compact={compactImages}
                showSelect={enableSelect}
                selectPosition={selectPosition}
                selected={isSelected}
                replacing={retryingImageKeys?.has?.(imageKey)}
                busy={retryingImageKeys?.has?.(imageKey) || retryingImageKeys?.has?.(resultTaskKey)}
                splitBusy={splittingImageKeys?.has?.(imageKey)}
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
                onAddToCanvas={(resolvedImage) =>
                  onAddToCanvasImage?.({
                    image: resolvedImage || img,
                    turnId,
                    turnSeq,
                    modelId: result.modelId,
                    modelName: result.modelName || model?.name || result.modelId,
                    promptKey,
                    promptText: typeof result?.promptText === "string" ? result.promptText : "",
                    fileStem: buildResultFileStem(result),
                    index: imageIndex,
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
                    promptText: typeof result?.promptText === "string" ? result.promptText : "",
                    theme: result.promptLabel || "",
                    fileStem: buildResultFileStem(result),
                    index: imageIndex,
                  })
                }
                onSplit={(resolvedImage) =>
                  onSplitImage?.({
                    key: imageKey,
                    image: resolvedImage || img,
                    turnId,
                    turnSeq,
                    modelId: result.modelId,
                    modelName: result.modelName || model?.name || result.modelId,
                    promptKey,
                    promptText: typeof result?.promptText === "string" ? result.promptText : "",
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
            <p style={{ color: "#ef4444", fontSize: 13, wordBreak: "break-word" }}>{localizeRuntimeMessage(result.error, t)}</p>
          ) : null}
          {result.status === "cancelled" ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>{t("status.cancelledByUser")}</p>
          ) : null}
          {result.status === "success" && !visibleImages.length ? (
            <p style={{ color: "#f59e0b", fontSize: 13 }}>{t("turn.noImagesReturned")}</p>
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

export function ImageCard({
  img,
  fileStem,
  index,
  onPreview,
  previewPayload = null,
  label,
  selected,
  onToggleSelect,
  onRetry,
  onAppend,
  onAddToCanvas,
  replacing = false,
  busy = false,
  onSplit,
  splitBusy = false,
  showSelect = true,
  selectPosition = "top-right",
  compact = false,
}) {
  const { t } = useI18n();
  const [src, setSrc] = useState(img);
  const [triedProxy, setTriedProxy] = useState(false);

  useEffect(() => {
    setSrc(img);
    setTriedProxy(false);
  }, [img]);

  const onImgError = useCallback(() => {
    if (triedProxy) return;
    const proxyFromGlobal = getRuntimeConfig().proxyUrl || "";
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
          title={selected ? t("select.unselect") : t("select.select")}
        >
          {selected ? "●" : "○"}
        </button>
      )}
      {!!label && <div style={{ ...S.imageThemeTag, ...(compact ? S.imageThemeTagCompact : null) }}>{label}</div>}
      {typeof onSplit === "function" && (
        <button
          type="button"
          style={{
            ...S.imageSplitBtn,
            ...(compact ? S.imageSplitBtnCompact : null),
            ...(splitBusy ? S.imageSplitBtnBusy : null),
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onSplit(src);
          }}
          disabled={splitBusy}
          title={t("split.open")}
        >
          {splitBusy ? "…" : "✂"}
        </button>
      )}
      {!replacing ? (
        <img
          src={src}
          alt={`Gen ${index}`}
          style={compact ? S.thumbCompact : S.thumb}
          onClick={() =>
            onPreview(
              previewPayload && typeof previewPayload === "object"
                ? { ...previewPayload, outputSrc: src }
                : src
            )
          }
          onError={onImgError}
        />
      ) : (
        <div style={compact ? S.thumbRetryingCompact : S.thumbRetrying}>{t("action.retry")}…</div>
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
        onAddToCanvas={
          typeof onAddToCanvas === "function"
            ? () => onAddToCanvas(src)
            : undefined
        }
      />
    </div>
  );
}

export function TurnPanel({
  turn,
  onPreview,
  onCancelModel,
  onDelete,
  onReuse,
  onHide,
  onSyncTemplate,
  canSyncTemplate,
  onAddToCanvasImage,
  selectedImageKeys,
  onToggleImageSelect,
  onRetryImage,
  onAppendImage,
  onSplitImage,
  retryingImageKeys,
  splittingImageKeys,
  compactStyleHistory = false,
  truncatePromptText = false,
  showModelSummary = true,
  enableInlineReferenceViewer = false,
}) {
  const { uiLanguage, t } = useI18n();
  const [inlineViewerSrc, setInlineViewerSrc] = useState(null);
  const expandPromptPreview = !!inlineViewerSrc;
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
  const previewInputImage = normalizeImageValue(turn.referenceImage) || normalizeImageValue(styleReferenceImages[0] || "");
  const handleGeneratedImagePreview = useCallback((payload) => {
    const previewPayload = normalizePreviewPayload(payload);
    const normalizedImage = previewPayload.outputSrc;
    if (!normalizedImage) return;
    const promptText = typeof payload?.promptText === "string" ? payload.promptText : "";
    const promptLabel = typeof payload?.promptLabel === "string" ? payload.promptLabel : "";
    const promptKey = typeof payload?.promptKey === "string" ? payload.promptKey : "";
    const inputTokens = getPreviewTokens(promptText, promptLabel, promptKey);
    onPreview?.({
      ...previewPayload,
      inputSrc: previewInputImage && previewInputImage !== normalizedImage ? previewInputImage : previewPayload.inputSrc,
      inputTokens,
    });
  }, [onPreview, previewInputImage]);
  const formatPromptPreviewText = useCallback((text) => {
    const source = typeof text === "string" ? text : "";
    if (!truncatePromptText) return source;
    return getPromptPreviewText(source, expandPromptPreview ? 960 : 220);
  }, [expandPromptPreview, truncatePromptText]);

  useEffect(() => {
    if (!turn.referenceImage && inlineViewerSrc) {
      setInlineViewerSrc(null);
    }
  }, [turn.referenceImage, inlineViewerSrc]);

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
      promptText: typeof result.promptText === "string" ? result.promptText : "",
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
          #{turn.seq} · {formatUiDateTime(turn.createdAt, uiLanguage)} · {getLocalizedStatusLabel(turn.status, t)}
          {isCompareMode && <span style={S.turnModeBadge}>{t("turn.compare")}</span>}
          {isStyleMode && <span style={S.turnModeBadge}>{t("turn.style")}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showModelSummary && (
            <div style={{ fontSize: 12, color: "#71717a", fontFamily: mono }}>
              {selectedModelIds.length ? selectedModelIds.join(" · ") : "-"}
            </div>
          )}
          {onSyncTemplate && (
            <button
              type="button"
              style={{ ...S.turnActionBtn, opacity: canSyncTemplate ? 1 : 0.45, cursor: canSyncTemplate ? "pointer" : "not-allowed" }}
              onClick={() => onSyncTemplate(turn)}
              disabled={!canSyncTemplate}
            >
              {t("turn.syncTemplate")}
            </button>
          )}
          {onReuse && <button type="button" style={S.turnActionBtn} onClick={() => onReuse(turn)}>{t("turn.reuse")}</button>}
          {onHide && <button type="button" style={{ ...S.turnActionBtn, width: 28, padding: 0 }} onClick={() => onHide(turn.id)}>x</button>}
          {onDelete && <button type="button" style={{ ...S.turnActionBtn, color: "#fca5a5", borderColor: "rgba(252,165,165,0.4)" }} onClick={() => onDelete(turn.id)}>{t("turn.delete")}</button>}
        </div>
      </div>
      {isStyleMode && compactStyleHistory ? (
        <div style={S.styleHistorySummary}>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryModel")}</span>
            <span style={S.styleSummaryVal}>{styleModelName}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryPerTask")}</span>
            <span style={S.styleSummaryVal}>x{styleRequestedCount || 0}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryGenerated")}</span>
            <span style={S.styleSummaryVal}>{styleGeneratedCount}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summarySuccess")}</span>
            <span style={S.styleSummaryVal}>{styleSuccessCount}/{styleResults.length || 0}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryFailed")}</span>
            <span style={S.styleSummaryVal}>{styleErrorCount + styleCancelledCount}</span>
          </div>
          <div style={S.styleSummaryItem}>
            <span style={S.styleSummaryKey}>{t("turn.summaryRunning")}</span>
            <span style={S.styleSummaryVal}>{styleLoadingCount}</span>
          </div>
        </div>
      ) : (
        <>
          <div style={{ ...S.turnPromptRow, ...(expandPromptPreview ? S.turnPromptRowExpanded : null) }}>
            <div
              style={{
                ...S.turnPromptCards,
                gridTemplateColumns: isCompareMode ? "repeat(2, minmax(0, 1fr))" : "1fr",
                ...(expandPromptPreview ? S.turnPromptCardsExpanded : null),
              }}
            >
              {isStyleMode ? (
                <div
                  style={{
                    ...S.turnPromptCard,
                    ...(truncatePromptText ? S.turnPromptCardCompact : null),
                    ...(expandPromptPreview ? S.turnPromptCardExpanded : null),
                  }}
                >
                  <div
                    style={{
                      ...S.turnPromptText,
                      ...(truncatePromptText ? S.turnPromptTextCompact : null),
                      ...(expandPromptPreview ? S.turnPromptTextExpanded : null),
                    }}
                    >
                    {styleBasePrompt ? <PromptTextWithChips text={formatPromptPreviewText(styleBasePrompt)} /> : t("status.noPrompt")}
                  </div>
                </div>
              ) : (
                promptVariants.map((variant) => (
                  <div
                    key={variant.key}
                    style={{
                      ...S.turnPromptCard,
                      ...(truncatePromptText ? S.turnPromptCardCompact : null),
                      ...(expandPromptPreview ? S.turnPromptCardExpanded : null),
                    }}
                    >
                    {isCompareMode && <div style={S.turnPromptBadge}>{getLocalizedPromptLabel(variant.label, variant.key, uiLanguage)}</div>}
                    <div
                      style={{
                        ...S.turnPromptText,
                        ...(truncatePromptText ? S.turnPromptTextCompact : null),
                        ...(expandPromptPreview ? S.turnPromptTextExpanded : null),
                      }}
                    >
                      {variant.prompt ? <PromptTextWithChips text={formatPromptPreviewText(variant.prompt)} /> : t("status.noPrompt")}
                    </div>
                  </div>
                ))
              )}
            </div>
            {(turn.referenceImage || styleReferenceImages.length > 0) && (
              <div style={{ ...S.turnRefViewerCol, ...(expandPromptPreview ? S.turnRefViewerColExpanded : null) }}>
                <div style={S.turnRefImageStack}>
                  {turn.referenceImage && (
                    inlineViewerSrc ? (
                      <InlineZoomViewer
                        src={inlineViewerSrc}
                        onCollapse={() => {
                          setInlineViewerSrc(null);
                        }}
                      />
                    ) : (
                      <div style={S.turnRefImageWrap}>
                        <button
                          type="button"
                          style={S.turnRefImageBtn}
                          onClick={() => onPreview?.(turn.referenceImage)}
                          title={t("viewer.previewReference")}
                        >
                          <img src={turn.referenceImage} alt="Reference" style={S.turnRefImage} />
                        </button>
                        {enableInlineReferenceViewer && (
                          <button
                            type="button"
                            style={S.turnRefImageZoomBtn}
                            onClick={(event) => {
                              event.stopPropagation();
                              setInlineViewerSrc(turn.referenceImage);
                            }}
                            title={t("viewer.inlineViewer")}
                          >
                            🔍
                          </button>
                        )}
                      </div>
                    )
                  )}
                  {styleReferenceImages.map((image, index) => (
                    <button
                      key={`style-ref-${turn.id}-${index}`}
                      type="button"
                      style={S.turnRefImageBtn}
                      onClick={() => onPreview?.(image)}
                      title={t("viewer.previewStyleImage", { index: index + 1 })}
                    >
                      <img src={image} alt={`Style ${index + 1}`} style={S.turnRefImage} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {isStyleMode ? (
            <div style={S.turnStyleUnifiedWrap}>
              <div style={S.styleHistorySummary}>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryModel")}</span>
                  <span style={S.styleSummaryVal}>{styleModelName}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryPerTask")}</span>
                  <span style={S.styleSummaryVal}>x{styleRequestedCount || 0}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryGenerated")}</span>
                  <span style={S.styleSummaryVal}>{styleGeneratedCount}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summarySuccess")}</span>
                  <span style={S.styleSummaryVal}>{styleSuccessCount}/{styleResults.length || 0}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryFailed")}</span>
                  <span style={S.styleSummaryVal}>{styleErrorCount + styleCancelledCount}</span>
                </div>
                <div style={S.styleSummaryItem}>
                  <span style={S.styleSummaryKey}>{t("turn.summaryRunning")}</span>
                  <span style={S.styleSummaryVal}>{styleLoadingCount}</span>
                </div>
              </div>

              {styleTurnFinished && styleFailedThemes.length > 0 && (
                <div style={S.turnStyleFailedLine}>
                  {t("turn.failedThemes", { themes: styleFailedThemes.join(" · ") })}
                </div>
              )}

              <div style={S.turnStyleImageBox}>
                <div style={S.turnStyleImageHead}>
                  <span style={S.turnResultMeta}>{t("turn.styleResults")}</span>
                  {styleLoadingCount > 0 && (
                    <span style={S.turnResultMeta}>
                      {t("turn.generatingCount", { generated: styleGeneratedCount, expected: styleExpectedCount || 0 })}
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
                          onPreview={handleGeneratedImagePreview}
                          previewPayload={{
                            imageKey,
                            promptText: item.promptText,
                            modelName: item.modelName,
                            promptKey: item.promptKey,
                            promptLabel: item.promptLabel || "",
                          }}
                          label={getLocalizedPromptLabel(item.promptLabel, item.promptKey, uiLanguage)}
                          compact
                          showSelect
                          selected={selectedImageKeys?.has?.(imageKey)}
                          replacing={retryingImageKeys?.has?.(imageKey)}
                          busy={retryingImageKeys?.has?.(imageKey) || retryingImageKeys?.has?.(buildTurnTaskKey(turn.id, item.modelId, item.promptKey))}
                          splitBusy={splittingImageKeys?.has?.(imageKey)}
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
                          onAddToCanvas={(resolvedImage) =>
                            onAddToCanvasImage?.({
                              image: resolvedImage || item.image,
                              turnId: turn.id,
                              turnSeq: turn.seq,
                              modelId: item.modelId,
                              modelName: item.modelName,
                              promptKey: item.promptKey,
                              promptText: item.promptText,
                              fileStem: item.fileStem,
                              index: item.index,
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
                              promptText: item.promptText,
                              theme: item.promptLabel || "",
                              fileStem: item.fileStem,
                              index: item.index,
                            })
                          }
                          onSplit={(resolvedImage) =>
                            onSplitImage?.({
                              key: imageKey,
                              image: resolvedImage || item.image,
                              turnId: turn.id,
                              turnSeq: turn.seq,
                              modelId: item.modelId,
                              modelName: item.modelName,
                              promptKey: item.promptKey,
                              promptText: item.promptText,
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
                      ? t("turn.generatingImages")
                      : styleFailedCount > 0
                      ? t("turn.noSuccessfulImages")
                      : styleResults.length
                      ? t("turn.noImagesReturned")
                      : t("turn.noStyleResults")}
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
                      <span style={S.turnPromptBadge}>{getLocalizedPromptLabel(variant.label, variant.key, uiLanguage)}</span>
                      <span style={S.turnResultMeta}>{t("turn.modelTasks", { count: groupResults.length })}</span>
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
                        onPreview={handleGeneratedImagePreview}
                        onCancel={() => onCancelModel?.(turn.id, r.modelId, getResultPromptKey(r))}
                        turnId={turn.id}
                        turnSeq={turn.seq}
                        selectedImageKeys={selectedImageKeys}
                        onToggleImageSelect={onToggleImageSelect}
                        onRetryImage={onRetryImage}
                        onAppendImage={onAppendImage}
                        onAddToCanvasImage={onAddToCanvasImage}
                        onSplitImage={onSplitImage}
                        retryingImageKeys={retryingImageKeys}
                        splittingImageKeys={splittingImageKeys}
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
