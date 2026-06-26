import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { CF_WORKER_CODE } from "../../config/cloudflareWorkerCode";
import {
  DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE,
  DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT,
  INPUT_IMAGE_EDITOR_COLORS,
  MAX_INPUT_IMAGES_PER_BATCH,
} from "../../config/appConfig";
import { normalizeUiLanguage, useI18n } from "../../i18n";
import {
  applyInputImageEditorOperation,
  cropInputImageDataUrl,
  drawInputImageEditorShape,
  getInputImageEditorStrokeWidth,
  isEditorRectValid,
  loadImageElement,
  normalizeApiKeys,
  normalizeGptAssistFlag,
  normalizeGptAssistPrompt,
  normalizeEditorRect,
  normalizeStyleThemeAssistPrompt,
} from "../../services/appCore";
import { S } from "../../styles/appStyles";
import { TokenPromptInput } from "../workspace/promptControls";

export function SettingsModal({ show, onClose, proxyUrl, setProxyUrl, uiLanguage, setUiLanguage }) {
  const { t } = useI18n();
  const [showWorkerCode, setShowWorkerCode] = useState(false);
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>⚙ {t("settings.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("settings.proxyLabel")}</label>
        <input style={S.proxyInput} value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} placeholder="https://your-worker.workers.dev" />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("settings.language")}</label>
        <select style={S.proxyInput} value={uiLanguage} onChange={(event) => setUiLanguage(normalizeUiLanguage(event.target.value))}>
          <option value="en">{t("settings.languageEnglish")}</option>
          <option value="zh">{t("settings.languageChinese")}</option>
        </select>
        <p style={S.hint}>
          {uiLanguage === "zh" ? (
            <>
              请先部署下面的 Worker。使用 Comet 时可配置 <code style={{ color: "#a78bfa" }}>COMETAPI_KEY</code>，使用 DeerAPI 时可配置 <code style={{ color: "#a78bfa" }}>DEERAPI_KEY</code>，使用百炼时可配置 <code style={{ color: "#a78bfa" }}>DASHSCOPE_API_KEY</code>；如果你已在 API 面板里保存密钥，则会优先使用面板里的值。
            </>
          ) : (
            <>
              Deploy the Worker below. Use <code style={{ color: "#a78bfa" }}>COMETAPI_KEY</code> for Comet, <code style={{ color: "#a78bfa" }}>DEERAPI_KEY</code> for DeerAPI, or <code style={{ color: "#a78bfa" }}>DASHSCOPE_API_KEY</code> for Bailian. If you save a key in the API panel, that value takes precedence.
            </>
          )}
        </p>
        <button style={{ ...S.toggleCodeBtn, marginTop: 16 }} onClick={() => setShowWorkerCode(!showWorkerCode)}>
          {showWorkerCode ? t("settings.hideWorkerCode") : t("settings.showWorkerCode")}
        </button>
        {showWorkerCode && <pre style={S.codeBlock}>{CF_WORKER_CODE}</pre>}
      </div>
    </div>
  );
}

