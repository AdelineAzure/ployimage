import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useI18n } from "../../i18n";
import { S } from "../../styles/appStyles";

export function AtlasThumbnailModal({ show, onClose, items, onReorder, onGenerate, thumbnail, busy, onPreview }) {
  const { uiLanguage, t } = useI18n();
  const [dragKey, setDragKey] = useState(null);

  useEffect(() => {
    if (!show) setDragKey(null);
  }, [show]);

  if (!show) return null;

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={{ ...S.settingsModal, maxWidth: 880 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "mono", letterSpacing: -0.5 }}>{t("atlas.title")}</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.atlasModalHint}>{t("atlas.hint")}</div>
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
                <img src={item.image} alt={item.theme || item.modelName || (uiLanguage === "zh" ? `已选图片 ${index + 1}` : `Selected ${index + 1}`)} style={S.atlasModalCardThumb} />
                <div style={S.atlasModalCardMeta}>
                  <div style={S.atlasModalCardTitle}>{item.theme || item.modelName || (uiLanguage === "zh" ? `图片 ${index + 1}` : `Image ${index + 1}`)}</div>
                  <div style={S.atlasModalCardSub}>{item.modelName || item.modelId || "-"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={S.turnStyleImageEmpty}>{t("atlas.empty")}</div>
        )}
        <div style={{ ...S.modalInputImagesActions, justifyContent: "space-between", marginTop: 16 }}>
          <button
            type="button"
            style={{ ...S.zipBtn, padding: "8px 14px", fontSize: 12, opacity: thumbnail ? 1 : 0.5, cursor: thumbnail ? "pointer" : "not-allowed" }}
            onClick={() => thumbnail && onPreview?.(thumbnail)}
            disabled={!thumbnail}
          >
            {uiLanguage === "zh" ? "预览" : "Preview"}
          </button>
          <button
            type="button"
            style={{ ...S.apiSaveBtn, opacity: items.length ? 1 : 0.5, cursor: items.length ? "pointer" : "not-allowed" }}
            onClick={onGenerate}
            disabled={!items.length || busy}
          >
            {busy ? t("common.processing") : thumbnail ? t("atlas.refresh") : t("atlas.generate")}
          </button>
        </div>
        {thumbnail && (
          <div style={S.atlasModalPreview}>
            <img src={thumbnail} alt={uiLanguage === "zh" ? "图集缩略图" : "Atlas thumbnail"} style={S.atlasModalPreviewImg} />
          </div>
        )}
      </div>
    </div>
  );
}
