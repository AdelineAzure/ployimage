import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IMAGE_MODELS } from "../../config/appConfig";
import { formatUiDateTime, localizeRuntimeMessage, useI18n } from "../../i18n";
import { ImagePreviewModal } from "../history/components";
import {
  cropInputImageDataUrl,
  downloadDataUrl,
  downloadImageUrl,
  fileToBase64,
  generateImage,
  getApiConfigForModel,
  isAbortError,
  loadImageElement,
  normalizeImageValue,
  splitImageBySubjects,
} from "../../services/appCore";
import { mono } from "../../styles/appStyles";

const BOARD_MIN_WIDTH = 1480;
const BOARD_MIN_HEIGHT = 980;
const BOARD_EXTEND_PADDING = 520;
const VIEWPORT_RENDER_PADDING = 360;
const NODE_WIDTH = 224;
const NODE_MIN_PREVIEW_HEIGHT = 110;
const NODE_MAX_PREVIEW_HEIGHT = 220;
const NODE_BASE_HEIGHT = 112;
const OUTPUT_GAP_X = 320;
const OUTPUT_GAP_Y = 248;
const IMPORT_COLUMNS = 3;
const MAX_UNDO_STEPS = 24;
const MAX_OUTPUT_COUNT = 8;

const CANVAS_BG = "rgba(255,255,255,0.03)";
const CANVAS_BORDER = "rgba(255,255,255,0.08)";
const CANVAS_MUTED = "#94a3b8";
const CANVAS_PRIMARY = "#93c5fd";
const CANVAS_PRIMARY_BG = "rgba(59,130,246,0.16)";
const CANVAS_PRIMARY_BORDER = "rgba(59,130,246,0.42)";
const CANVAS_EMERALD = "#dcfce7";
const CANVAS_EMERALD_BG = "rgba(34,197,94,0.16)";
const CANVAS_EMERALD_BORDER = "rgba(34,197,94,0.42)";
const CANVAS_RED = "#fecaca";
const CANVAS_RED_BG = "rgba(239,68,68,0.14)";
const CANVAS_RED_BORDER = "rgba(239,68,68,0.34)";
const CANVAS_GOLD = "#fde68a";
const CANVAS_GOLD_BG = "rgba(250,204,21,0.14)";
const CANVAS_GOLD_BORDER = "rgba(250,204,21,0.34)";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function serializeNodeSnapshot(node) {
  return {
    id: node?.id || "",
    title: node?.title || "",
    x: Number(node?.x) || 0,
    y: Number(node?.y) || 0,
    width: Math.max(0, Number(node?.width) || 0),
    height: Math.max(0, Number(node?.height) || 0),
    createdAt: Number(node?.createdAt) || 0,
    status: node?.status || "success",
    sourceType: node?.sourceType || "import",
    sourceLabel: node?.sourceLabel || "",
    modelId: node?.modelId || "",
    modelName: node?.modelName || "",
    promptText: node?.promptText || "",
    generationInputRefId: node?.generationInputRefId || "",
    inputNodeIds: Array.isArray(node?.inputNodeIds) ? [...node.inputNodeIds] : [],
    operationId: node?.operationId || "",
    operationType: node?.operationType || "",
    turnId: node?.turnId || "",
    turnSeq: Number(node?.turnSeq) || 0,
    error: node?.error || "",
    imageAssetId: node?.imageAssetId || "",
  };
}

function serializeEdgeSnapshot(edge) {
  return {
    id: edge?.id || "",
    fromIds: Array.isArray(edge?.fromIds) ? [...edge.fromIds] : [],
    toIds: Array.isArray(edge?.toIds) ? [...edge.toIds] : [],
    label: edge?.label || "",
    operationType: edge?.operationType || "",
    promptText: edge?.promptText || "",
    modelId: edge?.modelId || "",
    modelName: edge?.modelName || "",
    createdAt: Number(edge?.createdAt) || 0,
    status: edge?.status || "success",
    error: edge?.error || "",
    inputTitles: Array.isArray(edge?.inputTitles) ? [...edge.inputTitles] : [],
    outputTitles: Array.isArray(edge?.outputTitles) ? [...edge.outputTitles] : [],
  };
}

function getNodeAspectRatio(node) {
  const width = Math.max(1, Number(node?.width) || 0);
  const height = Math.max(1, Number(node?.height) || 0);
  if (width > 0 && height > 0) return width / height;
  return 1;
}

function getNodePreviewHeight(node) {
  const ratio = getNodeAspectRatio(node);
  return clamp(NODE_WIDTH / Math.max(0.5, ratio), NODE_MIN_PREVIEW_HEIGHT, NODE_MAX_PREVIEW_HEIGHT);
}

function getNodeFrame(node) {
  return {
    x: Number(node?.x) || 0,
    y: Number(node?.y) || 0,
    width: NODE_WIDTH,
    height: NODE_BASE_HEIGHT + getNodePreviewHeight(node),
  };
}

function getNodeOutputAnchor(node) {
  const frame = getNodeFrame(node);
  return {
    x: frame.x + frame.width,
    y: frame.y + frame.height / 2,
  };
}

function getNodeInputAnchor(node) {
  const frame = getNodeFrame(node);
  return {
    x: frame.x,
    y: frame.y + frame.height / 2,
  };
}

function getAveragePoint(points = []) {
  if (!points.length) return { x: 0, y: 0 };
  const total = points.reduce(
    (acc, point) => ({
      x: acc.x + (Number(point?.x) || 0),
      y: acc.y + (Number(point?.y) || 0),
    }),
    { x: 0, y: 0 }
  );
  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function buildEdgePath(start, end) {
  const dx = Math.max(120, Math.abs(end.x - start.x) * 0.48);
  return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
}

function buildStraightEdgePath(start, end) {
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

function getPathMidpoint(start, end) {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

function getEdgeAnchors(edge, nodeMap) {
  const fromNodes = (Array.isArray(edge?.fromIds) ? edge.fromIds : [])
    .map((id) => nodeMap.get(id))
    .filter(Boolean);
  const toNodes = (Array.isArray(edge?.toIds) ? edge.toIds : [])
    .map((id) => nodeMap.get(id))
    .filter(Boolean);
  const start = getAveragePoint(
    fromNodes.map((node) => getNodeOutputAnchor(node))
  );
  const end = getAveragePoint(
    toNodes.map((node) => getNodeInputAnchor(node))
  );
  return { start, end, fromNodes, toNodes };
}

function expandWorldRect(rect, padding = 0) {
  return {
    left: rect.left - padding,
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
  };
}

function isFrameVisible(frame, worldRect) {
  return !(
    frame.x + frame.width < worldRect.left ||
    frame.x > worldRect.right ||
    frame.y + frame.height < worldRect.top ||
    frame.y > worldRect.bottom
  );
}

function getSelectionBounds(nodes = []) {
  if (!nodes.length) return null;
  const frames = nodes.map((node) => getNodeFrame(node));
  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function getImportPositions(existingNodes, count) {
  const rootNodes = (Array.isArray(existingNodes) ? existingNodes : []).filter(
    (node) => !Array.isArray(node?.inputNodeIds) || node.inputNodeIds.length === 0
  );
  const startIndex = rootNodes.length;
  return Array.from({ length: count }, (_, index) => {
    const order = startIndex + index;
    const col = order % IMPORT_COLUMNS;
    const row = Math.floor(order / IMPORT_COLUMNS);
    return {
      x: 56 + col * OUTPUT_GAP_X,
      y: 56 + row * OUTPUT_GAP_Y,
    };
  });
}

function getOutputPositions(existingNodes, inputNodes, count) {
  if (!Array.isArray(inputNodes) || !inputNodes.length) {
    return getImportPositions(existingNodes, count);
  }
  const frames = inputNodes.map((node) => getNodeFrame(node));
  const maxRight = Math.max(...frames.map((frame) => frame.x + frame.width));
  const minTop = Math.min(...frames.map((frame) => frame.y));
  const cols = count >= 8 ? 4 : count >= 4 ? 2 : 1;
  return Array.from({ length: count }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: maxRight + 84 + col * OUTPUT_GAP_X,
      y: minTop + row * OUTPUT_GAP_Y,
    };
  });
}

function fitRect(containerWidth, containerHeight, imageWidth, imageHeight) {
  const safeImageWidth = Math.max(1, imageWidth || 1);
  const safeImageHeight = Math.max(1, imageHeight || 1);
  const scale = Math.min(containerWidth / safeImageWidth, containerHeight / safeImageHeight);
  const width = safeImageWidth * scale;
  const height = safeImageHeight * scale;
  return {
    width,
    height,
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
  };
}

function getToneStyle(tone = "info") {
  if (tone === "error") {
    return {
      borderColor: CANVAS_RED_BORDER,
      background: CANVAS_RED_BG,
      color: CANVAS_RED,
    };
  }
  if (tone === "success") {
    return {
      borderColor: CANVAS_EMERALD_BORDER,
      background: CANVAS_EMERALD_BG,
      color: CANVAS_EMERALD,
    };
  }
  return {
    borderColor: CANVAS_PRIMARY_BORDER,
    background: CANVAS_PRIMARY_BG,
    color: CANVAS_PRIMARY,
  };
}

function buildNodeInfoTitle(node, t) {
  const lines = [];
  lines.push(node?.modelName || t("canvas.unknownModel"));
  if ((Number(node?.width) || 0) > 0 && (Number(node?.height) || 0) > 0) {
    lines.push(`${node.width} × ${node.height}`);
  }
  if (node?.sourceLabel) lines.push(node.sourceLabel);
  if (node?.createdAt) lines.push(formatUiDateTime(node.createdAt));
  return lines.join(" · ");
}

function getCanvasModelFallback(selectedModels = []) {
  const firstSelected = Array.isArray(selectedModels) ? selectedModels.find(Boolean) : "";
  if (firstSelected && IMAGE_MODELS.some((item) => item.id === firstSelected)) return firstSelected;
  return IMAGE_MODELS[0]?.id || "";
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
    } catch (error) {
      reject(error);
    }
  });
}

