import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  DEFAULT_SPLIT_BG_COLOR,
  DEFAULT_SPLIT_GROUP_MODE,
  DEFAULT_SPLIT_RENDER_MODE,
  DEFAULT_SPLIT_SHAPE_MODE,
  MAX_SPLIT_EXPORT_ITEMS,
  SPLIT_RENDER_MODE_ORDER,
  SPLIT_SHAPE_MODE_ORDER,
} from "../../config/appConfig";
import { useI18n } from "../../i18n";
import {
  buildRemovedDisplayImage,
  buildSplitItemDisplayList,
  dataUrlToBytes,
  downloadDataUrl,
  downloadImageUrl,
  enhanceSplitImageDataUrl,
  ensureDirectoryPermission,
  fetchImageBytes,
  fileToBase64,
  getSplitItemBaseSize,
  getSplitItemSourceByShape,
  isAbortError,
  loadImageElement,
  mergePromptWithAspectRatio,
  normalizeImageValue,
  normalizeSplitRenderMode,
  normalizeSplitShapeMode,
  resolveSplitSourceDataUrl,
  safeName,
  splitImageBySubjects,
  writeBinaryFile,
  writeTextFile,
} from "../../services/appCore";
import { S } from "../../styles/appStyles";
import { InlineZoomViewer, PreviewMetaBar } from "../history/components";

function formatSplitDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 10000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value / 1000)}s`;
}

export function SpriteSplitModal({
  show,
  onClose,
  embedded = false,
  sourceImage,
  processImage,
  clusterProcessImage = "",
  absorbedProcessImage = "",
  modelName = "",
  promptText = "",
  splitItems,
  baseItemCount = 0,
  splitOnRemoved = false,
  selectedItemIds,
  enhanceEnabled = true,
  renderMode = DEFAULT_SPLIT_RENDER_MODE,
  shapeMode = DEFAULT_SPLIT_SHAPE_MODE,
  groupMode = DEFAULT_SPLIT_GROUP_MODE,
  canUndo = false,
  busy,
  enhancing,
  exporting,
  timing,
  statusText,
  statusTone = "info",
  historyRecords = [],
  historyDirName = "",
  historyUpscalingIds,
  onToggleSplitSource,
  onResplit,
  onSetGroupMode,
  onSetRenderMode,
  onSetShapeMode,
  onSetEnhanceEnabled,
  onToggleSelectItem,
  onMergeSelectedItems,
  onDeleteItem,
  onUndoDelete,
  onExport,
  onPreview,
  onUploadImageDataUrl,
  onPickHistoryFolder,
  onUpscaleHistory,
}) {
  const { uiLanguage, t } = useI18n();
  const uploadInputRef = useRef(null);
  const [inlineZoomSource, setInlineZoomSource] = useState(false);
  const [inlineZoomProcessIndex, setInlineZoomProcessIndex] = useState(null);
  const [historyViewModes, setHistoryViewModes] = useState({});

  useEffect(() => {
    if (!show) return undefined;
    const onKeyDown = (event) => {
      const key = String(event.key || "").toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        onUndoDelete?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, onUndoDelete]);

  useEffect(() => {
    if (!show) {
      setInlineZoomSource(false);
      setInlineZoomProcessIndex(null);
      return;
    }
  }, [show]);

  useEffect(() => {
    if (!show) return;
    if (!sourceImage) setInlineZoomSource(false);
    if (!processImage && !clusterProcessImage && !absorbedProcessImage) setInlineZoomProcessIndex(null);
  }, [show, sourceImage, processImage, clusterProcessImage, absorbedProcessImage]);

  if (!show) return null;
  const items = Array.isArray(splitItems) ? splitItems : [];
  const selectedSet = selectedItemIds instanceof Set
    ? selectedItemIds
    : new Set(Array.isArray(selectedItemIds) ? selectedItemIds : []);
  const selectedCount = items.reduce((count, item) => (selectedSet.has(item.id) ? count + 1 : count), 0);
  const hasItems = items.length > 0;
  const isClusterMode = groupMode === "cluster";
  const sourceCount = Math.max(items.length, Number(baseItemCount) || 0);
  const resultCountText = isClusterMode
    ? t("split.clusterCount", { count: items.length, sourceCount })
    : t("split.count", { count: items.length });
  const timingText = t("split.timing", {
    split: formatSplitDuration(timing?.splitMs),
    cluster: formatSplitDuration(timing?.clusterMs),
  });
  const processViews = isClusterMode
    ? [
        { title: t("split.clusterStageProcess"), src: clusterProcessImage || processImage, alt: t("split.clusterStageProcess") },
        { title: t("split.absorbedProcess"), src: absorbedProcessImage || processImage, alt: t("split.absorbedProcess") },
      ]
    : [
        { title: t("split.process"), src: processImage, alt: t("split.process") },
      ];
  const safeHistoryRecords = Array.isArray(historyRecords) ? historyRecords : [];
  const upscalingSet = historyUpscalingIds instanceof Set
    ? historyUpscalingIds
    : new Set(Array.isArray(historyUpscalingIds) ? historyUpscalingIds : []);
  const formatHistoryTime = (value) => {
    const ts = Number(value) || 0;
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString(uiLanguage === "zh" ? "zh-CN" : "en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };
  const renderUploadInput = () => (
    <input
      ref={uploadInputRef}
      type="file"
      accept="image/*"
      style={{ display: "none" }}
      onChange={async (event) => {
        const file = (event.target.files || [])[0];
        if (!file) {
          event.target.value = "";
          return;
        }
        const encoded = await fileToBase64(file);
        if (typeof encoded === "string" && encoded.startsWith("data:image/")) {
          await onUploadImageDataUrl?.(encoded, file);
        }
        event.target.value = "";
      }}
    />
  );
  const renderSourcePane = () => (
    <div style={S.splitPane}>
      <div style={S.splitPaneTitle}>{t("split.original")}</div>
      <div style={S.splitOriginalWrap}>
        {sourceImage ? (
          inlineZoomSource ? (
            <InlineZoomViewer
              src={sourceImage}
              onCollapse={() => setInlineZoomSource(false)}
              containerStyle={S.splitPaneInlineZoomViewer}
              collapseButtonStyle={S.splitPaneInlineZoomCollapseBtn}
              modelName={modelName}
              promptText={promptText}
            />
          ) : (
            <div style={S.splitImageWrap}>
              <PreviewMetaBar modelName={modelName} promptText={promptText} />
              <img
                src={sourceImage}
                alt={t("split.original")}
                style={S.splitOriginalImg}
                onClick={() => setInlineZoomSource(true)}
              />
              <button
                type="button"
                style={{
                  ...S.splitImageZoomBtn,
                  ...(inlineZoomSource ? S.splitImageZoomBtnActive : null),
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  setInlineZoomSource((prev) => !prev);
                }}
                title={t("viewer.inlineViewer")}
              >
                🔍
              </button>
            </div>
          )
        ) : (
          <div style={S.turnStyleImageEmpty}>{busy ? t("split.detecting") : "-"}</div>
        )}
        <button
          type="button"
          style={{
            ...S.splitImageUploadBtn,
            opacity: busy || exporting || enhancing ? 0.55 : 1,
            cursor: busy || exporting || enhancing ? "not-allowed" : "pointer",
          }}
          onClick={(event) => {
            event.stopPropagation();
            uploadInputRef.current?.click();
          }}
          disabled={busy || exporting || enhancing}
        >
          {t("split.upload")}
        </button>
      </div>
    </div>
  );
  const renderSettingsPanel = () => (
    <div style={S.splitMidActions}>
      <div style={S.splitMidActionRow}>
        <div style={S.splitToggleGroup}>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(splitOnRemoved ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing}
            onClick={() => onToggleSplitSource?.(true)}
          >
            {t("split.sourceRemoved")}
          </button>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(!splitOnRemoved ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing}
            onClick={() => onToggleSplitSource?.(false)}
          >
            {t("split.sourceOriginal")}
          </button>
        </div>
        <div style={S.splitToggleGroup}>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(renderMode === "painted" ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing}
            onClick={() => onSetRenderMode?.("painted")}
          >
            {t("split.renderPainted")}
          </button>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(renderMode === "direct" ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing}
            onClick={() => onSetRenderMode?.("direct")}
          >
            {t("split.renderDirect")}
          </button>
        </div>
        <div style={S.splitToggleGroup}>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(shapeMode === "edge" ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing}
            onClick={() => onSetShapeMode?.("edge")}
          >
            {t("split.shapeEdge")}
          </button>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(shapeMode === "polygon" ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing}
            onClick={() => onSetShapeMode?.("polygon")}
          >
            {t("split.shapePolygon")}
          </button>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(shapeMode === "rect" ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing}
            onClick={() => onSetShapeMode?.("rect")}
          >
            {t("split.shapeRect")}
          </button>
        </div>
        <div style={S.splitToggleGroup}>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(enhanceEnabled ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing || !hasItems}
            onClick={() => onSetEnhanceEnabled?.(true)}
          >
            {t("split.qualityEnhanced")}
          </button>
          <button
            type="button"
            style={{
              ...S.splitToggleBtn,
              ...(!enhanceEnabled ? S.splitToggleBtnActive : null),
            }}
            disabled={busy || exporting || enhancing || !hasItems}
            onClick={() => onSetEnhanceEnabled?.(false)}
          >
            {t("split.qualityOriginal")}
          </button>
        </div>
      </div>
    </div>
  );
  const renderResultsPanel = (pageMode = false) => (
    <section style={pageMode ? S.splitPageResultsPanel : S.splitRightCol}>
      <div style={S.splitRightTop}>
        <div style={S.splitPaneTitle}>
          {isClusterMode ? t("split.clusterResults") : t("split.results")}
          <span style={S.splitPaneCount}>{busy ? t("split.detecting") : resultCountText}</span>
        </div>
        <div style={S.splitTopActions}>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: sourceImage ? 1 : 0.5, cursor: sourceImage ? "pointer" : "not-allowed" }}
            onClick={onResplit}
            disabled={!sourceImage || busy || exporting || enhancing}
          >
            {busy ? t("common.processing") : isClusterMode ? t("split.runCluster") : t("split.run")}
          </button>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: selectedCount >= 2 ? 1 : 0.5, cursor: selectedCount >= 2 ? "pointer" : "not-allowed" }}
            onClick={onMergeSelectedItems}
            disabled={selectedCount < 2 || busy || exporting || enhancing}
          >
            {t("split.merge")}
          </button>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: canUndo ? 1 : 0.5, cursor: canUndo ? "pointer" : "not-allowed" }}
            onClick={onUndoDelete}
            disabled={!canUndo || busy || exporting || enhancing}
          >
            {t("split.undo")}
          </button>
          <button
            type="button"
            style={{ ...S.apiSaveBtn, opacity: hasItems && !busy ? 1 : 0.5, cursor: hasItems && !busy ? "pointer" : "not-allowed" }}
            onClick={onExport}
            disabled={!hasItems || busy || exporting || enhancing}
          >
            {exporting ? t("split.exporting") : t("split.export")}
          </button>
        </div>
      </div>
      <div style={pageMode ? S.splitPageResultsBody : S.splitRightBody}>
        {busy ? (
          <div style={S.turnStyleImageEmpty}>{t("split.detecting")}</div>
        ) : hasItems ? (
          <div style={pageMode ? S.splitPageResultGrid : S.splitGrid}>
            {items.map((item, index) => (
              <div key={item.id || `split-item-${index}`} style={S.splitItemCell}>
                <button
                  type="button"
                  style={{
                    ...S.splitItemSelectBtn,
                    ...(selectedSet.has(item.id) ? S.splitItemSelectBtnActive : null),
                  }}
                  onClick={() => onToggleSelectItem?.(item.id)}
                  title={t("split.merge")}
                >
                  {selectedSet.has(item.id) ? "✓" : "○"}
                </button>
                <button
                  type="button"
                  style={S.splitItemBtn}
                  onClick={() =>
                    onPreview?.({
                      outputSrc: item.image,
                      modelName,
                      promptText,
                    })
                  }
                  title={t("split.previewSplit", { index: index + 1 })}
                >
                  <div style={S.splitItemOrder}>{index + 1}</div>
                  <img
                    src={item.image}
                    alt={`Split ${index + 1}`}
                    style={S.splitItemImg}
                  />
                </button>
                <button
                  type="button"
                  style={S.splitItemDeleteBtn}
                  onClick={() => onDeleteItem?.(item.id)}
                  title={t("split.delete")}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={S.turnStyleImageEmpty}>{t("split.noSubjects")}</div>
        )}
      </div>
    </section>
  );
  const renderHistoryPanel = () => (
    <section style={S.splitHistoryPanel}>
      <div style={S.splitRightTop}>
        <div style={S.splitPaneTitle}>
          {t("split.history")}
          <span style={S.splitPaneCount}>
            {historyDirName ? t("split.historyFolder", { name: historyDirName }) : t("split.historyNoFolder")}
          </span>
        </div>
        <div style={S.splitTopActions}>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12 }}
            onClick={onPickHistoryFolder}
          >
            {historyDirName ? t("workspace.switchHistoryFolder") : t("workspace.selectHistoryFolder")}
          </button>
        </div>
      </div>
      {safeHistoryRecords.length ? (
        <div style={S.splitHistoryList}>
          {safeHistoryRecords.map((record) => {
            const recordId = record.id || record.folderName || `split-history-${record.createdAt || record.fileStem || "record"}`;
            const viewMode = historyViewModes[recordId] || "cluster";
            const splitRecordItems = Array.isArray(record.splitItems) && record.splitItems.length ? record.splitItems : record.items || [];
            const clusterRecordItems = Array.isArray(record.clusterItems) && record.clusterItems.length ? record.clusterItems : record.items || [];
            const upscaledItems = Array.isArray(record.upscaledItems) ? record.upscaledItems : [];
            const upscaleError = typeof record.upscaleError === "string" ? record.upscaleError.trim() : "";
            const isUpscaling = upscalingSet.has(recordId);
            const recordItems = viewMode === "split" ? splitRecordItems : clusterRecordItems;
            const displayCount = viewMode === "enhance" ? (upscaledItems.length || clusterRecordItems.length) : recordItems.length;
            const setRecordViewMode = (mode) => {
              setHistoryViewModes((prev) => ({ ...prev, [recordId]: mode }));
              if (mode === "enhance" && !upscaledItems.length && !isUpscaling) {
                onUpscaleHistory?.(record);
              }
            };
            return (
              <article key={recordId} style={S.splitHistoryRecord}>
                <div style={S.splitHistoryRecordHead}>
                  <div style={S.splitHistoryRecordTitle}>
                    {record.groupMode === "cluster" ? t("split.modeCluster") : t("split.modeStandard")}
                    <span style={S.splitPaneCount}>
                      {formatHistoryTime(record.createdAt)} · {displayCount} / {record.itemCount || displayCount}
                    </span>
                  </div>
                  <div style={S.splitHistoryMeta}>
                    {record.renderMode || "-"} · {record.shapeMode || "-"} · {record.enhanced === false ? t("split.qualityOriginal") : t("split.qualityEnhanced")}
                  </div>
                </div>
                <div style={S.splitHistoryProcessRow}>
                  {[
                    { label: t("split.original"), src: record.originalImage },
                    { label: t("split.edgeProcess"), src: record.processImage },
                    { label: t("split.clusterStageProcess"), src: record.clusterProcessImage },
                    { label: t("split.absorbedProcess"), src: record.absorbedProcessImage },
                  ].map((view, index) => (
                    <button
                      key={`${recordId}-process-${index}`}
                      type="button"
                      style={S.splitHistoryProcessBtn}
                      onClick={() => view.src && onPreview?.({ outputSrc: view.src, modelName: record.modelName || modelName, promptText: record.promptText || promptText })}
                      disabled={!view.src}
                    >
                      <span style={S.splitHistoryProcessLabel}>{view.label}</span>
                      {view.src ? <img src={view.src} alt={view.label} style={S.splitHistoryProcessImg} /> : <span style={S.turnStyleImageEmpty}>-</span>}
                    </button>
                  ))}
                </div>
                <div style={S.splitHistoryModeRow}>
                  <div style={S.splitToggleGroup}>
                    <button
                      type="button"
                      style={{ ...S.splitToggleBtn, ...(viewMode === "split" ? S.splitToggleBtnActive : null) }}
                      onClick={() => setRecordViewMode("split")}
                    >
                      {t("split.modeStandard")}
                    </button>
                    <button
                      type="button"
                      style={{ ...S.splitToggleBtn, ...(viewMode === "cluster" ? S.splitToggleBtnActive : null) }}
                      onClick={() => setRecordViewMode("cluster")}
                    >
                      {t("split.modeCluster")}
                    </button>
                    <button
                      type="button"
                      style={{ ...S.splitToggleBtn, ...(viewMode === "enhance" ? S.splitToggleBtnActive : null) }}
                      onClick={() => setRecordViewMode("enhance")}
                      disabled={isUpscaling}
                    >
                      {isUpscaling ? t("split.upscaling") : t("split.upscale")}
                    </button>
                  </div>
                </div>
                <div style={S.splitHistoryRecordBody}>
                  {viewMode === "enhance" ? (
                    upscaledItems.length ? (
                      <div style={S.splitHistoryCompareGrid}>
                        {upscaledItems.map((item, index) => (
                          <div key={`${recordId}-upscaled-${index}`} style={S.splitHistoryCompareCard}>
                            <button
                              type="button"
                              style={S.splitHistoryComparePane}
                              onClick={() => item.beforeImage && onPreview?.({ outputSrc: item.beforeImage, modelName: record.modelName || modelName, promptText: record.promptText || promptText })}
                            >
                              <span style={S.splitHistoryProcessLabel}>{t("split.beforeUpscale")}</span>
                              <img src={item.beforeImage} alt={t("split.beforeUpscale")} style={S.splitItemImg} />
                            </button>
                            <button
                              type="button"
                              style={S.splitHistoryComparePane}
                              onClick={() => item.afterImage && onPreview?.({ outputSrc: item.afterImage, modelName: record.modelName || modelName, promptText: record.promptText || promptText })}
                            >
                              <span style={S.splitHistoryProcessLabel}>{t("split.afterUpscale")}</span>
                              <img src={item.afterImage} alt={t("split.afterUpscale")} style={S.splitItemImg} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : upscaleError ? (
                      <div style={S.splitHistoryErrorBox}>
                        <div>{t("split.upscaleFailed", { error: upscaleError })}</div>
                        <div style={S.splitHistoryErrorHint}>{t("split.upscaleRetryHint")}</div>
                      </div>
                    ) : (
                      <div style={S.turnStyleImageEmpty}>{isUpscaling ? t("split.upscaling") : t("split.upscalePending")}</div>
                    )
                  ) : (
                    <div style={S.splitHistoryGrid}>
                      {recordItems.map((item, index) => (
                        <button
                          key={`${recordId}-${viewMode}-${item.file || index}`}
                          type="button"
                          style={S.splitItemBtn}
                          onClick={() =>
                            onPreview?.({
                              outputSrc: item.image,
                              modelName: record.modelName || modelName,
                              promptText: record.promptText || promptText,
                            })
                          }
                          title={t("split.previewSplit", { index: index + 1 })}
                        >
                          <div style={S.splitItemOrder}>{index + 1}</div>
                          <img src={item.image} alt={`Split history ${index + 1}`} style={S.splitItemImg} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div style={S.turnStyleImageEmpty}>{t("split.historyEmpty")}</div>
      )}
    </section>
  );
  if (embedded) {
    return (
      <div
        style={{ ...S.splitModal, ...S.splitPagePanel }}
        onClick={undefined}
      >
        <div style={S.splitModalHeader}>
          <div style={S.splitModalTitleRow}>
            <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("split.title")}</h2>
            <div style={S.splitToggleGroup}>
              <button
                type="button"
                style={{
                  ...S.splitToggleBtn,
                  ...(!isClusterMode ? S.splitToggleBtnActive : null),
                }}
                disabled={busy || exporting || enhancing}
                onClick={() => onSetGroupMode?.("standard")}
              >
                {t("split.modeStandard")}
              </button>
              <button
                type="button"
                style={{
                  ...S.splitToggleBtn,
                  ...(isClusterMode ? S.splitToggleBtnActive : null),
                }}
                disabled={busy || exporting || enhancing}
                onClick={() => onSetGroupMode?.("cluster")}
              >
                {t("split.modeCluster")}
              </button>
            </div>
          </div>
          <div style={S.splitHeaderRight}>
            <div style={S.splitTimingText}>{timingText}</div>
          </div>
        </div>
        <div style={S.splitPageSetupGrid}>
          {renderSourcePane()}
          {renderSettingsPanel()}
        </div>
        {renderResultsPanel(true)}
        {renderHistoryPanel()}
        <div style={{ ...S.splitStatusText, ...(statusTone === "error" ? S.splitStatusTextError : null) }}>
          {statusText || t("split.undoHint")}
        </div>
        {renderUploadInput()}
      </div>
    );
  }
  const content = (
      <div
        style={{ ...S.splitModal, ...(embedded ? S.splitPagePanel : null) }}
        onClick={embedded ? undefined : (event) => event.stopPropagation()}
      >
        <div style={S.splitModalHeader}>
          <div style={S.splitModalTitleRow}>
            <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("split.title")}</h2>
            <div style={S.splitToggleGroup}>
              <button
                type="button"
                style={{
                  ...S.splitToggleBtn,
                  ...(!isClusterMode ? S.splitToggleBtnActive : null),
                }}
                disabled={busy || exporting || enhancing}
                onClick={() => onSetGroupMode?.("standard")}
              >
                {t("split.modeStandard")}
              </button>
              <button
                type="button"
                style={{
                  ...S.splitToggleBtn,
                  ...(isClusterMode ? S.splitToggleBtnActive : null),
                }}
                disabled={busy || exporting || enhancing}
                onClick={() => onSetGroupMode?.("cluster")}
              >
                {t("split.modeCluster")}
              </button>
            </div>
          </div>
          <div style={S.splitHeaderRight}>
            <div style={S.splitTimingText}>{timingText}</div>
            {!embedded && <button onClick={onClose} style={S.closeBtn}>✕</button>}
          </div>
        </div>
        <div style={S.splitMainGrid}>
          <section style={S.splitLeftCol}>
            <div style={S.splitPane}>
              <div style={S.splitPaneTitle}>{t("split.original")}</div>
              <div style={S.splitOriginalWrap}>
                {sourceImage ? (
                  inlineZoomSource ? (
                    <InlineZoomViewer
                      src={sourceImage}
                      onCollapse={() => setInlineZoomSource(false)}
                      containerStyle={S.splitPaneInlineZoomViewer}
                      collapseButtonStyle={S.splitPaneInlineZoomCollapseBtn}
                      modelName={modelName}
                      promptText={promptText}
                    />
                  ) : (
                    <div style={S.splitImageWrap}>
                      <PreviewMetaBar modelName={modelName} promptText={promptText} />
                      <img
                        src={sourceImage}
                        alt={t("split.original")}
                        style={S.splitOriginalImg}
                        onClick={() => setInlineZoomSource(true)}
                      />
                      <button
                        type="button"
                        style={{
                          ...S.splitImageZoomBtn,
                          ...(inlineZoomSource ? S.splitImageZoomBtnActive : null),
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setInlineZoomSource((prev) => !prev);
                        }}
                        title={t("viewer.inlineViewer")}
                      >
                        🔍
                      </button>
                    </div>
                  )
                ) : (
                  <div style={S.turnStyleImageEmpty}>{busy ? t("split.detecting") : "-"}</div>
                )}
                <button
                  type="button"
                  style={{
                    ...S.splitImageUploadBtn,
                    opacity: busy || exporting || enhancing ? 0.55 : 1,
                    cursor: busy || exporting || enhancing ? "not-allowed" : "pointer",
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    uploadInputRef.current?.click();
                  }}
                  disabled={busy || exporting || enhancing}
                >
                  {t("split.upload")}
                </button>
              </div>
            </div>
            <div style={S.splitMidActions}>
              <div style={S.splitMidActionRow}>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(splitOnRemoved ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => onToggleSplitSource?.(true)}
                  >
                    {t("split.sourceRemoved")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(!splitOnRemoved ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => onToggleSplitSource?.(false)}
                  >
                    {t("split.sourceOriginal")}
                  </button>
                </div>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(renderMode === "painted" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetRenderMode?.("painted");
                    }}
                  >
                    {t("split.renderPainted")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(renderMode === "direct" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetRenderMode?.("direct");
                    }}
                  >
                    {t("split.renderDirect")}
                  </button>
                </div>
              </div>
              <div style={S.splitMidActionRow}>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(shapeMode === "edge" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetShapeMode?.("edge");
                    }}
                  >
                    {t("split.shapeEdge")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(shapeMode === "polygon" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetShapeMode?.("polygon");
                    }}
                  >
                    {t("split.shapePolygon")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(shapeMode === "rect" ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing}
                    onClick={() => {
                      onSetShapeMode?.("rect");
                    }}
                  >
                    {t("split.shapeRect")}
                  </button>
                </div>
                <div style={S.splitToggleGroup}>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(enhanceEnabled ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing || !hasItems}
                    onClick={() => {
                      onSetEnhanceEnabled?.(true);
                    }}
                  >
                    {t("split.qualityEnhanced")}
                  </button>
                  <button
                    type="button"
                    style={{
                      ...S.splitToggleBtn,
                      ...(!enhanceEnabled ? S.splitToggleBtnActive : null),
                    }}
                    disabled={busy || exporting || enhancing || !hasItems}
                    onClick={() => {
                      onSetEnhanceEnabled?.(false);
                    }}
                  >
                    {t("split.qualityOriginal")}
                  </button>
                </div>
              </div>
            </div>
            <div style={S.splitPane}>
              <div style={S.splitPaneTitle}>{isClusterMode ? t("split.clusterProcess") : t("split.process")}</div>
              <div style={S.splitProcessStack}>
                {processViews.map((view, viewIndex) => (
                  <div key={`${view.title}-${viewIndex}`} style={S.splitProcessBlock}>
                    {isClusterMode && <div style={S.splitProcessSubTitle}>{view.title}</div>}
                    <div style={S.splitOriginalWrap}>
                      {view.src ? (
                        inlineZoomProcessIndex === viewIndex ? (
                          <InlineZoomViewer
                            src={view.src}
                            onCollapse={() => setInlineZoomProcessIndex(null)}
                            containerStyle={S.splitPaneInlineZoomViewer}
                            collapseButtonStyle={S.splitPaneInlineZoomCollapseBtn}
                            modelName={modelName}
                            promptText={promptText}
                          />
                        ) : (
                          <div style={S.splitImageWrap}>
                            <PreviewMetaBar modelName={modelName} promptText={promptText} />
                            <img
                              src={view.src}
                              alt={view.alt}
                              style={S.splitOriginalImg}
                              onClick={() => setInlineZoomProcessIndex(viewIndex)}
                            />
                            <button
                              type="button"
                              style={{
                                ...S.splitImageZoomBtn,
                                ...(inlineZoomProcessIndex === viewIndex ? S.splitImageZoomBtnActive : null),
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                setInlineZoomProcessIndex((prev) => (prev === viewIndex ? null : viewIndex));
                              }}
                              title={t("viewer.inlineViewer")}
                            >
                              🔍
                            </button>
                          </div>
                        )
                      ) : (
                        <div style={S.turnStyleImageEmpty}>{busy ? t("split.detecting") : "-"}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section style={S.splitRightCol}>
            <div style={S.splitRightTop}>
              <div style={S.splitPaneTitle}>
                {isClusterMode ? t("split.clusterResults") : t("split.results")}
                <span style={S.splitPaneCount}>{busy ? t("split.detecting") : resultCountText}</span>
              </div>
              <div style={S.splitTopActions}>
                <button
                  type="button"
                  style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: sourceImage ? 1 : 0.5, cursor: sourceImage ? "pointer" : "not-allowed" }}
                  onClick={onResplit}
                  disabled={!sourceImage || busy || exporting || enhancing}
                >
                  {busy ? t("common.processing") : isClusterMode ? t("split.runCluster") : t("split.run")}
                </button>
                <button
                  type="button"
                  style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: selectedCount >= 2 ? 1 : 0.5, cursor: selectedCount >= 2 ? "pointer" : "not-allowed" }}
                  onClick={onMergeSelectedItems}
                  disabled={selectedCount < 2 || busy || exporting || enhancing}
                >
                  {t("split.merge")}
                </button>
                <button
                  type="button"
                  style={{ ...S.zipBtn, padding: "8px 12px", fontSize: 12, opacity: canUndo ? 1 : 0.5, cursor: canUndo ? "pointer" : "not-allowed" }}
                  onClick={onUndoDelete}
                  disabled={!canUndo || busy || exporting || enhancing}
                >
                  {t("split.undo")}
                </button>
                <button
                  type="button"
                  style={{ ...S.apiSaveBtn, opacity: hasItems && !busy ? 1 : 0.5, cursor: hasItems && !busy ? "pointer" : "not-allowed" }}
                  onClick={onExport}
                  disabled={!hasItems || busy || exporting || enhancing}
                >
                  {exporting ? t("split.exporting") : t("split.export")}
                </button>
              </div>
            </div>
            <div style={S.splitRightBody}>
              {busy ? (
                <div style={S.turnStyleImageEmpty}>{t("split.detecting")}</div>
              ) : hasItems ? (
                <div style={S.splitGrid}>
                  {items.map((item, index) => (
                    <div key={item.id || `split-item-${index}`} style={S.splitItemCell}>
                      <button
                        type="button"
                        style={{
                          ...S.splitItemSelectBtn,
                          ...(selectedSet.has(item.id) ? S.splitItemSelectBtnActive : null),
                        }}
                        onClick={() => onToggleSelectItem?.(item.id)}
                        title={t("split.merge")}
                      >
                        {selectedSet.has(item.id) ? "✓" : "○"}
                      </button>
                      <button
                        type="button"
                        style={S.splitItemBtn}
                        onClick={() =>
                          onPreview?.({
                            outputSrc: item.image,
                            modelName,
                            promptText,
                          })
                        }
                        title={t("split.previewSplit", { index: index + 1 })}
                      >
                        <div style={S.splitItemOrder}>{index + 1}</div>
                        <img
                          src={item.image}
                          alt={`Split ${index + 1}`}
                          style={S.splitItemImg}
                        />
                      </button>
                      <button
                        type="button"
                        style={S.splitItemDeleteBtn}
                        onClick={() => onDeleteItem?.(item.id)}
                        title={t("split.delete")}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={S.turnStyleImageEmpty}>{t("split.noSubjects")}</div>
              )}
            </div>
          </section>
        </div>
        <div style={{ ...S.splitStatusText, ...(statusTone === "error" ? S.splitStatusTextError : null) }}>
          {statusText || t("split.undoHint")}
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = (event.target.files || [])[0];
            if (!file) {
              event.target.value = "";
              return;
            }
            const encoded = await fileToBase64(file);
            if (typeof encoded === "string" && encoded.startsWith("data:image/")) {
              await onUploadImageDataUrl?.(encoded, file);
            }
            event.target.value = "";
          }}
        />
      </div>
  );
  return embedded ? content : (
    <div style={S.modalOverlay} onClick={onClose}>
      {content}
    </div>
  );
}