export function ApiKeyModal({
  show,
  onClose,
  apiKeys,
  draftApiKeys,
  setDraftApiKeys,
  onSave,
  saveStateText,
}) {
  const { uiLanguage, t } = useI18n();
  if (!show) return null;
  const normalizedCurrentKeys = normalizeApiKeys(apiKeys);
  const normalizedDraftKeys = normalizeApiKeys(draftApiKeys);
  const isDirty =
    normalizedDraftKeys.comet !== normalizedCurrentKeys.comet ||
    normalizedDraftKeys.deerapi !== normalizedCurrentKeys.deerapi ||
    normalizedDraftKeys.bailian !== normalizedCurrentKeys.bailian;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>🔑 {t("api.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("api.cometLabel")}</label>
        <input
          style={S.proxyInput}
          value={normalizedDraftKeys.comet}
          onChange={(e) => setDraftApiKeys((prev) => ({ ...normalizeApiKeys(prev), comet: e.target.value }))}
          placeholder="sk-..."
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("api.deerapiLabel")}</label>
        <input
          style={S.proxyInput}
          value={normalizedDraftKeys.deerapi}
          onChange={(e) => setDraftApiKeys((prev) => ({ ...normalizeApiKeys(prev), deerapi: e.target.value }))}
          placeholder="sk-..."
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("api.bailianLabel")}</label>
        <input
          style={S.proxyInput}
          value={normalizedDraftKeys.bailian}
          onChange={(e) => setDraftApiKeys((prev) => ({ ...normalizeApiKeys(prev), bailian: e.target.value }))}
          placeholder="sk-..."
        />
        <div style={S.apiModalActions}>
          <span style={S.apiModalState}>{saveStateText}</span>
          <button
            style={{ ...S.apiSaveBtn, opacity: isDirty ? 1 : 0.5, cursor: isDirty ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!isDirty}
          >
            {t("common.save")}
          </button>
        </div>
        <p style={S.hint}>
          {uiLanguage === "zh"
            ? "保存后会按模型自动使用对应平台。留空的输入框会回退到 Worker 环境变量：Comet 走 COMETAPI_KEY，DeerAPI 走 DEERAPI_KEY，百炼走 DASHSCOPE_API_KEY。"
            : "After saving, each model automatically uses its matching provider. Empty fields fall back to Worker env vars: COMETAPI_KEY for Comet, DEERAPI_KEY for DeerAPI, and DASHSCOPE_API_KEY for Bailian."}
        </p>
      </div>
    </div>
  );
}