function CanvasOperationModal({
  state,
  onClose,
  onConfirm,
  recommendedModelId,
}) {
  const { t } = useI18n();
  const [promptText, setPromptText] = useState(state.promptText || "");
  const [count, setCount] = useState(Math.max(1, Number(state.count) || 1));
  const [modelId, setModelId] = useState(state.modelId || recommendedModelId || IMAGE_MODELS[0]?.id || "");

  useEffect(() => {
    setPromptText(state.promptText || "");
    setCount(Math.max(1, Number(state.count) || 1));
    setModelId(state.modelId || recommendedModelId || IMAGE_MODELS[0]?.id || "");
  }, [state, recommendedModelId]);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div style={styles.modalTitle}>{state.title || t("canvas.operationTitle")}</div>
            <div style={styles.modalSub}>
              {t("canvas.selectionCount", { count: state.selectionCount || 0 })} · {state.contextText || t("canvas.operationHint")}
            </div>
          </div>
          <button type="button" style={styles.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.fieldBlock}>
            <label style={styles.fieldLabel}>{t("canvas.model")}</label>
            <select style={styles.select} value={modelId} onChange={(event) => setModelId(event.target.value)}>
              {IMAGE_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.fieldBlock}>
            <label style={styles.fieldLabel}>{t("canvas.outputCount")}</label>
            <input
              type="number"
              min={1}
              max={MAX_OUTPUT_COUNT}
              style={styles.input}
              value={count}
              onChange={(event) => setCount(clamp(event.target.value, 1, MAX_OUTPUT_COUNT))}
            />
          </div>
          <div style={styles.fieldBlock}>
            <label style={styles.fieldLabel}>{t("canvas.prompt")}</label>
            <textarea
              rows={7}
              style={styles.textarea}
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder={t("canvas.promptPlaceholder")}
            />
          </div>
        </div>
        <div style={styles.modalActions}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose}>
            {t("canvas.cancel")}
          </button>
          <button
            type="button"
            style={{ ...styles.primaryBtn, opacity: promptText.trim() ? 1 : 0.55, cursor: promptText.trim() ? "pointer" : "not-allowed" }}
            onClick={() => {
              if (!promptText.trim()) return;
              onConfirm({
                promptText,
                count: clamp(count, 1, MAX_OUTPUT_COUNT),
                modelId,
              });
            }}
            disabled={!promptText.trim()}
          >
            {t("canvas.runOperation")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CanvasCropModal({ node, onClose, onConfirm }) {
  const { t } = useI18n();
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [imageInfo, setImageInfo] = useState({ width: 0, height: 0, ready: false });
  const [rects, setRects] = useState([]);
  const [draftRect, setDraftRect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRects([]);
    setDraftRect(null);
    setStatusText("");
    setBusy(false);
    loadImageElement(node?.image || "")
      .then((image) => {
        if (cancelled) return;
        setImageInfo({
          width: Math.max(1, image?.naturalWidth || image?.width || 1),
          height: Math.max(1, image?.naturalHeight || image?.height || 1),
          ready: true,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setImageInfo({ width: 0, height: 0, ready: false });
        setStatusText(t("canvas.cropLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [node, t]);

  const toImagePoint = useCallback((clientX, clientY) => {
    const stage = stageRef.current;
    if (!stage || !imageInfo.ready) return null;
    const rect = stage.getBoundingClientRect();
    const fitted = fitRect(rect.width, rect.height, imageInfo.width, imageInfo.height);
    const x = clamp(clientX - rect.left, fitted.left, fitted.left + fitted.width);
    const y = clamp(clientY - rect.top, fitted.top, fitted.top + fitted.height);
    return {
      x: Math.round(((x - fitted.left) / fitted.width) * imageInfo.width),
      y: Math.round(((y - fitted.top) / fitted.height) * imageInfo.height),
    };
  }, [imageInfo]);

  const toOverlayRect = useCallback((imageRect) => {
    const stage = stageRef.current;
    if (!stage || !imageInfo.ready) return null;
    const rect = stage.getBoundingClientRect();
    const fitted = fitRect(rect.width, rect.height, imageInfo.width, imageInfo.height);
    return {
      left: fitted.left + (Number(imageRect.x) || 0) / imageInfo.width * fitted.width,
      top: fitted.top + (Number(imageRect.y) || 0) / imageInfo.height * fitted.height,
      width: Math.max(1, (Number(imageRect.width) || 0) / imageInfo.width * fitted.width),
      height: Math.max(1, (Number(imageRect.height) || 0) / imageInfo.height * fitted.height),
    };
  }, [imageInfo]);

  useEffect(() => {
    const handleMove = (event) => {
      if (!dragRef.current) return;
      const point = toImagePoint(event.clientX, event.clientY);
      if (!point) return;
      const start = dragRef.current.start;
      const x = Math.min(start.x, point.x);
      const y = Math.min(start.y, point.y);
      const width = Math.abs(point.x - start.x);
      const height = Math.abs(point.y - start.y);
      setDraftRect({
        x,
        y,
        width,
        height,
      });
    };
    const handleUp = () => {
      if (!dragRef.current) return;
      const completed = draftRect;
      dragRef.current = null;
      if (completed && completed.width > 6 && completed.height > 6) {
        setRects((prev) => [...prev, completed]);
      }
      setDraftRect(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draftRect, toImagePoint]);

  const handleConfirm = useCallback(async () => {
    if (!rects.length || busy) return;
    setBusy(true);
    setStatusText("");
    try {
      const images = await Promise.all(rects.map((rect) => cropInputImageDataUrl(node.image, rect)));
      const filtered = images.filter(Boolean);
      if (!filtered.length) {
        setStatusText(t("canvas.cropNoOutput"));
        return;
      }
      onConfirm(filtered);
    } catch (error) {
      setStatusText(
        t("canvas.cropFailed", {
          error: localizeRuntimeMessage(error?.message || t("common.unknownError"), t),
        })
      );
    } finally {
      setBusy(false);
    }
  }, [busy, node.image, onConfirm, rects, t]);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={{ ...styles.modalCard, maxWidth: 1160, width: "94vw" }} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div style={styles.modalTitle}>{t("canvas.cropTitle")}</div>
            <div style={styles.modalSub}>{t("canvas.cropHint")}</div>
          </div>
          <button type="button" style={styles.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ ...styles.modalBody, gridTemplateColumns: "minmax(0, 1fr) 240px" }}>
          <div
            ref={stageRef}
            style={styles.cropStage}
            onMouseDown={(event) => {
              if (event.button !== 0 || !imageInfo.ready || busy) return;
              const point = toImagePoint(event.clientX, event.clientY);
              if (!point) return;
              dragRef.current = { start: point };
              setDraftRect({
                x: point.x,
                y: point.y,
                width: 0,
                height: 0,
              });
            }}
          >
            {!!node?.image && (
              <img
                src={node.image}
                alt={node?.title || "crop-source"}
                style={styles.cropStageImage}
                draggable={false}
              />
            )}
            {rects.map((rect, index) => {
              const overlayRect = toOverlayRect(rect);
              if (!overlayRect) return null;
              return (
                <div
                  key={`rect-${index}`}
                  style={{
                    ...styles.cropOverlayRect,
                    left: overlayRect.left,
                    top: overlayRect.top,
                    width: overlayRect.width,
                    height: overlayRect.height,
                  }}
                >
                  <span style={styles.cropOverlayIndex}>{index + 1}</span>
                </div>
              );
            })}
            {draftRect && (() => {
              const overlayRect = toOverlayRect(draftRect);
              if (!overlayRect) return null;
              return (
                <div
                  style={{
                    ...styles.cropOverlayRect,
                    ...styles.cropOverlayRectDraft,
                    left: overlayRect.left,
                    top: overlayRect.top,
                    width: overlayRect.width,
                    height: overlayRect.height,
                  }}
                />
              );
            })()}
          </div>
          <div style={styles.cropSidebar}>
            <div style={styles.panelTitle}>{t("canvas.cropSelection")}</div>
            <div style={styles.panelSub}>{t("canvas.selectionCount", { count: rects.length })}</div>
            <div style={styles.actionGrid}>
              <button
                type="button"
                style={{ ...styles.secondaryBtn, width: "100%" }}
                onClick={() => setRects((prev) => prev.slice(0, -1))}
                disabled={!rects.length || busy}
              >
                {t("canvas.undoOne")}
              </button>
              <button
                type="button"
                style={{ ...styles.secondaryBtn, width: "100%" }}
                onClick={() => {
                  setRects([]);
                  setDraftRect(null);
                }}
                disabled={!rects.length || busy}
              >
                {t("canvas.clearAll")}
              </button>
              <button
                type="button"
                style={{ ...styles.primaryBtn, width: "100%", opacity: rects.length ? 1 : 0.55, cursor: rects.length ? "pointer" : "not-allowed" }}
                onClick={handleConfirm}
                disabled={!rects.length || busy}
              >
                {busy ? t("common.processing") : t("canvas.confirmCrop")}
              </button>
            </div>
            {!!statusText && <div style={{ ...styles.inlineStatus, ...getToneStyle("error") }}>{statusText}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CanvasPage({
  visible = false,
  externalImportQueue = [],
  templates = [],
  styleTemplates = [],
  historyDirHandle = null,
  historyDirName = "",
  onPickHistoryFolder = null,
  selectedModels = [],
  apiKeys = {},
  apiBaseUrl = "",
  proxyUrl = "",
  aspectRatio = "auto",
  qwenPromptExtend = true,
  qwenPromptExtendMode = "direct",
  onOpenSplitNode = null,
}) {
  const { t } = useI18n();
  const boardRef = useRef(null);
  const fileInputRef = useRef(null);
  const nodeSeqRef = useRef(1);
  const edgeSeqRef = useRef(1);
  const imageAssetSeqRef = useRef(1);
  const generationInputSeqRef = useRef(1);
  const nodeDragRef = useRef(null);
  const panRef = useRef(null);
  const marqueeRef = useRef(null);
  const wheelLiteTimerRef = useRef(null);
  const operationControllersRef = useRef(new Map());
  const imageAssetStoreRef = useRef(new Map());
  const generationInputStoreRef = useRef(new Map());
  const handledExternalImportIdsRef = useRef(new Set());
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState(null);
  const [statusText, setStatusText] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const [viewport, setViewport] = useState({ x: 56, y: 48, scale: 1 });
  const [marqueeRect, setMarqueeRect] = useState(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [operationModal, setOperationModal] = useState(null);
  const [cropState, setCropState] = useState(null);
  const [canvasModelId, setCanvasModelId] = useState(getCanvasModelFallback(selectedModels));
  const [showInlineTemplatePanel, setShowInlineTemplatePanel] = useState(false);
  const [liteInteraction, setLiteInteraction] = useState(false);

  useEffect(() => {
    setCanvasModelId((current) => {
      if (current && IMAGE_MODELS.some((item) => item.id === current)) return current;
      return getCanvasModelFallback(selectedModels);
    });
  }, [selectedModels]);

  useEffect(() => {
    if (!selectedNodeIds.length) setShowInlineTemplatePanel(false);
  }, [selectedNodeIds.length]);

  const registerImageAsset = useCallback((image, preferredId = "") => {
    if (typeof image !== "string" || !image) return "";
    const assetId = preferredId || `canvas-asset-${imageAssetSeqRef.current}`;
    if (!preferredId) imageAssetSeqRef.current += 1;
    imageAssetStoreRef.current.set(assetId, image);
    return assetId;
  }, []);

  const resolveImageAsset = useCallback((assetId) => {
    if (!assetId) return "";
    return imageAssetStoreRef.current.get(assetId) || "";
  }, []);

  const registerGenerationInputImages = useCallback((images, preferredId = "") => {
    const filtered = (Array.isArray(images) ? images : []).filter(Boolean);
    if (!filtered.length) return "";
    const refId = preferredId || `canvas-input-${generationInputSeqRef.current}`;
    if (!preferredId) generationInputSeqRef.current += 1;
    generationInputStoreRef.current.set(refId, filtered);
    return refId;
  }, []);

  const resolveGenerationInputImages = useCallback((node) => {
    if (node?.generationInputRefId) {
      const stored = generationInputStoreRef.current.get(node.generationInputRefId);
      if (Array.isArray(stored) && stored.length) return stored.filter(Boolean);
    }
    return node?.image ? [node.image] : [];
  }, []);

  const createSnapshot = useCallback(() => ({
    nodes: nodes.map((node) => serializeNodeSnapshot(node)),
    edges: edges.map((edge) => serializeEdgeSnapshot(edge)),
    selectedNodeIds: [...selectedNodeIds],
    selectedEdgeId,
    viewport: {
      x: Number(viewport?.x) || 0,
      y: Number(viewport?.y) || 0,
      scale: Number(viewport?.scale) || 1,
    },
  }), [edges, nodes, selectedEdgeId, selectedNodeIds, viewport]);

  const abortOperation = useCallback((operationId) => {
    if (!operationId) return;
    const controller = operationControllersRef.current.get(operationId);
    if (!controller) return;
    controller.abort();
    operationControllersRef.current.delete(operationId);
  }, []);

  const abortAllOperations = useCallback(() => {
    operationControllersRef.current.forEach((controller) => controller.abort());
    operationControllersRef.current.clear();
  }, []);

  const restoreSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    abortAllOperations();
    setNodes(
      Array.isArray(snapshot.nodes)
        ? snapshot.nodes.map((node) => ({
            ...node,
            image: node?.image || resolveImageAsset(node?.imageAssetId || ""),
          }))
        : []
    );
    setEdges(Array.isArray(snapshot.edges) ? snapshot.edges : []);
    setSelectedNodeIds(Array.isArray(snapshot.selectedNodeIds) ? snapshot.selectedNodeIds : []);
    setSelectedEdgeId(snapshot.selectedEdgeId || null);
    setViewport(snapshot.viewport || { x: 56, y: 48, scale: 1 });
  }, [abortAllOperations, resolveImageAsset]);

  const pushUndoSnapshot = useCallback((snapshot = null) => {
    const nextSnapshot = snapshot || createSnapshot();
    setUndoStack((prev) => [...prev, nextSnapshot].slice(-MAX_UNDO_STEPS));
    setRedoStack([]);
  }, [createSnapshot]);

  const hydrateImageMeta = useCallback(async (image) => {
    const normalized = normalizeImageValue(image, apiBaseUrl);
    if (!normalized) {
      return { image: "", width: 0, height: 0 };
    }
    try {
      const element = await loadImageElement(normalized);
      return {
        image: normalized,
        width: Math.max(1, element?.naturalWidth || element?.width || 1),
        height: Math.max(1, element?.naturalHeight || element?.height || 1),
      };
    } catch {
      return { image: normalized, width: 0, height: 0 };
    }
  }, [apiBaseUrl]);

  const nextNodeId = useCallback(() => {
    const id = `canvas-node-${nodeSeqRef.current}`;
    nodeSeqRef.current += 1;
    return id;
  }, []);

  const nextEdgeId = useCallback(() => {
    const id = `canvas-edge-${edgeSeqRef.current}`;
    edgeSeqRef.current += 1;
    return id;
  }, []);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedNodes = useMemo(
    () => selectedNodeIds.map((id) => nodeMap.get(id)).filter(Boolean),
    [nodeMap, selectedNodeIds]
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) || null,
    [edges, selectedEdgeId]
  );
  const primaryNode = selectedNodes[0] || null;
  const hasAnyApiKey = useMemo(
    () => Object.values(apiKeys || {}).some((value) => typeof value === "string" && value.trim()),
    [apiKeys]
  );
  const boardWorldSize = useMemo(() => {
    const frames = nodes.map((node) => getNodeFrame(node));
    const maxRight = frames.length ? Math.max(...frames.map((frame) => frame.x + frame.width)) : 0;
    const maxBottom = frames.length ? Math.max(...frames.map((frame) => frame.y + frame.height)) : 0;
    const visibleWorldRight =
      boardSize.width && viewport.scale
        ? (boardSize.width - viewport.x) / viewport.scale
        : 0;
    const visibleWorldBottom =
      boardSize.height && viewport.scale
        ? (boardSize.height - viewport.y) / viewport.scale
        : 0;
    return {
      width: Math.max(BOARD_MIN_WIDTH, maxRight + BOARD_EXTEND_PADDING, visibleWorldRight + BOARD_EXTEND_PADDING),
      height: Math.max(BOARD_MIN_HEIGHT, maxBottom + BOARD_EXTEND_PADDING, visibleWorldBottom + BOARD_EXTEND_PADDING),
    };
  }, [boardSize.height, boardSize.width, nodes, viewport.scale, viewport.x, viewport.y]);
  const visibleWorldRect = useMemo(() => {
    if (!boardSize.width || !boardSize.height || !viewport.scale) {
      return {
        left: 0,
        top: 0,
        right: boardWorldSize.width,
        bottom: boardWorldSize.height,
      };
    }
    return {
      left: (-viewport.x) / viewport.scale,
      top: (-viewport.y) / viewport.scale,
      right: (boardSize.width - viewport.x) / viewport.scale,
      bottom: (boardSize.height - viewport.y) / viewport.scale,
    };
  }, [boardSize.height, boardSize.width, boardWorldSize.height, boardWorldSize.width, viewport.scale, viewport.x, viewport.y]);
  const renderWorldRect = useMemo(
    () => expandWorldRect(visibleWorldRect, VIEWPORT_RENDER_PADDING),
    [visibleWorldRect]
  );
  const renderedNodes = useMemo(
    () =>
      nodes.filter((node) => selectedNodeIds.includes(node.id) || isFrameVisible(getNodeFrame(node), renderWorldRect)),
    [nodes, renderWorldRect, selectedNodeIds]
  );
  const renderedNodeIds = useMemo(
    () => new Set(renderedNodes.map((node) => node.id)),
    [renderedNodes]
  );
  const renderedEdges = useMemo(
    () =>
      edges.filter(
        (edge) =>
          edge.id === selectedEdgeId ||
          edge.fromIds.some((id) => renderedNodeIds.has(id)) ||
          edge.toIds.some((id) => renderedNodeIds.has(id))
      ),
    [edges, renderedNodeIds, selectedEdgeId]
  );
  const edgeRenderItems = useMemo(
    () =>
      renderedEdges
        .map((edge) => {
          const { start, end, fromNodes, toNodes } = getEdgeAnchors(edge, nodeMap);
          if (!fromNodes.length || !toNodes.length) return null;
          const isActive = edge.id === selectedEdgeId;
          const statusStroke =
            edge.status === "error"
              ? "rgba(248,113,113,0.82)"
              : edge.status === "cancelled"
              ? "rgba(148,163,184,0.72)"
              : edge.status === "loading"
              ? "rgba(250,204,21,0.78)"
              : isActive
              ? "rgba(96,165,250,0.95)"
              : "rgba(148,163,184,0.75)";
          return {
            edge,
            isActive,
            statusStroke,
            labelPoint: getPathMidpoint(start, end),
            paths: fromNodes.map((node) => {
              const startPoint = getNodeOutputAnchor(node);
              return {
                key: `${edge.id}:${node.id}`,
                d: liteInteraction ? buildStraightEdgePath(startPoint, end) : buildEdgePath(startPoint, end),
              };
            }),
          };
        })
        .filter(Boolean),
    [liteInteraction, nodeMap, renderedEdges, selectedEdgeId]
  );
  const selectedBounds = useMemo(() => getSelectionBounds(selectedNodes), [selectedNodes]);
  const inlineOpsPosition = useMemo(() => {
    if (!selectedBounds || !boardSize.width || !boardSize.height) return null;
    const panelWidth = 286;
    const panelHeight = showInlineTemplatePanel ? 396 : 198;
    const screenLeft = selectedBounds.left * viewport.scale + viewport.x;
    const screenRight = selectedBounds.right * viewport.scale + viewport.x;
    const screenTop = selectedBounds.top * viewport.scale + viewport.y;
    let left = screenRight + 14;
    if (left + panelWidth > boardSize.width - 12) {
      left = screenLeft - panelWidth - 14;
    }
    if (left < 12) left = 12;
    const top = clamp(screenTop, 12, Math.max(12, boardSize.height - panelHeight - 12));
    return { left, top, width: panelWidth };
  }, [boardSize.height, boardSize.width, selectedBounds, showInlineTemplatePanel, viewport.scale, viewport.x, viewport.y]);

  const buildNodeDraft = useCallback((overrides = {}) => ({
    id: overrides.id || nextNodeId(),
    title: overrides.title || t("canvas.imageNode"),
    image: overrides.image || "",
    imageAssetId:
      overrides.imageAssetId ||
      (overrides.image ? registerImageAsset(overrides.image) : ""),
    x: Number(overrides.x) || 0,
    y: Number(overrides.y) || 0,
    width: Math.max(0, Number(overrides.width) || 0),
    height: Math.max(0, Number(overrides.height) || 0),
    createdAt: Number(overrides.createdAt) || Date.now(),
    status: overrides.status || "success",
    sourceType: overrides.sourceType || "import",
    sourceLabel: overrides.sourceLabel || "",
    modelId: overrides.modelId || "",
    modelName: overrides.modelName || "",
    promptText: overrides.promptText || "",
    generationInputRefId: overrides.generationInputRefId || "",
    inputNodeIds: Array.isArray(overrides.inputNodeIds) ? overrides.inputNodeIds.filter(Boolean) : [],
    operationId: overrides.operationId || "",
    operationType: overrides.operationType || "",
    turnId: overrides.turnId || "",
    turnSeq: Number(overrides.turnSeq) || 0,
    error: overrides.error || "",
  }), [nextNodeId, registerImageAsset, t]);

  const addImportedItems = useCallback(async (items) => {
    const list = (Array.isArray(items) ? items : []).filter((item) => item?.image);
    if (!list.length) return;
    pushUndoSnapshot();
    const positions = getImportPositions(nodes, list.length);
    const hydrated = await Promise.all(list.map((item) => hydrateImageMeta(item.image)));
    const nextNodes = list.map((item, index) => {
      const meta = hydrated[index];
      return buildNodeDraft({
        image: meta.image,
        width: meta.width,
        height: meta.height,
        x: positions[index].x,
        y: positions[index].y,
        title: item.title || `${item.modelName || t("canvas.imageNode")} ${index + 1}`,
        sourceType: item.sourceType || "import",
        sourceLabel: item.sourceLabel || "",
        modelName: item.modelName || "",
        promptText: item.promptText || "",
        turnId: item.turnId || "",
        turnSeq: item.turnSeq || 0,
      });
    });
    setNodes((prev) => [...prev, ...nextNodes]);
    setSelectedNodeIds(nextNodes.map((node) => node.id));
    setSelectedEdgeId(null);
    setStatusTone("success");
    setStatusText(t("canvas.importedCount", { count: nextNodes.length }));
  }, [buildNodeDraft, hydrateImageMeta, nodes, pushUndoSnapshot, t]);

  useEffect(() => {
    const freshItems = (Array.isArray(externalImportQueue) ? externalImportQueue : [])
      .filter((item) => item?.requestId && !handledExternalImportIdsRef.current.has(item.requestId));
    if (!freshItems.length) return;
    freshItems.forEach((item) => handledExternalImportIdsRef.current.add(item.requestId));
    addImportedItems(freshItems);
  }, [addImportedItems, externalImportQueue]);

  const addDerivedNodes = useCallback(async ({
    sourceNodes,
    images,
    label,
    operationType,
    sourceType,
    promptText = "",
    modelId = "",
    modelName = "",
    titlePrefix = "",
    error = "",
  }) => {
    const filteredImages = (Array.isArray(images) ? images : []).filter(Boolean);
    if (!filteredImages.length) return;
    pushUndoSnapshot();
    const positions = getOutputPositions(nodes, sourceNodes, filteredImages.length);
    const hydrated = await Promise.all(filteredImages.map((image) => hydrateImageMeta(image)));
    const nextNodes = hydrated.map((meta, index) =>
      buildNodeDraft({
        image: meta.image,
        width: meta.width,
        height: meta.height,
        x: positions[index].x,
        y: positions[index].y,
        title: `${titlePrefix || label || t("canvas.imageNode")} ${index + 1}`,
        sourceType,
        sourceLabel: label,
        modelId,
        modelName,
        promptText,
        inputNodeIds: sourceNodes.map((node) => node.id),
        operationType,
        error,
      })
    );
    const edgeId = nextEdgeId();
    const nextEdge = {
      id: edgeId,
      fromIds: sourceNodes.map((node) => node.id),
      toIds: nextNodes.map((node) => node.id),
      label,
      operationType,
      promptText,
      modelId,
      modelName,
      createdAt: Date.now(),
      status: "success",
      error,
      inputTitles: sourceNodes.map((node) => node.title),
      outputTitles: nextNodes.map((node) => node.title),
    };
    setNodes((prev) => [...prev, ...nextNodes]);
    setEdges((prev) => [...prev, nextEdge]);
    setSelectedNodeIds(nextNodes.map((node) => node.id));
    setSelectedEdgeId(edgeId);
  }, [buildNodeDraft, hydrateImageMeta, nextEdgeId, nodes, pushUndoSnapshot, t]);

  const removeSelection = useCallback(() => {
    const removableIds = [];
    let stoppedAny = false;
    selectedNodes.forEach((node) => {
      if (node.status === "loading" && node.operationId) {
        abortOperation(node.operationId);
        stoppedAny = true;
      } else {
        removableIds.push(node.id);
      }
    });
    if (removableIds.length || selectedEdgeId) {
      pushUndoSnapshot();
      setNodes((prev) => prev.filter((node) => !removableIds.includes(node.id)));
      setEdges((prev) =>
        prev.filter((edge) => {
          if (selectedEdgeId && edge.id === selectedEdgeId) return false;
          if (edge.fromIds.some((id) => removableIds.includes(id))) return false;
          if (edge.toIds.some((id) => removableIds.includes(id))) return false;
          return true;
        })
      );
      setSelectedNodeIds((prev) => prev.filter((id) => !removableIds.includes(id)));
      if (selectedEdgeId) setSelectedEdgeId(null);
    }
    if (stoppedAny) {
      setStatusTone("info");
      setStatusText(t("canvas.operationStopped"));
    } else if (removableIds.length || selectedEdgeId) {
      setStatusTone("success");
      setStatusText(t("canvas.deletedSelection"));
    }
  }, [abortOperation, pushUndoSnapshot, selectedEdgeId, selectedNodes, t]);

  const runGenerationOperation = useCallback(async ({
    sourceNodes,
    operationType,
    label,
    promptText,
    modelId,
    count,
    sourceType,
    titlePrefix,
    inputImages: inputImagesOverride = null,
    inputRefId: inputRefIdOverride = "",
  }) => {
    const model = IMAGE_MODELS.find((item) => item.id === modelId);
    if (!model) {
      setStatusTone("error");
      setStatusText(t("canvas.modelMissing"));
      return;
    }
    const inputImages = Array.isArray(inputImagesOverride) && inputImagesOverride.length
      ? inputImagesOverride.filter(Boolean)
      : sourceNodes
          .map((node) => (typeof node?.image === "string" ? node.image : ""))
          .filter(Boolean);
    if (!inputImages.length) {
      setStatusTone("error");
      setStatusText(t("canvas.noInputImage"));
      return;
    }
    if (!promptText.trim()) {
      setStatusTone("error");
      setStatusText(t("canvas.promptRequired"));
      return;
    }
    const nextCount = clamp(count, 1, MAX_OUTPUT_COUNT);
    const operationId = `canvas-op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const positions = getOutputPositions(nodes, sourceNodes, nextCount);
    const generationInputRefId = registerGenerationInputImages(inputImages, inputRefIdOverride);
    const pendingNodes = Array.from({ length: nextCount }, (_, index) =>
      buildNodeDraft({
        x: positions[index].x,
        y: positions[index].y,
        title: `${titlePrefix || label || t("canvas.imageNode")} ${index + 1}`,
        sourceType,
        sourceLabel: label,
        modelId: model.id,
        modelName: model.name,
        promptText,
        inputNodeIds: sourceNodes.map((node) => node.id),
        generationInputRefId,
        operationId,
        operationType,
        createdAt: now,
        status: "loading",
      })
    );
    const edgeId = nextEdgeId();
    const nextEdge = {
      id: edgeId,
      fromIds: sourceNodes.map((node) => node.id),
      toIds: pendingNodes.map((node) => node.id),
      label,
      operationType,
      promptText,
      modelId: model.id,
      modelName: model.name,
      createdAt: now,
      status: "loading",
      error: "",
      inputTitles: sourceNodes.map((node) => node.title),
      outputTitles: pendingNodes.map((node) => node.title),
    };
    pushUndoSnapshot();
    setNodes((prev) => [...prev, ...pendingNodes]);
    setEdges((prev) => [...prev, nextEdge]);
    setSelectedNodeIds(pendingNodes.map((node) => node.id));
    setSelectedEdgeId(edgeId);
    setStatusTone("info");
    setStatusText(t("canvas.runningOperation", { label }));

    const controller = new AbortController();
    operationControllersRef.current.set(operationId, controller);
    try {
      const outputImages = await generateImage(proxyUrl, model, promptText, inputImages[0], {
        ...getApiConfigForModel(model, apiKeys),
        signal: controller.signal,
        apiBaseUrl,
        aspectRatio,
        promptExtend: qwenPromptExtend,
        promptExtendMode: qwenPromptExtendMode,
        count: nextCount,
        imageInputs: inputImages,
      });
      const hydrated = await Promise.all(
        pendingNodes.map((node, index) => hydrateImageMeta(outputImages[index] || ""))
      );
      setNodes((prev) =>
        prev.map((node) => {
          const pendingIndex = pendingNodes.findIndex((item) => item.id === node.id);
          if (pendingIndex < 0) return node;
          const meta = hydrated[pendingIndex];
          const image = outputImages[pendingIndex] || "";
          if (!image || !meta.image) {
            return {
              ...node,
              status: "error",
              error: t("canvas.notEnoughImages"),
              operationId: "",
            };
          }
          return {
            ...node,
            image: meta.image,
            imageAssetId: registerImageAsset(meta.image, node.imageAssetId || ""),
            width: meta.width,
            height: meta.height,
            status: "success",
            error: "",
            operationId: "",
          };
        })
      );
      setEdges((prev) =>
        prev.map((edge) =>
          edge.id !== edgeId
            ? edge
            : {
                ...edge,
                status: outputImages.length ? "success" : "error",
                error: outputImages.length ? "" : t("canvas.notEnoughImages"),
              }
        )
      );
      setStatusTone(outputImages.length ? "success" : "error");
      setStatusText(
        outputImages.length
          ? t("canvas.generatedCount", { count: outputImages.length })
          : t("canvas.notEnoughImages")
      );
    } catch (error) {
      const aborted = isAbortError(error);
      const message = aborted
        ? t("canvas.operationStopped")
        : t("canvas.operationFailed", {
            error: localizeRuntimeMessage(error?.message || t("common.unknownError"), t),
          });
      setNodes((prev) =>
        prev.map((node) =>
          node.operationId !== operationId
            ? node
            : {
                ...node,
                status: aborted ? "cancelled" : "error",
                error: aborted ? t("canvas.stopped") : localizeRuntimeMessage(error?.message || t("common.unknownError"), t),
                operationId: "",
              }
        )
      );
      setEdges((prev) =>
        prev.map((edge) =>
          edge.id !== edgeId
            ? edge
            : {
                ...edge,
                status: aborted ? "cancelled" : "error",
                error: aborted ? t("canvas.stopped") : localizeRuntimeMessage(error?.message || t("common.unknownError"), t),
              }
        )
      );
      setStatusTone(aborted ? "info" : "error");
      setStatusText(message);
    } finally {
      operationControllersRef.current.delete(operationId);
    }
  }, [apiBaseUrl, apiKeys, aspectRatio, buildNodeDraft, hydrateImageMeta, nextEdgeId, nodes, proxyUrl, pushUndoSnapshot, registerGenerationInputImages, registerImageAsset, t]);

  const handleApplyOperationModal = useCallback((payload) => {
    const sourceNodes = selectedNodes;
    const operationState = operationModal;
    setCanvasModelId(payload.modelId);
    setOperationModal(null);
    if (!operationState || !sourceNodes.length) return;
    runGenerationOperation({
      sourceNodes,
      operationType: operationState.operationType,
      label: operationState.label,
      promptText: payload.promptText,
      modelId: payload.modelId,
      count: payload.count,
      sourceType: operationState.sourceType,
      titlePrefix: operationState.titlePrefix,
    });
  }, [operationModal, runGenerationOperation, selectedNodes]);

  const openOperationModal = useCallback((config) => {
    if (!selectedNodes.length) {
      setStatusTone("error");
      setStatusText(t("canvas.selectNodeFirst"));
      return;
    }
    setOperationModal({
      ...config,
      selectionCount: selectedNodes.length,
      modelId: config.modelId || canvasModelId,
    });
    setPanelOpen(true);
  }, [canvasModelId, selectedNodes.length, t]);

  const runQuickRegenerate = useCallback((node, operationType, label) => {
    if (!node?.promptText || !(node.modelId || canvasModelId)) {
      setStatusTone("error");
      setStatusText(t("canvas.promptMissingForRetry"));
      return;
    }
    runGenerationOperation({
      sourceNodes: [node],
      operationType,
      label,
      promptText: node.promptText,
      modelId: node.modelId || canvasModelId,
      count: 1,
      sourceType: operationType,
      titlePrefix: label,
      inputImages: resolveGenerationInputImages(node),
      inputRefId: node.generationInputRefId || "",
    });
  }, [canvasModelId, resolveGenerationInputImages, runGenerationOperation, t]);

  const runRemoveBackground = useCallback(async () => {
    if (!primaryNode?.image) {
      setStatusTone("error");
      setStatusText(t("canvas.selectNodeFirst"));
      return;
    }
    try {
      const splitResult = await splitImageBySubjects(primaryNode.image);
      if (!splitResult?.removedImage) {
        setStatusTone("error");
        setStatusText(t("canvas.removeBgFailed"));
        return;
      }
      await addDerivedNodes({
        sourceNodes: [primaryNode],
        images: [splitResult.removedImage],
        label: t("canvas.removeBgShort"),
        operationType: "remove-bg",
        sourceType: "remove-bg",
        promptText: primaryNode.promptText,
        modelId: primaryNode.modelId,
        modelName: primaryNode.modelName,
        titlePrefix: t("canvas.removeBgNode"),
      });
      setStatusTone("success");
      setStatusText(t("canvas.removeBgDone"));
    } catch (error) {
      setStatusTone("error");
      setStatusText(
        t("canvas.operationFailed", {
          error: localizeRuntimeMessage(error?.message || t("common.unknownError"), t),
        })
      );
    }
  }, [addDerivedNodes, primaryNode, t]);

  const runAutoSplit = useCallback(async () => {
    if (!primaryNode?.image) {
      setStatusTone("error");
      setStatusText(t("canvas.selectNodeFirst"));
      return;
    }
    if (typeof onOpenSplitNode === "function") {
      onOpenSplitNode(primaryNode);
      setStatusTone("info");
      setStatusText(t("canvas.splitOpened"));
      return;
    }
    try {
      const splitResult = await splitImageBySubjects(primaryNode.image);
      const images = (Array.isArray(splitResult?.items) ? splitResult.items : [])
        .map((item) => item.image || item.edgeImage || item.rectImage || "")
        .filter(Boolean);
      if (!images.length) {
        setStatusTone("error");
        setStatusText(t("canvas.splitNoItems"));
        return;
      }
      await addDerivedNodes({
        sourceNodes: [primaryNode],
        images,
        label: t("canvas.splitShort"),
        operationType: "split",
        sourceType: "split",
        promptText: primaryNode.promptText,
        modelId: primaryNode.modelId,
        modelName: primaryNode.modelName,
        titlePrefix: t("canvas.splitNode"),
      });
      setStatusTone("success");
      setStatusText(t("canvas.generatedCount", { count: images.length }));
    } catch (error) {
      setStatusTone("error");
      setStatusText(
        t("canvas.operationFailed", {
          error: localizeRuntimeMessage(error?.message || t("common.unknownError"), t),
        })
      );
    }
  }, [addDerivedNodes, onOpenSplitNode, primaryNode, t]);

  const runCopyPrompt = useCallback(async () => {
    const promptText = primaryNode?.promptText || "";
    if (!promptText.trim()) {
      setStatusTone("error");
      setStatusText(t("canvas.noPromptToCopy"));
      return;
    }
    try {
      await copyTextToClipboard(promptText);
      setStatusTone("success");
      setStatusText(t("canvas.promptCopied"));
    } catch {
      setStatusTone("error");
      setStatusText(t("canvas.promptCopyFailed"));
    }
  }, [primaryNode?.promptText, t]);

  const openCropModal = useCallback(() => {
    if (!primaryNode?.image) {
      setStatusTone("error");
      setStatusText(t("canvas.selectNodeFirst"));
      return;
    }
    setCropState({ node: primaryNode });
  }, [primaryNode, t]);

  const handleCropConfirm = useCallback(async (images) => {
    const sourceNode = cropState?.node;
    setCropState(null);
    if (!sourceNode || !Array.isArray(images) || !images.length) return;
    await addDerivedNodes({
      sourceNodes: [sourceNode],
      images,
      label: t("canvas.cropShort"),
      operationType: "crop",
      sourceType: "crop",
      promptText: sourceNode.promptText,
      modelId: sourceNode.modelId,
      modelName: sourceNode.modelName,
      titlePrefix: t("canvas.cropNode"),
    });
    setStatusTone("success");
    setStatusText(t("canvas.generatedCount", { count: images.length }));
  }, [addDerivedNodes, cropState?.node, t]);

  const handleDownloadSelection = useCallback(async () => {
    const downloadable = selectedNodes.filter((node) => node.image);
    if (!downloadable.length) {
      setStatusTone("error");
      setStatusText(t("canvas.selectNodeFirst"));
      return;
    }
    for (let index = 0; index < downloadable.length; index += 1) {
      const node = downloadable[index];
      const fileName = `${(node.title || "canvas-image").replace(/[\\/:*?"<>|]+/g, "_") || "canvas-image"}.png`;
      if (String(node.image).startsWith("data:image/")) {
        downloadDataUrl(node.image, fileName);
      } else {
        await downloadImageUrl(node.image, fileName);
      }
    }
    setStatusTone("success");
    setStatusText(t("canvas.downloadedCount", { count: downloadable.length }));
  }, [selectedNodes, t]);

  const undo = useCallback(() => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    const current = createSnapshot();
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, current].slice(-MAX_UNDO_STEPS));
    restoreSnapshot(previous);
    setStatusTone("info");
    setStatusText(t("canvas.undoDone"));
  }, [createSnapshot, restoreSnapshot, t, undoStack]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    const current = createSnapshot();
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, current].slice(-MAX_UNDO_STEPS));
    restoreSnapshot(next);
    setStatusTone("info");
    setStatusText(t("canvas.redoDone"));
  }, [createSnapshot, redoStack, restoreSnapshot, t]);

  useEffect(() => {
    if (!visible) return undefined;
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
      if (!isTypingTarget && (event.key === "Delete" || event.key === "Backspace")) {
        if (selectedNodeIds.length || selectedEdgeId) {
          event.preventDefault();
          removeSelection();
          return;
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if (!isTypingTarget && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedNodeIds(nodes.map((node) => node.id));
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, redo, removeSelection, selectedEdgeId, selectedNodeIds.length, undo, visible]);

  useEffect(() => {
    const handleMove = (event) => {
      if (nodeDragRef.current) {
        const boardRect = boardRef.current?.getBoundingClientRect();
        if (!boardRect) return;
        const dx = (event.clientX - nodeDragRef.current.startClientX) / viewport.scale;
        const dy = (event.clientY - nodeDragRef.current.startClientY) / viewport.scale;
        nodeDragRef.current.moved = Math.abs(dx) > 1 || Math.abs(dy) > 1;
        setNodes((prev) =>
          prev.map((node) => {
            const original = nodeDragRef.current.originPositions.get(node.id);
            if (!original) return node;
            return {
              ...node,
              x: original.x + dx,
              y: original.y + dy,
            };
          })
        );
        return;
      }
      if (panRef.current) {
        const dx = event.clientX - panRef.current.startClientX;
        const dy = event.clientY - panRef.current.startClientY;
        setViewport((prev) => ({
          ...prev,
          x: panRef.current.startViewport.x + dx,
          y: panRef.current.startViewport.y + dy,
        }));
        return;
      }
      if (marqueeRef.current) {
        const boardRect = boardRef.current?.getBoundingClientRect();
        if (!boardRect) return;
        const current = {
          left: Math.min(marqueeRef.current.startX, event.clientX - boardRect.left),
          top: Math.min(marqueeRef.current.startY, event.clientY - boardRect.top),
          width: Math.abs(event.clientX - boardRect.left - marqueeRef.current.startX),
          height: Math.abs(event.clientY - boardRect.top - marqueeRef.current.startY),
        };
        setMarqueeRect(current);
      }
    };

    const handleUp = () => {
      if (nodeDragRef.current) {
        const drag = nodeDragRef.current;
        nodeDragRef.current = null;
        if (drag.moved) {
          setUndoStack((prev) => [...prev, drag.snapshot].slice(-MAX_UNDO_STEPS));
          setRedoStack([]);
        }
      }
      if (panRef.current) {
        panRef.current = null;
      }
      setLiteInteraction(false);
      if (marqueeRef.current) {
        const boardRect = boardRef.current?.getBoundingClientRect();
        const selectionRect = marqueeRect;
        marqueeRef.current = null;
        setMarqueeRect(null);
        if (boardRect && selectionRect) {
          const worldRect = {
            left: (selectionRect.left - viewport.x) / viewport.scale,
            top: (selectionRect.top - viewport.y) / viewport.scale,
            right: (selectionRect.left + selectionRect.width - viewport.x) / viewport.scale,
            bottom: (selectionRect.top + selectionRect.height - viewport.y) / viewport.scale,
          };
          const nextSelection = nodes
            .filter((node) => {
              const frame = getNodeFrame(node);
              return !(
                frame.x + frame.width < worldRect.left ||
                frame.x > worldRect.right ||
                frame.y + frame.height < worldRect.top ||
                frame.y > worldRect.bottom
              );
            })
            .map((node) => node.id);
          setSelectedNodeIds(nextSelection);
          setSelectedEdgeId(null);
        }
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [marqueeRect, nodes, viewport.scale, viewport.x, viewport.y]);

  useEffect(() => () => abortAllOperations(), [abortAllOperations]);

  useEffect(
    () => () => {
      if (wheelLiteTimerRef.current) window.clearTimeout(wheelLiteTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const node = boardRef.current;
    if (!node) return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setBoardSize({ width: rect.width, height: rect.height });
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleBackgroundMouseDown = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (event.shiftKey) {
      marqueeRef.current = {
        startX: event.clientX - rect.left,
        startY: event.clientY - rect.top,
      };
      setMarqueeRect({
        left: event.clientX - rect.left,
        top: event.clientY - rect.top,
        width: 0,
        height: 0,
      });
      return;
    }
    panRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: viewport,
    };
    setLiteInteraction(true);
  }, [viewport]);

  const handleNodeMouseDown = useCallback((event, node) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, textarea, select")) return;
    event.stopPropagation();
    setSelectedEdgeId(null);
    setSelectedNodeIds((prev) => {
      if (event.metaKey || event.ctrlKey) {
        if (prev.includes(node.id)) return prev.filter((id) => id !== node.id);
        return [...prev, node.id];
      }
      if (prev.includes(node.id)) return prev;
      return [node.id];
    });
    const activeIds =
      event.metaKey || event.ctrlKey
        ? selectedNodeIds.includes(node.id)
          ? selectedNodeIds
          : [...selectedNodeIds, node.id]
        : selectedNodeIds.includes(node.id)
        ? selectedNodeIds
        : [node.id];
    nodeDragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      originPositions: new Map(
        nodes
          .filter((item) => activeIds.includes(item.id))
          .map((item) => [item.id, { x: item.x, y: item.y }])
      ),
      moved: false,
      snapshot: createSnapshot(),
    };
    setLiteInteraction(true);
  }, [createSnapshot, nodes, selectedNodeIds]);

  const handleBoardWheel = useCallback((event) => {
    event.preventDefault();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (!event.ctrlKey && !event.metaKey) {
      setLiteInteraction(true);
      if (wheelLiteTimerRef.current) window.clearTimeout(wheelLiteTimerRef.current);
      wheelLiteTimerRef.current = window.setTimeout(() => {
        setLiteInteraction(false);
      }, 120);
      setViewport((prev) => ({
        ...prev,
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY,
      }));
      return;
    }
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const nextScale = clamp(viewport.scale + (event.deltaY < 0 ? 0.08 : -0.08), 0.35, 1.9);
    const worldX = (cursorX - viewport.x) / viewport.scale;
    const worldY = (cursorY - viewport.y) / viewport.scale;
    setViewport({
      scale: nextScale,
      x: cursorX - worldX * nextScale,
      y: cursorY - worldY * nextScale,
    });
  }, [viewport]);

  const handleNodeTitleChange = useCallback((nodeId, value) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === nodeId ? { ...node, title: value } : node))
    );
  }, []);

  const runUploadFiles = useCallback(async (files) => {
    const list = Array.from(files || []).filter((file) => file && file.type.startsWith("image/"));
    if (!list.length) return;
    const payload = await Promise.all(
      list.map(async (file, index) => ({
        image: await fileToBase64(file),
        title: file.name?.replace(/\.[^.]+$/, "") || `${t("canvas.imageNode")} ${index + 1}`,
        sourceType: "upload",
        sourceLabel: t("canvas.uploadedSource"),
        modelName: "",
        promptText: "",
        turnId: "",
        turnSeq: 0,
      }))
    );
    addImportedItems(payload);
  }, [addImportedItems, t]);

  const canvasModel = useMemo(
    () => IMAGE_MODELS.find((item) => item.id === canvasModelId) || IMAGE_MODELS[0] || null,
    [canvasModelId]
  );

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.heroTitle}>{t("nav.canvas")}</div>
          <div style={styles.heroSub}>{t("canvas.hero")}</div>
        </div>
        <div style={styles.heroMeta}>
          <span style={styles.heroChip}>{t("canvas.nodeOnly")}</span>
          <span style={styles.heroChip}>{t("canvas.branchWorkflow")}</span>
          {historyDirHandle ? (
            <span style={{ ...styles.heroChip, color: CANVAS_EMERALD, borderColor: CANVAS_EMERALD_BORDER, background: CANVAS_EMERALD_BG }}>
              {historyDirName || t("workspace.connected", { name: "History Folder" })}
            </span>
          ) : (
            <span style={styles.heroChip}>{t("workspace.noFolderSelected")}</span>
          )}
        </div>
      </div>

      <div style={styles.canvasLayout}>
        {panelOpen && (
          <aside style={styles.sidePanel}>
            <div style={styles.sideSection}>
              <div style={styles.panelTitle}>{t("canvas.runtime")}</div>
              <div style={styles.panelSub}>
                {canvasModel?.name || t("canvas.unknownModel")} · {hasAnyApiKey ? t("canvas.apiReady") : t("canvas.apiMissing")}
              </div>
              <div style={styles.fieldBlock}>
                <label style={styles.fieldLabel}>{t("canvas.model")}</label>
                <select style={styles.select} value={canvasModelId} onChange={(event) => setCanvasModelId(event.target.value)}>
                  {IMAGE_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
              {!historyDirHandle && (
                <button
                  type="button"
                  style={{ ...styles.secondaryBtn, width: "100%" }}
                  onClick={() => onPickHistoryFolder?.({ source: "manual" })}
                >
                  {t("workspace.selectHistoryFolder")}
                </button>
              )}
            </div>

            <div style={styles.sideSection}>
              <div style={styles.panelTitle}>{t("workspace.templates")}</div>
              {historyDirHandle ? (
                <div style={styles.templateGrid}>
                  {templates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      style={{ ...styles.templateBtn, opacity: selectedNodes.length ? 1 : 0.55, cursor: selectedNodes.length ? "pointer" : "not-allowed" }}
                      onClick={() =>
                        openOperationModal({
                          title: item.title || t("canvas.templateOperation"),
                          label: t("canvas.templateShort"),
                          operationType: "template",
                          sourceType: "template",
                          titlePrefix: item.title || t("canvas.templateNode"),
                          promptText: item.body || "",
                          count: selectedNodes.length > 1 ? selectedNodes.length : 4,
                          contextText: item.title || t("canvas.templateOperation"),
                        })
                      }
                      disabled={!selectedNodes.length}
                    >
                      <span style={styles.templateTitle}>{item.title || item.id}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyState}>{t("canvas.templateNeedFolder")}</div>
              )}
            </div>

            <div style={styles.sideSection}>
              <div style={styles.panelTitle}>{t("workspace.styleTemplates")}</div>
              {historyDirHandle ? (
                <div style={styles.templateGrid}>
                  {styleTemplates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      style={{ ...styles.templateBtn, opacity: selectedNodes.length ? 1 : 0.55, cursor: selectedNodes.length ? "pointer" : "not-allowed" }}
                      onClick={() =>
                        openOperationModal({
                          title: item.title || t("canvas.styleOperation"),
                          label: t("canvas.styleShort"),
                          operationType: "style-template",
                          sourceType: "style-template",
                          titlePrefix: item.title || t("canvas.styleNode"),
                          promptText: item.body || "",
                          count: Math.max(1, selectedNodes.length),
                          contextText: item.title || t("canvas.styleOperation"),
                        })
                      }
                      disabled={!selectedNodes.length}
                    >
                      <span style={styles.templateTitle}>{item.title || item.id}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyState}>{t("canvas.templateNeedFolder")}</div>
              )}
            </div>

            {primaryNode && (
              <div style={styles.sideSection}>
                <div style={styles.panelTitle}>{t("canvas.selectedNode")}</div>
                <input
                  style={styles.input}
                  value={primaryNode.title}
                  onChange={(event) => handleNodeTitleChange(primaryNode.id, event.target.value)}
                />
                <div style={styles.detailLines}>
                  <div style={styles.detailLine}>{primaryNode.modelName || t("canvas.unknownModel")}</div>
                  {!!primaryNode.promptText && <div style={styles.detailLine}>{primaryNode.promptText}</div>}
                </div>
                <div style={styles.actionGrid}>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={openCropModal}
                    disabled={selectedNodes.length !== 1}
                  >
                    {t("canvas.crop")}
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={runAutoSplit}
                    disabled={selectedNodes.length !== 1}
                  >
                    {t("canvas.split")}
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={runRemoveBackground}
                    disabled={selectedNodes.length !== 1}
                  >
                    {t("canvas.removeBg")}
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={() =>
                      openOperationModal({
                        title: t("canvas.mergeTitle"),
                        label: t("canvas.mergeShort"),
                        operationType: "merge",
                        sourceType: "merge",
                        titlePrefix: t("canvas.mergeNode"),
                        promptText: primaryNode.promptText || "",
                        count: Math.max(1, selectedNodes.length),
                        contextText: t("canvas.mergeHint"),
                      })
                    }
                    disabled={selectedNodes.length < 2}
                  >
                    {t("canvas.merge")}
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryBtn}
                    onClick={runCopyPrompt}
                    disabled={selectedNodes.length !== 1}
                  >
                    {t("canvas.copyPrompt")}
                  </button>
                </div>
              </div>
            )}

            {selectedEdge && (
              <div style={styles.sideSection}>
                <div style={styles.panelTitle}>{t("canvas.selectedEdge")}</div>
                <div style={styles.detailLines}>
                  <div style={styles.detailLine}>{selectedEdge.label || selectedEdge.operationType}</div>
                  {!!selectedEdge.modelName && <div style={styles.detailLine}>{selectedEdge.modelName}</div>}
                  {!!selectedEdge.promptText && <div style={styles.detailLine}>{selectedEdge.promptText}</div>}
                  <div style={styles.detailLine}>
                    {t("canvas.edgeIo", { input: selectedEdge.fromIds.length, output: selectedEdge.toIds.length })}
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        <div style={styles.boardCol}>
          {!!statusText && (
            <div style={{ ...styles.inlineStatus, ...getToneStyle(statusTone) }}>
              {statusText}
            </div>
          )}
          <div
            ref={boardRef}
            style={styles.boardViewport}
            onMouseDown={handleBackgroundMouseDown}
            onWheel={handleBoardWheel}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              if (panRef.current || marqueeRef.current || nodeDragRef.current) return;
              setSelectedNodeIds([]);
              setSelectedEdgeId(null);
            }}
          >
            {inlineOpsPosition && selectedNodes.length > 0 && (
              <div
                style={{
                  ...styles.inlineOpsPanel,
                  left: inlineOpsPosition.left,
                  top: inlineOpsPosition.top,
                  width: inlineOpsPosition.width,
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={styles.inlineOpsHead}>
                  <div>
                    <div style={styles.inlineOpsTitle}>{t("canvas.nodeOpsPanel")}</div>
                    <div style={styles.inlineOpsSub}>
                      {selectedNodes.length === 1
                        ? primaryNode?.title || t("canvas.selectedNode")
                        : t("canvas.selectionCount", { count: selectedNodes.length })}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={styles.inlineOpsClose}
                    onClick={() => {
                      setSelectedNodeIds([]);
                      setSelectedEdgeId(null);
                    }}
                    title={t("canvas.closePanel")}
                  >
                    ✕
                  </button>
                </div>
                <div style={styles.inlineOpsGrid}>
                  <button
                    type="button"
                    style={{ ...styles.inlineOpsBtn, ...(!historyDirHandle ? styles.inlineOpsBtnDisabled : null) }}
                    onClick={() => {
                      if (!historyDirHandle) {
                        setStatusTone("error");
                        setStatusText(t("canvas.templateNeedFolder"));
                        return;
                      }
                      setShowInlineTemplatePanel((prev) => !prev);
                    }}
                  >
                    {t("canvas.useTemplate")}
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.inlineOpsBtn, ...(selectedNodes.length === 1 ? null : styles.inlineOpsBtnDisabled) }}
                    onClick={runAutoSplit}
                    disabled={selectedNodes.length !== 1}
                  >
                    {t("canvas.split")}
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.inlineOpsBtn, ...(selectedNodes.length === 1 ? null : styles.inlineOpsBtnDisabled) }}
                    onClick={runRemoveBackground}
                    disabled={selectedNodes.length !== 1}
                  >
                    {t("canvas.removeBg")}
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.inlineOpsBtn, ...(selectedNodes.length >= 2 ? null : styles.inlineOpsBtnDisabled) }}
                    onClick={() =>
                      openOperationModal({
                        title: t("canvas.mergeTitle"),
                        label: t("canvas.mergeShort"),
                        operationType: "merge",
                        sourceType: "merge",
                        titlePrefix: t("canvas.mergeNode"),
                        promptText: primaryNode?.promptText || "",
                        count: Math.max(1, selectedNodes.length),
                        contextText: t("canvas.mergeHint"),
                      })
                    }
                    disabled={selectedNodes.length < 2}
                  >
                    {t("canvas.merge")}
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.inlineOpsBtn, ...(selectedNodes.length === 1 ? null : styles.inlineOpsBtnDisabled), gridColumn: "1 / -1" }}
                    onClick={runCopyPrompt}
                    disabled={selectedNodes.length !== 1}
                  >
                    {t("canvas.copyPrompt")}
                  </button>
                </div>
                {showInlineTemplatePanel && (
                  <div style={styles.inlineTemplatePanel}>
                    <div style={styles.inlineTemplateSection}>
                      <div style={styles.inlineTemplateTitle}>{t("workspace.templates")}</div>
                      <div style={styles.inlineTemplateGrid}>
                        {templates.map((item) => (
                          <button
                            key={`inline-template-${item.id}`}
                            type="button"
                            style={styles.inlineTemplateBtn}
                            onClick={() =>
                              openOperationModal({
                                title: item.title || t("canvas.templateOperation"),
                                label: t("canvas.templateShort"),
                                operationType: "template",
                                sourceType: "template",
                                titlePrefix: item.title || t("canvas.templateNode"),
                                promptText: item.body || "",
                                count: selectedNodes.length > 1 ? selectedNodes.length : 4,
                                contextText: item.title || t("canvas.templateOperation"),
                              })
                            }
                          >
                            <span style={styles.inlineTemplateBtnText}>{item.title || item.id}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={styles.inlineTemplateSection}>
                      <div style={styles.inlineTemplateTitle}>{t("workspace.styleTemplates")}</div>
                      <div style={styles.inlineTemplateGrid}>
                        {styleTemplates.map((item) => (
                          <button
                            key={`inline-style-template-${item.id}`}
                            type="button"
                            style={styles.inlineTemplateBtn}
                            onClick={() =>
                              openOperationModal({
                                title: item.title || t("canvas.styleOperation"),
                                label: t("canvas.styleShort"),
                                operationType: "style-template",
                                sourceType: "style-template",
                                titlePrefix: item.title || t("canvas.styleNode"),
                                promptText: item.body || "",
                                count: Math.max(1, selectedNodes.length),
                                contextText: item.title || t("canvas.styleOperation"),
                              })
                            }
                          >
                            <span style={styles.inlineTemplateBtnText}>{item.title || item.id}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div
              style={{
                ...styles.boardLayer,
                width: boardWorldSize.width,
                height: boardWorldSize.height,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              }}
            >
              <svg width={boardWorldSize.width} height={boardWorldSize.height} style={styles.edgeSvg}>
                <defs>
                  <marker id="canvas-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148,163,184,0.75)" />
                  </marker>
                  <marker id="canvas-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(96,165,250,0.95)" />
                  </marker>
                </defs>
                {edgeRenderItems.map(({ edge, isActive, statusStroke, labelPoint, paths }) => (
                  <g key={edge.id}>
                    {paths.map((path) => (
                      <path
                        key={path.key}
                        d={path.d}
                        fill="none"
                        stroke={statusStroke}
                        strokeWidth={isActive ? 3 : liteInteraction ? 1.5 : 2}
                        markerEnd={`url(#${isActive ? "canvas-arrow-active" : "canvas-arrow"})`}
                        style={{ pointerEvents: "auto", cursor: "pointer" }}
                        onClick={() => {
                          setSelectedEdgeId(edge.id);
                          setSelectedNodeIds([]);
                          setPanelOpen(true);
                        }}
                      />
                    ))}
                    {!liteInteraction && (
                      <g
                        transform={`translate(${labelPoint.x}, ${labelPoint.y})`}
                        style={{ pointerEvents: "auto", cursor: "pointer" }}
                        onClick={() => {
                          setSelectedEdgeId(edge.id);
                          setSelectedNodeIds([]);
                          setPanelOpen(true);
                        }}
                      >
                        <rect
                          x={-48}
                          y={-14}
                          width={96}
                          height={28}
                          rx={999}
                          fill={isActive ? "rgba(8,47,73,0.92)" : "rgba(2,6,23,0.82)"}
                          stroke={isActive ? CANVAS_PRIMARY_BORDER : "rgba(255,255,255,0.12)"}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={isActive ? "#dbeafe" : "#e2e8f0"}
                          style={{ fontFamily: mono, fontSize: 11, letterSpacing: 0.2 }}
                        >
                          {edge.label || edge.operationType || t("canvas.operation")}
                        </text>
                      </g>
                    )}
                  </g>
                ))}
              </svg>

              {renderedNodes.map((node) => {
                const frame = getNodeFrame(node);
                const isSelected = selectedNodeIds.includes(node.id);
                const isLoading = node.status === "loading";
                const isError = node.status === "error";
                const isCancelled = node.status === "cancelled";
                const canRegenerate = !!node.promptText && !!(node.modelId || canvasModelId) && !isLoading;
                const infoTitle = buildNodeInfoTitle(node, t);
                return (
                  <div
                    key={node.id}
                    style={{
                      ...styles.nodeCard,
                      ...(isSelected ? styles.nodeCardSelected : null),
                      ...(isError ? styles.nodeCardError : null),
                      ...(isCancelled ? styles.nodeCardCancelled : null),
                      left: frame.x,
                      top: frame.y,
                      height: frame.height,
                    }}
                    onMouseDown={(event) => handleNodeMouseDown(event, node)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedEdgeId(null);
                      setSelectedNodeIds((prev) => {
                        if (event.metaKey || event.ctrlKey) {
                          if (prev.includes(node.id)) return prev.filter((id) => id !== node.id);
                          return [...prev, node.id];
                        }
                        return [node.id];
                      });
                    }}
                  >
                    <div style={styles.nodeHead}>
                      <div style={styles.nodeHeadText}>
                        <div style={styles.nodeTitle}>{node.title}</div>
                        <div style={styles.nodeSub}>
                          {node.status === "loading"
                            ? t("status.loading")
                            : node.status === "error"
                            ? t("status.error")
                            : node.status === "cancelled"
                            ? t("status.cancelled")
                            : node.sourceLabel || t("canvas.imageNode")}
                        </div>
                      </div>
                      <div style={styles.nodeHeadActions}>
                        <button
                          type="button"
                          style={{ ...styles.nodeHeadBtn, ...(node.image ? null : styles.nodeHeadBtnDisabled) }}
                          title={t("viewer.previewImage")}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!node.image) return;
                            setPreviewPayload({
                              outputSrc: node.image,
                              modelName: node.modelName,
                              promptText: node.promptText,
                            });
                          }}
                          disabled={!node.image}
                        >
                          ⌕
                        </button>
                        <button type="button" style={{ ...styles.nodeHeadBtn, cursor: "help" }} title={infoTitle}>i</button>
                      </div>
                    </div>
                    <div style={{ ...styles.nodeImageWrap, height: getNodePreviewHeight(node) }}>
                      {node.image ? (
                        <img
                          src={node.image}
                          alt={node.title}
                          style={styles.nodeImage}
                          onLoad={(event) => {
                            const naturalWidth = event.currentTarget.naturalWidth || 0;
                            const naturalHeight = event.currentTarget.naturalHeight || 0;
                            if (!naturalWidth || !naturalHeight) return;
                            setNodes((prev) =>
                              prev.map((item) =>
                                item.id !== node.id
                                  ? item
                                  : {
                                      ...item,
                                      width: item.width || naturalWidth,
                                      height: item.height || naturalHeight,
                                    }
                              )
                            );
                          }}
                        />
                      ) : (
                        <div style={styles.nodePlaceholder}>
                          <div style={isLoading ? styles.loadingDot : styles.placeholderMark}>
                            {isLoading ? "⋯" : isError ? "!" : isCancelled ? "■" : "+"}
                          </div>
                          <div style={styles.nodePlaceholderText}>
                            {isLoading
                              ? t("canvas.generating")
                              : isError
                              ? node.error || t("status.error")
                              : isCancelled
                              ? t("canvas.stopped")
                              : t("canvas.noImage")}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={styles.nodeFooter}>
                      <button
                        type="button"
                        style={{ ...styles.nodeActionBtn, ...(isLoading ? styles.nodeActionDanger : null) }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedNodeIds([node.id]);
                          setSelectedEdgeId(null);
                          if (isLoading) {
                            abortOperation(node.operationId);
                          } else {
                            pushUndoSnapshot();
                            setNodes((prev) => prev.filter((item) => item.id !== node.id));
                            setEdges((prev) =>
                              prev.filter((edge) => !edge.fromIds.includes(node.id) && !edge.toIds.includes(node.id))
                            );
                            setSelectedNodeIds((prev) => prev.filter((id) => id !== node.id));
                          }
                        }}
                      >
                        {isLoading ? t("status.stop") : t("turn.delete")}
                      </button>
                      <button
                        type="button"
                        style={{ ...styles.nodeActionBtn, ...(canRegenerate ? null : styles.nodeActionDisabled) }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canRegenerate) return;
                          runQuickRegenerate(node, "plus-one", "+1");
                        }}
                        disabled={!canRegenerate}
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        style={{ ...styles.nodeActionBtn, ...(canRegenerate ? null : styles.nodeActionDisabled) }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canRegenerate) return;
                          runQuickRegenerate(node, "retry", "Retry");
                        }}
                        disabled={!canRegenerate}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {marqueeRect && (
              <div
                style={{
                  ...styles.marquee,
                  left: marqueeRect.left,
                  top: marqueeRect.top,
                  width: marqueeRect.width,
                  height: marqueeRect.height,
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div style={styles.bottomBar}>
        <button type="button" style={styles.bottomBtn} onClick={() => fileInputRef.current?.click()}>
          {t("canvas.uploadImage")}
        </button>
        <button type="button" style={styles.bottomBtn} onClick={handleDownloadSelection}>
          {t("canvas.downloadImage")}
        </button>
        <button type="button" style={{ ...styles.bottomBtn, opacity: redoStack.length ? 1 : 0.5 }} onClick={redo} disabled={!redoStack.length}>
          {t("canvas.redo")}
        </button>
        <button type="button" style={{ ...styles.bottomBtn, opacity: undoStack.length ? 1 : 0.5 }} onClick={undo} disabled={!undoStack.length}>
          {t("canvas.undo")}
        </button>
        <button
          type="button"
          style={{ ...styles.bottomBtn, ...(selectedNodeIds.length || selectedEdgeId ? null : styles.bottomBtnDisabled) }}
          onClick={removeSelection}
          disabled={!selectedNodeIds.length && !selectedEdgeId}
        >
          {t("turn.delete")}
        </button>
        <button type="button" style={styles.bottomBtnPrimary} onClick={() => setPanelOpen((prev) => !prev)}>
          {panelOpen ? t("canvas.closePanel") : t("canvas.openPanel")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={async (event) => {
            await runUploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {operationModal && (
        <CanvasOperationModal
          state={operationModal}
          onClose={() => setOperationModal(null)}
          onConfirm={handleApplyOperationModal}
          recommendedModelId={canvasModelId}
        />
      )}
      {cropState && (
        <CanvasCropModal
          node={cropState.node}
          onClose={() => setCropState(null)}
          onConfirm={handleCropConfirm}
        />
      )}
      <ImagePreviewModal src={previewPayload} onClose={() => setPreviewPayload(null)} />
    </div>
  );
}

const styles = {
  page: { display: "grid", gap: 14 },
  hero: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderRadius: 18, border: `1px solid ${CANVAS_BORDER}`, background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(30,64,175,0.12) 62%, rgba(15,23,42,0.36))" },
  heroTitle: { fontSize: 28, lineHeight: 1.05, color: "#f8fafc", fontFamily: mono, letterSpacing: -0.6 },
  heroSub: { marginTop: 8, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7, maxWidth: 720 },
  heroMeta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  heroChip: { height: 30, padding: "0 12px", borderRadius: 999, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(2,6,23,0.52)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, display: "inline-flex", alignItems: "center" },
  canvasLayout: { position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14, minHeight: "70vh" },
  boardCol: { minWidth: 0, display: "grid", gap: 10 },
  sidePanel: { width: 320, maxWidth: "100%", alignSelf: "start", justifySelf: "start", position: "absolute", zIndex: 4, left: 0, top: 0, bottom: 0, overflow: "auto", borderRadius: 18, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(3,7,18,0.92)", backdropFilter: "blur(12px)", padding: 14, display: "grid", gap: 12, boxShadow: "0 20px 48px rgba(2,6,23,0.4)" },
  sideSection: { borderRadius: 14, border: `1px solid ${CANVAS_BORDER}`, background: CANVAS_BG, padding: 12, display: "grid", gap: 10 },
  panelTitle: { fontFamily: mono, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: "#f8fafc" },
  panelSub: { fontSize: 12, color: CANVAS_MUTED, lineHeight: 1.6 },
  thumbGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  thumbCard: { padding: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${CANVAS_BORDER}`, background: "rgba(2,6,23,0.82)", cursor: "pointer", textAlign: "left" },
  thumbImg: { width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block", background: "#020617" },
  thumbMeta: { padding: "8px 9px 10px", display: "grid", gap: 4 },
  thumbTitle: { fontSize: 11, color: "#f8fafc", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  thumbSub: { fontSize: 10, color: CANVAS_MUTED, fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  emptyState: { minHeight: 64, borderRadius: 12, border: `1px dashed ${CANVAS_BORDER}`, background: "rgba(2,6,23,0.36)", color: CANVAS_MUTED, fontSize: 12, fontFamily: mono, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, textAlign: "center" },
  templateGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  templateBtn: { minHeight: 38, borderRadius: 10, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(2,6,23,0.7)", color: "#e2e8f0", cursor: "pointer", padding: "8px 10px", textAlign: "left" },
  templateTitle: { display: "block", fontSize: 11, fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  boardViewport: { position: "relative", minHeight: "70vh", borderRadius: 20, border: `1px solid ${CANVAS_BORDER}`, background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), #050816", backgroundSize: "auto, 44px 44px, 44px 44px, auto", overflow: "hidden" },
  boardLayer: { position: "absolute", left: 0, top: 0, transformOrigin: "0 0", pointerEvents: "none", willChange: "transform" },
  edgeSvg: { position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" },
  nodeCard: { position: "absolute", width: NODE_WIDTH, borderRadius: 16, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(2,6,23,0.9)", boxShadow: "0 14px 36px rgba(2,6,23,0.24)", overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", pointerEvents: "auto", cursor: "grab", userSelect: "none" },
  nodeCardSelected: { borderColor: CANVAS_PRIMARY_BORDER, boxShadow: "0 0 0 1px rgba(59,130,246,0.32), 0 18px 42px rgba(15,23,42,0.32)" },
  nodeCardError: { borderColor: CANVAS_RED_BORDER },
  nodeCardCancelled: { borderColor: "rgba(148,163,184,0.28)", opacity: 0.9 },
  nodeHead: { minHeight: 52, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${CANVAS_BORDER}` },
  nodeHeadText: { minWidth: 0, display: "grid", gap: 4 },
  nodeHeadActions: { display: "inline-flex", alignItems: "center", gap: 6 },
  nodeHeadBtn: { width: 22, height: 22, borderRadius: 11, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(15,23,42,0.86)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 },
  nodeHeadBtnDisabled: { opacity: 0.42, cursor: "not-allowed" },
  nodeTitle: { fontSize: 12, color: "#f8fafc", fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  nodeSub: { fontSize: 10, color: CANVAS_MUTED, fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  nodeImageWrap: { background: "#020617", borderBottom: `1px solid ${CANVAS_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  nodeImage: { width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#020617", cursor: "inherit" },
  nodePlaceholder: { width: "100%", height: "100%", display: "grid", alignContent: "center", justifyItems: "center", gap: 8, padding: 14, color: CANVAS_MUTED, textAlign: "center" },
  placeholderMark: { width: 34, height: 34, borderRadius: 17, border: `1px dashed ${CANVAS_BORDER}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontFamily: mono },
  loadingDot: { width: 34, height: 34, borderRadius: 17, border: `1px solid ${CANVAS_GOLD_BORDER}`, background: CANVAS_GOLD_BG, color: CANVAS_GOLD, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontFamily: mono },
  nodePlaceholderText: { fontSize: 11, lineHeight: 1.5, fontFamily: mono },
  nodeFooter: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
  nodeActionBtn: { height: 38, border: "none", borderRight: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.03)", color: "#e2e8f0", fontFamily: mono, fontSize: 11, cursor: "pointer" },
  nodeActionDanger: { background: CANVAS_RED_BG, color: CANVAS_RED },
  nodeActionDisabled: { opacity: 0.45, cursor: "not-allowed" },
  marquee: { position: "absolute", border: `1px solid ${CANVAS_PRIMARY_BORDER}`, background: "rgba(59,130,246,0.14)", borderRadius: 10, pointerEvents: "none", zIndex: 3 },
  bottomBar: { position: "sticky", bottom: 14, zIndex: 5, display: "flex", gap: 8, flexWrap: "wrap", padding: 10, borderRadius: 18, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(2,6,23,0.88)", backdropFilter: "blur(12px)" },
  bottomBtn: { height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  bottomBtnPrimary: { height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${CANVAS_PRIMARY_BORDER}`, background: CANVAS_PRIMARY_BG, color: CANVAS_PRIMARY, fontFamily: mono, fontSize: 12, cursor: "pointer", marginLeft: "auto" },
  bottomBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
  inlineStatus: { minHeight: 40, borderRadius: 14, border: `1px solid ${CANVAS_PRIMARY_BORDER}`, padding: "10px 12px", fontSize: 12, fontFamily: mono, lineHeight: 1.5 },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 1200, background: "rgba(2,6,23,0.78)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "min(720px, 92vw)", borderRadius: 20, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(3,7,18,0.96)", boxShadow: "0 22px 68px rgba(2,6,23,0.45)", overflow: "hidden" },
  modalHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 20px 14px", borderBottom: `1px solid ${CANVAS_BORDER}` },
  modalTitle: { fontSize: 20, color: "#f8fafc", fontFamily: mono },
  modalSub: { marginTop: 8, fontSize: 12, color: CANVAS_MUTED, lineHeight: 1.6 },
  modalBody: { padding: 20, display: "grid", gap: 14 },
  modalActions: { padding: "0 20px 20px", display: "flex", justifyContent: "flex-end", gap: 10 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.04)", color: "#e2e8f0", cursor: "pointer" },
  fieldBlock: { display: "grid", gap: 8 },
  fieldLabel: { fontSize: 11, color: CANVAS_MUTED, fontFamily: mono, letterSpacing: 1.1, textTransform: "uppercase" },
  input: { width: "100%", height: 38, borderRadius: 10, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.03)", color: "#f8fafc", fontFamily: mono, fontSize: 13, padding: "0 12px", outline: "none" },
  select: { width: "100%", height: 38, borderRadius: 10, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.03)", color: "#f8fafc", fontFamily: mono, fontSize: 13, padding: "0 12px", outline: "none" },
  textarea: { width: "100%", minHeight: 138, borderRadius: 12, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.03)", color: "#f8fafc", fontFamily: "inherit", fontSize: 14, padding: "12px 14px", outline: "none", resize: "vertical", lineHeight: 1.6 },
  primaryBtn: { height: 40, padding: "0 16px", borderRadius: 10, border: `1px solid ${CANVAS_PRIMARY_BORDER}`, background: CANVAS_PRIMARY_BG, color: CANVAS_PRIMARY, fontFamily: mono, fontSize: 12, cursor: "pointer" },
  secondaryBtn: { height: 40, padding: "0 16px", borderRadius: 10, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontFamily: mono, fontSize: 12, cursor: "pointer" },
  cropStage: { position: "relative", minHeight: 580, borderRadius: 18, border: `1px solid ${CANVAS_BORDER}`, background: "#020617", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" },
  cropStageImage: { width: "100%", height: "100%", objectFit: "contain", display: "block", userSelect: "none" },
  cropOverlayRect: { position: "absolute", border: `2px solid ${CANVAS_PRIMARY}`, background: "rgba(59,130,246,0.16)", boxShadow: "0 0 0 1px rgba(2,6,23,0.4) inset" },
  cropOverlayRectDraft: { borderStyle: "dashed" },
  cropOverlayIndex: { position: "absolute", left: 6, top: 6, minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, background: "rgba(2,6,23,0.85)", color: "#f8fafc", fontFamily: mono, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  cropSidebar: { borderRadius: 16, border: `1px solid ${CANVAS_BORDER}`, background: CANVAS_BG, padding: 14, display: "grid", alignContent: "start", gap: 10 },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  detailLines: { display: "grid", gap: 6 },
  detailLine: { fontSize: 12, color: "#cbd5e1", lineHeight: 1.6, wordBreak: "break-word" },
  inlineOpsPanel: { position: "absolute", zIndex: 6, borderRadius: 16, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(2,6,23,0.96)", backdropFilter: "blur(14px)", boxShadow: "0 20px 44px rgba(2,6,23,0.46)", padding: 12, display: "grid", gap: 10 },
  inlineOpsHead: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "start" },
  inlineOpsTitle: { fontSize: 12, color: "#f8fafc", fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" },
  inlineOpsSub: { marginTop: 4, fontSize: 11, color: CANVAS_MUTED, fontFamily: mono, lineHeight: 1.5, wordBreak: "break-word" },
  inlineOpsClose: { width: 24, height: 24, borderRadius: 12, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 12, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 },
  inlineOpsGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  inlineOpsBtn: { minHeight: 38, padding: "9px 10px", borderRadius: 10, border: `1px solid ${CANVAS_BORDER}`, background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontFamily: mono, fontSize: 11, cursor: "pointer", textAlign: "left", lineHeight: 1.4 },
  inlineOpsBtnDisabled: { opacity: 0.48, cursor: "not-allowed" },
  inlineTemplatePanel: { display: "grid", gap: 10, paddingTop: 2, borderTop: `1px solid ${CANVAS_BORDER}` },
  inlineTemplateSection: { display: "grid", gap: 8 },
  inlineTemplateTitle: { fontSize: 11, color: CANVAS_MUTED, fontFamily: mono, letterSpacing: 1, textTransform: "uppercase" },
  inlineTemplateGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  inlineTemplateBtn: { minHeight: 36, padding: "8px 10px", borderRadius: 10, border: `1px solid ${CANVAS_PRIMARY_BORDER}`, background: "rgba(8,47,73,0.46)", color: "#dbeafe", cursor: "pointer", textAlign: "left" },
  inlineTemplateBtnText: { display: "block", fontSize: 11, fontFamily: mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
};