export function GptAssistModal({
  show,
  onClose,
  prompt,
  draftPrompt,
  setDraftPrompt,
  sendPromptText,
  draftSendPromptText,
  setDraftSendPromptText,
  sendPromptImage,
  draftSendPromptImage,
  setDraftSendPromptImage,
  styleThemePrompt,
  draftStyleThemePrompt,
  setDraftStyleThemePrompt,
  onSave,
  saveStateText,
  canSave,
}) {
  const { uiLanguage, t } = useI18n();
  if (!show) return null;
  const isDirty =
    normalizeGptAssistPrompt(draftPrompt) !== normalizeGptAssistPrompt(prompt) ||
    normalizeStyleThemeAssistPrompt(draftStyleThemePrompt) !== normalizeStyleThemeAssistPrompt(styleThemePrompt) ||
    normalizeGptAssistFlag(draftSendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) !== normalizeGptAssistFlag(sendPromptText, DEFAULT_GPT_ASSIST_SEND_PROMPT_TEXT) ||
    normalizeGptAssistFlag(draftSendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE) !== normalizeGptAssistFlag(sendPromptImage, DEFAULT_GPT_ASSIST_SEND_PROMPT_IMAGE);
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>👤 {t("gpt.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("gpt.rewriteLabel")}</label>
        <textarea
          style={S.textarea}
          value={draftPrompt}
          onChange={(event) => setDraftPrompt(event.target.value)}
          placeholder={uiLanguage === "zh" ? "告诉 GPT 如何改写 {{ }} 内文字..." : "Tell GPT how to rewrite text inside {{ }}..."}
          rows={6}
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("gpt.themeLabel")}</label>
        <textarea
          style={S.textarea}
          value={draftStyleThemePrompt}
          onChange={(event) => setDraftStyleThemePrompt(event.target.value)}
          placeholder={uiLanguage === "zh" ? "告诉 GPT 如何联想 12 个主题元素..." : "Tell GPT how to expand one seed into 12 related themes..."}
          rows={5}
        />
        <label style={{ ...S.fieldLabel, marginTop: 14 }}>{t("gpt.contextLabel")}</label>
        <div style={S.settingToggleList}>
          <div style={S.settingToggleRow}>
            <div style={S.settingToggleTextWrap}>
              <div style={S.settingToggleTitle}>{t("gpt.sendPromptTextLabel")}</div>
              <div style={S.settingToggleHint}>{t("gpt.sendPromptTextHint")}</div>
            </div>
            <button
              type="button"
              style={{ ...S.settingToggleBtn, ...(draftSendPromptText ? S.settingToggleBtnActive : null) }}
              onClick={() => setDraftSendPromptText((prev) => !prev)}
            >
              {draftSendPromptText ? t("common.on") : t("common.off")}
            </button>
          </div>
          <div style={S.settingToggleRow}>
            <div style={S.settingToggleTextWrap}>
              <div style={S.settingToggleTitle}>{t("gpt.sendPromptImageLabel")}</div>
              <div style={S.settingToggleHint}>{t("gpt.sendPromptImageHint")}</div>
            </div>
            <button
              type="button"
              style={{ ...S.settingToggleBtn, ...(draftSendPromptImage ? S.settingToggleBtnActive : null) }}
              onClick={() => setDraftSendPromptImage((prev) => !prev)}
            >
              {draftSendPromptImage ? t("common.on") : t("common.off")}
            </button>
          </div>
        </div>
        <div style={S.apiModalActions}>
          <span style={S.apiModalState}>{saveStateText}</span>
          <button
            style={{ ...S.apiSaveBtn, opacity: isDirty && canSave ? 1 : 0.5, cursor: isDirty && canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!isDirty || !canSave}
          >
            {t("common.save")}
          </button>
        </div>
        <p style={S.hint}>
          {uiLanguage === "zh"
            ? "两套提示词都会存到历史文件夹（与模板相同），不会保存输入图。"
            : "Both prompts are stored in the selected history folder, while input images are not saved."}
        </p>
      </div>
    </div>
  );
}

export function TemplateEditorModal({ show, onClose, draft, setDraft, onSave, canSave }) {
  const { t } = useI18n();
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
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("template.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("common.title")}</label>
        <input
          style={S.proxyInput}
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={t("template.titlePlaceholder")}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.body")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("body")} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.body}
          onChange={(next) => setDraft((prev) => ({ ...prev, body: next }))}
          editorRef={bodyEditorRef}
          placeholder={t("template.bodyPlaceholder")}
          rows={4}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.backup")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("backup")} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.backup}
          onChange={(next) => setDraft((prev) => ({ ...prev, backup: next }))}
          editorRef={backupEditorRef}
          placeholder={t("template.backupPlaceholder")}
          rows={4}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.memo")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => insertPlaceholderInTemplate("memo")} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.memo}
          onChange={(next) => setDraft((prev) => ({ ...prev, memo: next }))}
          editorRef={memoEditorRef}
          placeholder={t("template.memoPlaceholder")}
          rows={4}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            style={{ ...S.apiSaveBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!canSave}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StyleTemplateEditorModal({ show, onClose, draft, setDraft, onSave, canSave }) {
  const { t } = useI18n();
  const bodyEditorRef = useRef(null);
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("template.styleTitle")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <label style={S.fieldLabel}>{t("common.title")}</label>
        <input
          style={S.proxyInput}
          value={draft.title}
          onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          placeholder={t("template.styleTitlePlaceholder")}
        />
        <div style={{ ...S.templateFieldHead, marginTop: 14 }}>
          <label style={{ ...S.fieldLabel, marginBottom: 0 }}>{t("common.body")}</label>
          <button type="button" style={S.placeholderBtn} onClick={() => bodyEditorRef.current?.insertPlaceholder?.()} title={t("template.insertPlaceholder")}>【】</button>
        </div>
        <TokenPromptInput
          value={draft.body}
          onChange={(next) => setDraft((prev) => ({ ...prev, body: next }))}
          editorRef={bodyEditorRef}
          placeholder={t("template.styleBodyPlaceholder")}
          rows={5}
        />
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            style={{ ...S.apiSaveBtn, opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}
            onClick={onSave}
            disabled={!canSave}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InputImagesModal({ show, onClose, title, images, maxCount, onUploadFiles, onRemoveAt }) {
  const { t } = useI18n();
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
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{title || t("images.defaultTitle")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.modalInputImagesHint}>{t("images.modalHint")}</div>
        <div style={S.modalInputImagesGrid}>
          <button
            type="button"
            style={{ ...S.modalInputImageEmpty, ...(remainingCount <= 0 ? S.modalInputImageEmptyDisabled : null) }}
            onClick={() => fileInputRef.current?.click()}
            disabled={remainingCount <= 0}
          >
            <span style={S.modalInputImageUploadPlus}>+</span>
            <span style={S.modalInputImageUploadText}>{t("common.upload")}</span>
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

export function PromptImageEditorModal({ show, onClose, images, initialIndex = 0, onConfirm }) {
  const { t } = useI18n();
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasMetricsRef = useRef(null);
  const [draftImages, setDraftImages] = useState([]);
  const [undoStacks, setUndoStacks] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tool, setTool] = useState("crop");
  const [strokeColor, setStrokeColor] = useState(INPUT_IMAGE_EDITOR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 720, height: 520 });
  const [currentImageInfo, setCurrentImageInfo] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const [pendingCrop, setPendingCrop] = useState(null);

  useEffect(() => {
    if (!show) return;
    const safeImages = Array.isArray(images)
      ? images.filter((item) => typeof item === "string" && item).slice(0, MAX_INPUT_IMAGES_PER_BATCH)
      : [];
    setDraftImages(safeImages);
    setUndoStacks(safeImages.map(() => []));
    setActiveIndex(Math.max(0, Math.min(safeImages.length - 1, Number(initialIndex) || 0)));
    setTool("crop");
    setStrokeColor(INPUT_IMAGE_EDITOR_COLORS[0]);
    setBusy(false);
    setInteraction(null);
    setPendingCrop(null);
  }, [show, images, initialIndex]);

  const currentImage = draftImages[activeIndex] || "";
  const currentUndoCount = Array.isArray(undoStacks[activeIndex]) ? undoStacks[activeIndex].length : 0;
  const toolOptions = useMemo(() => ([
    { id: "crop", label: t("imageEditor.toolCrop") },
    { id: "rect", label: t("imageEditor.toolRect") },
    { id: "line", label: t("imageEditor.toolLine") },
    { id: "arrow", label: t("imageEditor.toolArrow") },
  ]), [t]);

  useEffect(() => {
    if (!show || !currentImage) {
      setCurrentImageInfo(null);
      return undefined;
    }
    let cancelled = false;
    loadImageElement(currentImage)
      .then((image) => {
        if (cancelled) return;
        setCurrentImageInfo({
          image,
          width: Math.max(1, image.naturalWidth || image.width || 1),
          height: Math.max(1, image.naturalHeight || image.height || 1),
        });
      })
      .catch(() => {
        if (!cancelled) setCurrentImageInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [show, currentImage]);

  useEffect(() => {
    if (!show) return undefined;
    const updateViewportSize = () => {
      const node = viewportRef.current;
      if (!node) return;
      setViewportSize({
        width: Math.max(320, node.clientWidth || 320),
        height: Math.max(320, node.clientHeight || 320),
      });
    };

    updateViewportSize();
    let observer = null;
    if (typeof ResizeObserver !== "undefined" && viewportRef.current) {
      observer = new ResizeObserver(updateViewportSize);
      observer.observe(viewportRef.current);
    }
    window.addEventListener("resize", updateViewportSize);
    return () => {
      observer?.disconnect?.();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [show]);

  useEffect(() => {
    setInteraction(null);
    setPendingCrop(null);
  }, [activeIndex, tool]);

  const getPointerData = useCallback((event) => {
    const canvas = canvasRef.current;
    const metrics = canvasMetricsRef.current;
    if (!canvas || !metrics) return null;
    const rect = canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const inside =
      rawX >= metrics.offsetX &&
      rawX <= metrics.offsetX + metrics.drawWidth &&
      rawY >= metrics.offsetY &&
      rawY <= metrics.offsetY + metrics.drawHeight;
    const clampedX = Math.max(metrics.offsetX, Math.min(metrics.offsetX + metrics.drawWidth, rawX));
    const clampedY = Math.max(metrics.offsetY, Math.min(metrics.offsetY + metrics.drawHeight, rawY));
    return {
      inside,
      image: {
        x: ((clampedX - metrics.offsetX) / metrics.drawWidth) * metrics.imageWidth,
        y: ((clampedY - metrics.offsetY) / metrics.drawHeight) * metrics.imageHeight,
      },
    };
  }, []);

  const commitCurrentImageChange = useCallback(async (resolver) => {
    const source = draftImages[activeIndex];
    if (busy || !source) return;
    setBusy(true);
    try {
      const nextImage = await resolver(source);
      if (typeof nextImage !== "string" || !nextImage.startsWith("data:image/") || nextImage === source) return;
      setDraftImages((prev) => {
        const next = [...prev];
        next[activeIndex] = nextImage;
        return next;
      });
      setUndoStacks((prev) => {
        const next = prev.map((stack) => (Array.isArray(stack) ? [...stack] : []));
        next[activeIndex] = [...(next[activeIndex] || []), source];
        return next;
      });
    } catch {
      // Ignore editor operation failures and keep the current draft intact.
    } finally {
      setBusy(false);
      setInteraction(null);
      setPendingCrop(null);
    }
  }, [activeIndex, busy, draftImages]);

  const handleUndo = useCallback(() => {
    if (busy || !currentUndoCount) return;
    setDraftImages((prev) => {
      const next = [...prev];
      const previousImage = undoStacks[activeIndex]?.[undoStacks[activeIndex].length - 1];
      if (typeof previousImage === "string" && previousImage) {
        next[activeIndex] = previousImage;
      }
      return next;
    });
    setUndoStacks((prev) => {
      const next = prev.map((stack) => (Array.isArray(stack) ? [...stack] : []));
      if (next[activeIndex]?.length) next[activeIndex].pop();
      return next;
    });
    setInteraction(null);
    setPendingCrop(null);
  }, [activeIndex, busy, currentUndoCount, undoStacks]);

  const applyPendingCrop = useCallback(async () => {
    if (!isEditorRectValid(pendingCrop, 8)) return;
    await commitCurrentImageChange((source) => cropInputImageDataUrl(source, pendingCrop));
  }, [commitCurrentImageChange, pendingCrop]);

  const handlePointerDown = useCallback((event) => {
    if (busy || !currentImageInfo || event.button !== 0) return;
    const point = getPointerData(event);
    if (!point?.inside) return;
    event.preventDefault();
    if (tool === "crop") setPendingCrop(null);
    setInteraction({
      start: point.image,
      end: point.image,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [busy, currentImageInfo, getPointerData, tool]);

  const handlePointerMove = useCallback((event) => {
    if (!interaction) return;
    const point = getPointerData(event);
    if (!point) return;
    setInteraction((prev) => (prev ? { ...prev, end: point.image } : prev));
  }, [getPointerData, interaction]);

  const handlePointerUp = useCallback(async (event) => {
    if (!interaction || !currentImageInfo) return;
    const point = getPointerData(event);
    const endPoint = point?.image || interaction.end;
    const nextRect = normalizeEditorRect(interaction.start, endPoint, currentImageInfo.width, currentImageInfo.height);
    setInteraction(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (tool === "crop") {
      setPendingCrop(isEditorRectValid(nextRect, 8) ? nextRect : null);
      return;
    }

    if (tool === "rect") {
      if (!isEditorRectValid(nextRect, 8)) return;
      await commitCurrentImageChange((source) =>
        applyInputImageEditorOperation(source, {
          type: "rect",
          rect: nextRect,
          color: strokeColor,
          strokeWidth: getInputImageEditorStrokeWidth(currentImageInfo.width, currentImageInfo.height),
        })
      );
      return;
    }

    const deltaX = (endPoint?.x ?? 0) - (interaction.start?.x ?? 0);
    const deltaY = (endPoint?.y ?? 0) - (interaction.start?.y ?? 0);
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 8) return;
    await commitCurrentImageChange((source) =>
      applyInputImageEditorOperation(source, {
        type: tool,
        start: interaction.start,
        end: endPoint,
        color: strokeColor,
        strokeWidth: getInputImageEditorStrokeWidth(currentImageInfo.width, currentImageInfo.height),
      })
    );
  }, [commitCurrentImageChange, currentImageInfo, getPointerData, interaction, strokeColor, tool]);

  useEffect(() => {
    if (!show) return undefined;
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, onClose, show]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const info = currentImageInfo;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = Math.max(320, Math.round(viewportSize.width || 320));
    const height = Math.max(320, Math.round(viewportSize.height || 320));
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, width, height);

    if (!info) {
      canvasMetricsRef.current = null;
      ctx.fillStyle = "#71717a";
      ctx.font = '14px monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("imageEditor.noImage"), width / 2, height / 2);
      return;
    }

    const scale = Math.min(width / info.width, height / info.height);
    const drawWidth = Math.max(1, info.width * scale);
    const drawHeight = Math.max(1, info.height * scale);
    const offsetX = Math.round((width - drawWidth) / 2);
    const offsetY = Math.round((height - drawHeight) / 2);
    canvasMetricsRef.current = {
      offsetX,
      offsetY,
      drawWidth,
      drawHeight,
      imageWidth: info.width,
      imageHeight: info.height,
    };

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(offsetX - 1, offsetY - 1, drawWidth + 2, drawHeight + 2);
    ctx.drawImage(info.image, offsetX, offsetY, drawWidth, drawHeight);

    const toCanvasRect = (rect) => ({
      x: offsetX + (rect.x / info.width) * drawWidth,
      y: offsetY + (rect.y / info.height) * drawHeight,
      width: (rect.width / info.width) * drawWidth,
      height: (rect.height / info.height) * drawHeight,
    });
    const toCanvasPoint = (point) => ({
      x: offsetX + (point.x / info.width) * drawWidth,
      y: offsetY + (point.y / info.height) * drawHeight,
    });

    if (tool === "crop") {
      const cropRect = interaction
        ? normalizeEditorRect(interaction.start, interaction.end, info.width, info.height)
        : pendingCrop;
      if (isEditorRectValid(cropRect, 2)) {
        const previewRect = toCanvasRect(cropRect);
        ctx.save();
        ctx.fillStyle = "rgba(2,6,23,0.48)";
        ctx.fillRect(offsetX, offsetY, drawWidth, drawHeight);
        ctx.drawImage(
          info.image,
          cropRect.x,
          cropRect.y,
          cropRect.width,
          cropRect.height,
          previewRect.x,
          previewRect.y,
          previewRect.width,
          previewRect.height
        );
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(previewRect.x, previewRect.y, previewRect.width, previewRect.height);
        ctx.restore();
      }
      return;
    }

    if (!interaction) return;
    const previewStrokeWidth = Math.max(2, Math.round(Math.max(drawWidth, drawHeight) / 260));
    if (tool === "rect") {
      const rect = normalizeEditorRect(interaction.start, interaction.end, info.width, info.height);
      if (!isEditorRectValid(rect, 2)) return;
      drawInputImageEditorShape(ctx, {
        type: "rect",
        rect: toCanvasRect(rect),
        color: strokeColor,
        strokeWidth: previewStrokeWidth,
      });
      return;
    }

    drawInputImageEditorShape(ctx, {
      type: tool,
      start: toCanvasPoint(interaction.start),
      end: toCanvasPoint(interaction.end),
      color: strokeColor,
      strokeWidth: previewStrokeWidth,
    });
  }, [currentImageInfo, interaction, pendingCrop, strokeColor, t, tool, viewportSize.height, viewportSize.width]);

  if (!show) return null;

  const currentPage = draftImages.length ? activeIndex + 1 : 0;
  const activeHint = pendingCrop ? t("imageEditor.cropReady") : tool === "crop" ? t("imageEditor.cropHint") : t("imageEditor.drawHint");

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.inputImageEditorModal} onClick={(event) => event.stopPropagation()}>
        <div style={S.inputImageEditorHeader}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("imageEditor.title")}</h2>
            <div style={S.inputImageEditorHeaderHint}>{t("imageEditor.hint")}</div>
          </div>
          <button onClick={onClose} style={S.closeBtn} disabled={busy}>✕</button>
        </div>

        <div style={S.inputImageEditorLayout}>
          <aside style={S.inputImageEditorSidebar}>
            <div style={S.inputImageEditorBlock}>
              <div style={S.inputImageEditorLabel}>{t("imageEditor.tools")}</div>
              <div style={S.inputImageEditorToolGrid}>
                {toolOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    style={{ ...S.inputImageEditorToolBtn, ...(tool === option.id ? S.inputImageEditorToolBtnActive : null) }}
                    onClick={() => setTool(option.id)}
                    disabled={busy}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={S.inputImageEditorBlock}>
              <div style={S.inputImageEditorLabel}>{t("imageEditor.colors")}</div>
              <div style={S.inputImageEditorColorRow}>
                {INPUT_IMAGE_EDITOR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    style={{
                      ...S.inputImageEditorColorBtn,
                      background: color,
                      ...(strokeColor === color ? S.inputImageEditorColorBtnActive : null),
                    }}
                    onClick={() => setStrokeColor(color)}
                    disabled={busy}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <div style={S.inputImageEditorBlock}>
              <div style={S.inputImageEditorLabel}>{t("imageEditor.page", { current: currentPage, total: draftImages.length })}</div>
              <div style={S.inputImageEditorNavRow}>
                <button
                  type="button"
                  style={{ ...S.inputImageEditorMiniBtn, ...(activeIndex <= 0 ? S.inputImageEditorMiniBtnDisabled : null) }}
                  onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
                  disabled={busy || activeIndex <= 0}
                >
                  {t("imageEditor.prev")}
                </button>
                <button
                  type="button"
                  style={{ ...S.inputImageEditorMiniBtn, ...(activeIndex >= draftImages.length - 1 ? S.inputImageEditorMiniBtnDisabled : null) }}
                  onClick={() => setActiveIndex((prev) => Math.min(draftImages.length - 1, prev + 1))}
                  disabled={busy || activeIndex >= draftImages.length - 1}
                >
                  {t("imageEditor.next")}
                </button>
              </div>
              <div style={S.inputImageEditorStatus}>{activeHint}</div>
              {draftImages.length > 1 && <div style={S.inputImageEditorSubHint}>{t("imageEditor.multiHint")}</div>}
            </div>

            <div style={{ ...S.inputImageEditorBlock, marginTop: "auto" }}>
              <div style={S.inputImageEditorActionGrid}>
                <button
                  type="button"
                  style={{ ...S.inputImageEditorActionBtn, ...(currentUndoCount ? null : S.inputImageEditorActionBtnDisabled) }}
                  onClick={handleUndo}
                  disabled={busy || !currentUndoCount}
                >
                  {t("imageEditor.undo")}
                </button>
                {tool === "crop" ? (
                  <>
                    <button
                      type="button"
                      style={{ ...S.inputImageEditorActionBtn, ...(isEditorRectValid(pendingCrop, 8) ? null : S.inputImageEditorActionBtnDisabled) }}
                      onClick={applyPendingCrop}
                      disabled={busy || !isEditorRectValid(pendingCrop, 8)}
                    >
                      {t("imageEditor.applyCrop")}
                    </button>
                    <button
                      type="button"
                      style={{ ...S.inputImageEditorGhostBtn, ...(pendingCrop ? null : S.inputImageEditorActionBtnDisabled) }}
                      onClick={() => setPendingCrop(null)}
                      disabled={busy || !pendingCrop}
                    >
                      {t("imageEditor.clearCrop")}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  style={S.inputImageEditorGhostBtn}
                  onClick={onClose}
                  disabled={busy}
                >
                  {t("imageEditor.cancel")}
                </button>
                <button
                  type="button"
                  style={S.inputImageEditorConfirmBtn}
                  onClick={() => onConfirm?.(draftImages)}
                  disabled={busy || !draftImages.length}
                >
                  {busy ? t("common.processing") : t("imageEditor.confirm")}
                </button>
              </div>
            </div>
          </aside>

          <div style={S.inputImageEditorMain}>
            <div ref={viewportRef} style={S.inputImageEditorViewport}>
              <canvas
                ref={canvasRef}
                style={{
                  ...S.inputImageEditorCanvas,
                  cursor: busy ? "wait" : "crosshair",
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => setInteraction(null)}
              />
            </div>

            <div style={S.inputImageEditorThumbStrip}>
              {draftImages.map((image, index) => (
                <button
                  key={`prompt-editor-thumb-${index}`}
                  type="button"
                  style={{
                    ...S.inputImageEditorThumbBtn,
                    ...(activeIndex === index ? S.inputImageEditorThumbBtnActive : null),
                  }}
                  onClick={() => setActiveIndex(index)}
                  disabled={busy}
                >
                  <img src={image} alt={`Prompt ${index + 1}`} style={S.inputImageEditorThumbImg} />
                  <span style={S.inputImageEditorThumbIndex}>{index + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SelectionLimitModal({ show, onClose, limit }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.selectionLimitModal} onClick={(event) => event.stopPropagation()}>
        <div style={S.selectionLimitTitle}>{t("selectionLimit.title")}</div>
        <div style={S.selectionLimitText}>{t("selectionLimit.text", { limit })}</div>
      </div>
    </div>
  );
}
