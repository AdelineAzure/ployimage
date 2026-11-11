// Eval tab：评测集 / 看板 / 模型能力 三个版面。
// 数据都来自当前任务文件夹的 eval/；图片从 turn 文件夹实时读，不另存。
import { useEffect, useMemo, useState } from "react";
import { S, mono } from "../../styles/appStyles";
import { useI18n } from "../../i18n";
import { IMAGE_MODELS } from "../../config/appConfig";
import {
  JUDGE_MODELS,
  MAX_CASES_PER_SET,
  MAX_EVAL_SETS,
  MIN_CELL_SAMPLES,
  acceptanceLine,
  normalizeEvalSet,
  pickRecommended,
  resolveCaseCriteria,
  summarize,
  caseLabel,
  promptHeadline,
} from "../../services/evalCore";
import { writeSetImage } from "../../services/evalStore";
import { TONE_STYLES } from "./scoreContext";

const GOLD = "#facc15";
const GOLD_SOFT = "rgba(250,204,21,0.14)";
const LINE = "rgba(255,255,255,0.08)";
const modelName = (id) => IMAGE_MODELS.find((m) => m.id === id)?.shortName || IMAGE_MODELS.find((m) => m.id === id)?.name || id;

const card = { border: `1px solid ${LINE}`, borderRadius: 10, padding: 14, background: "rgba(255,255,255,0.02)" };
const btn = (on = false) => ({
  ...S.turnActionBtn,
  // 用完整 border 覆盖，别只改 borderColor：选中态来回切时 React 会警告 shorthand / longhand 混用。
  border: `1px solid ${on ? GOLD : "rgba(255,255,255,0.2)"}`,
  ...(on ? { background: GOLD_SOFT, color: GOLD } : null),
});
const inputStyle = { ...S.proxyInput, padding: "7px 10px", fontSize: 12 };
const toneBg = (tone) => (TONE_STYLES[tone] || TONE_STYLES.none).bg;

function Thumb({ src, view, size = 84, onClick }) {
  const tone = TONE_STYLES[view?.tone] || TONE_STYLES.none;
  const bad = view?.tone === "bad";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
 position: "relative", width: size, height: size, padding: 0, borderRadius: 6, overflow: "hidden",
 border: `${bad ? 2 : 1}px solid ${bad ? "rgba(239,68,68,0.95)" : LINE}`, background: "#0b0b0d", cursor: "pointer", flexShrink: 0,
      }}
      title={view?.title || ""}
    >
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span style={{ fontFamily: mono, fontSize: 10, color: "#71717a" }}>—</span>}
      {view?.inSet && (
        <span style={{ position: "absolute", left: 4, top: 4, padding: "1px 6px", borderRadius: 999, background: tone.bg, color: tone.text, fontFamily: mono, fontSize: 10, fontWeight: 700 }}>
   {view.status === "keyFail" ? `${view.total} ✕` : view.total ?? view.label}
        </span>
      )}
    </button>
  );
}

// ─── 评测集 ───
function SetsView({ ev, t }) {
  const sets = ev.sets;
  const [activeId, setActiveId] = useState(sets[0]?.id || "");
  const [draft, setDraft] = useState(null);
  const [caseId, setCaseId] = useState("");
  const [thumbs, setThumbs] = useState({});
  const [saveNote, setSaveNote] = useState("");
  const active = sets.find((s) => s.id === activeId) || null;

  useEffect(() => { if (!activeId && sets[0]) setActiveId(sets[0].id); }, [sets, activeId]);
  useEffect(() => { if (ev.criteriaEditorSetId) { setActiveId(ev.criteriaEditorSetId); ev.setCriteriaEditorSetId(null); } }, [ev.criteriaEditorSetId]);
  useEffect(() => { setDraft(active ? JSON.parse(JSON.stringify(active)) : null); setCaseId(""); setSaveNote(""); }, [activeId, active?.version, sets.length]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!active) return;
      const next = {};
      for (const c of active.cases) next[c.id] = await ev.readSetImage(active.id, c.image);
      if (!cancelled) setThumbs(next);
    })();
    return () => { cancelled = true; };
  }, [active?.id, active?.cases?.length]);

  const createSet = async () => {
    const used = new Set(sets.map((s) => s.id));
    let n = 1; while (used.has(`set-${String(n).padStart(2, "0")}`)) n += 1;
    const id = `set-${String(n).padStart(2, "0")}`;
    await ev.saveSet(normalizeEvalSet({ id, name: id, criteria: [], cases: [] }, id));
    setActiveId(id);
  };
  const addImages = async (files) => {
    if (!draft) return;
    const room = MAX_CASES_PER_SET - draft.cases.length;
    const added = [];
    for (const f of [...files].slice(0, Math.max(0, room))) {
      const name = await writeSetImage(ev.rootHandle, draft.id, f);
      added.push({ id: name.replace(/\.[^.]+$/, ""), image: name, tags: [], extra: [], skip: [], note: "", tagsLocked: false, unsure: [] });
    }
    const next = { ...draft, cases: [...draft.cases, ...added] };
    setDraft(next);
    await ev.saveSet(next);
  };
  const upd = (fn) => setDraft((d) => { const n = JSON.parse(JSON.stringify(d)); fn(n); return n; });
  const save = async () => {
    const diff = await ev.saveSet(draft);
    if (!diff) return;
    setSaveNote(diff.needsJudge.length
      ? t("eval.savedNeedsJudge", { items: diff.needsJudge.join(", ") })
      : diff.reweighted.length || diff.removed.length ? t("eval.savedRecomputed") : t("eval.saved"));
  };
  const dirty = draft && active && JSON.stringify(draft) !== JSON.stringify(active);
  const selCase = draft?.cases.find((c) => c.id === caseId) || null;
  const tagValues = (ev.tagging?.dimensions || []).flatMap((d) => d.values);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px minmax(0, 1fr)", gap: 14 }}>
      <div style={{ ...card, padding: 8, display: "grid", gap: 6, alignContent: "start" }}>
 {sets.map((s) => (
   <button key={s.id} type="button" onClick={() => setActiveId(s.id)} style={{ ...btn(s.id === activeId), justifyContent: "flex-start", textAlign: "left", height: "auto", padding: "7px 9px", display: "block" }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
     <div style={{ fontSize: 10, color: "#71717a" }}>{s.id} · {s.cases.length}/{MAX_CASES_PER_SET}</div>
   </button>
 ))}
        {sets.length < MAX_EVAL_SETS && (
   <button type="button" onClick={createSet} style={{ ...btn(), border: "1px dashed rgba(255,255,255,0.2)" }}>+ {t("eval.newSet")}</button>
 )}
      </div>

      {!draft ? (
        <div style={{ ...card, color: "#a1a1aa", fontFamily: mono, fontSize: 12, lineHeight: 1.7 }}>{t("eval.noSets")}</div>
      ) : (
 <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
   <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
     <input id="eval-set-name" style={{ ...inputStyle, flex: "1 1 220px", fontSize: 14, fontWeight: 600 }} value={draft.name} onChange={(e) => upd((d) => { d.name = e.target.value; })} />
     <label style={{ fontFamily: mono, fontSize: 11, color: "#a1a1aa" }}>
       {t("eval.passScore")}{" "}
       <input id="eval-pass" type="number" step="0.5" min="0" max="10" style={{ ...inputStyle, width: 64 }} value={draft.passScore} onChange={(e) => upd((d) => { d.passScore = Number(e.target.value); })} />
     </label>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#71717a" }}>v{draft.version}</span>
     <button type="button" disabled={!dirty} onClick={save} style={{ ...btn(dirty), opacity: dirty ? 1 : 0.5 }}>{t("eval.saveSet")}</button>
          </div>
   {!!saveNote && <div style={{ fontFamily: mono, fontSize: 11, color: GOLD }}>{saveNote}</div>}

   <div style={card}>
     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
       <span style={{ ...S.label, marginBottom: 0 }}>{t("eval.sharedCriteria")}</span>
<button type="button" style={btn()} onClick={() => upd((d) => { d.criteria.push({ id: `c${d.criteria.length + 1}`, desc: "", weight: 1, when: [], key: false }); })}>+ {t("eval.addCriterion")}</button>
     </div>
     <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr) 58px 130px 52px 26px", gap: 6, fontFamily: mono, fontSize: 10, color: "#71717a", marginBottom: 4 }}>
<span>id</span><span>{t("eval.criterionDesc")}</span><span>{t("eval.weight")}</span><span>{t("eval.when")}</span><span>{t("eval.keyItem")}</span><span />
     </div>
            {draft.criteria.map((c, i) => {
       const old = active.criteria.find((x) => x.id === c.id);
       const changed = !old || old.desc !== c.desc || old.weight !== c.weight || old.key !== c.key || JSON.stringify(old.when) !== JSON.stringify(c.when);
return (
         <div key={i} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr) 58px 130px 52px 26px", gap: 6, marginBottom: 5, alignItems: "center", ...(changed ? { outline: `1px solid ${GOLD}`, borderRadius: 6 } : null) }}>
    <input id={`crit-id-${i}`} style={inputStyle} value={c.id} onChange={(e) => upd((d) => { d.criteria[i].id = e.target.value.replace(/\s+/g, ""); })} />
    <input id={`crit-desc-${i}`} style={inputStyle} value={c.desc} placeholder={t("eval.criterionDescPh")} onChange={(e) => upd((d) => { d.criteria[i].desc = e.target.value; })} />
    <input id={`crit-w-${i}`} type="number" min="1" max="5" style={inputStyle} value={c.weight} onChange={(e) => upd((d) => { d.criteria[i].weight = Math.max(1, Number(e.target.value) || 1); })} />
           <input id={`crit-when-${i}`} style={inputStyle} value={(c.when || []).join(",")} placeholder={t("eval.whenPh")} list="eval-tag-values" onChange={(e) => upd((d) => { d.criteria[i].when = e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean); })} />
    <label style={{ display: "flex", justifyContent: "center" }}><input id={`crit-key-${i}`} type="checkbox" checked={c.key} onChange={(e) => upd((d) => { d.criteria[i].key = e.target.checked; })} /></label>
    <button type="button" style={{ ...btn(), padding: 0, width: 26 }} onClick={() => upd((d) => { d.criteria.splice(i, 1); })} title={t("eval.removeCriterion")}>✕</button>
  </div>
       );
     })}
     <datalist id="eval-tag-values">{tagValues.map((v) => <option key={v} value={v} />)}</datalist>
            <p style={{ ...S.hint, fontFamily: mono, fontSize: 11 }}>{t("eval.criteriaHint")}</p>
   </div>

          <div style={card}>
     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
       <span style={{ ...S.label, marginBottom: 0 }}>{t("eval.cases")} ({draft.cases.length}/{MAX_CASES_PER_SET})</span>
       <span style={{ display: "flex", gap: 6 }}>
  <button type="button" style={btn()} disabled={!ev.tagging?.dimensions?.length || !!ev.progress}
    title={ev.tagging?.dimensions?.length ? "" : t("eval.noTagging")}
           onClick={() => ev.tagCases(draft.id, draft.cases.map((c) => c.id))}>{t("eval.gptTag")}</button>
  <label style={{ ...btn(), display: "inline-flex", alignItems: "center", cursor: "pointer", opacity: draft.cases.length >= MAX_CASES_PER_SET ? 0.5 : 1 }}>
           + {t("eval.addImages")}
    <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={draft.cases.length >= MAX_CASES_PER_SET}
      onChange={async (e) => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) await addImages(fs); }} />
         </label>
       </span>
            </div>
     <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
       {draft.cases.map((c) => {
         const { inactive } = resolveCaseCriteria(draft, c);
  return (
    <button key={c.id} type="button" title={c.image} onClick={() => setCaseId(c.id === caseId ? "" : c.id)}
      style={{ padding: 0, borderRadius: 8, overflow: "hidden", background: "#0b0b0d", textAlign: "left", cursor: "pointer", border: `${c.id === caseId ? 2 : 1}px solid ${c.id === caseId ? GOLD : LINE}` }}>
      <div style={{ aspectRatio: "1 / 1", maxWidth: "100%", background: "#18181b" }}>
        {thumbs[c.id] && <img src={thumbs[c.id]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      </div>
      <div style={{ padding: "5px 6px", fontFamily: mono, fontSize: 10, color: "#d4d4d8" }}>
        <div style={{ fontWeight: 600 }}>{caseLabel(draft, c.id)}</div>
        <div style={{ color: c.unsure?.length ? "#fde047" : "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.tags.join(" · ") || t("eval.noTags")}</div>
        {(c.extra.length > 0 || inactive.length > 0) && <div style={{ color: "#71717a" }}>{c.extra.length ? `+${c.extra.length} ` : ""}{inactive.length ? t("eval.inactiveShort", { count: inactive.length }) : ""}</div>}
      </div>
    </button>
  );
       })}
     </div>
     {selCase && (
       <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 12, display: "grid", gap: 8 }}>
         <div style={{ fontFamily: mono, fontSize: 12, color: "#f4f4f5", fontWeight: 600 }}>{caseLabel(draft, selCase.id)}</div>
         <label style={{ fontFamily: mono, fontSize: 11, color: "#a1a1aa" }}>
    {t("eval.tags")}
    <input id={`case-tags-${selCase.id}`} style={{ ...inputStyle, marginTop: 4 }} value={selCase.tags.join(",")} list="eval-tag-values" placeholder={t("eval.tagsPh")}
      onChange={(e) => upd((d) => { const cc = d.cases.find((x) => x.id === selCase.id); cc.tags = e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean); cc.tagsLocked = true; cc.unsure = []; })} />
         </label>
         {!!selCase.unsure?.length && <div style={{ fontFamily: mono, fontSize: 11, color: "#fde047" }}>{t("eval.unsureDims", { dims: selCase.unsure.join(", ") })}</div>}
  <label style={{ fontFamily: mono, fontSize: 11, color: "#a1a1aa" }}>
           {t("eval.skip")}
    <input id={`case-skip-${selCase.id}`} style={{ ...inputStyle, marginTop: 4 }} value={selCase.skip.join(",")} placeholder={draft.criteria.map((c) => c.id).join(",")}
      onChange={(e) => upd((d) => { d.cases.find((x) => x.id === selCase.id).skip = e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean); })} />
         </label>
  <div style={{ fontFamily: mono, fontSize: 11, color: "#a1a1aa" }}>{t("eval.extraCriteria")}</div>
  {selCase.extra.map((c, i) => (
    <div key={i} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr) 58px 52px 26px", gap: 6, alignItems: "center" }}>
      <input id={`x-id-${i}`} style={inputStyle} value={c.id} onChange={(e) => upd((d) => { d.cases.find((x) => x.id === selCase.id).extra[i].id = e.target.value.replace(/\s+/g, ""); })} />
      <input id={`x-desc-${i}`} style={inputStyle} value={c.desc} onChange={(e) => upd((d) => { d.cases.find((x) => x.id === selCase.id).extra[i].desc = e.target.value; })} />
      <input id={`x-w-${i}`} type="number" min="1" max="5" style={inputStyle} value={c.weight} onChange={(e) => upd((d) => { d.cases.find((x) => x.id === selCase.id).extra[i].weight = Math.max(1, Number(e.target.value) || 1); })} />
      <label style={{ display: "flex", justifyContent: "center" }}><input id={`x-key-${i}`} type="checkbox" checked={c.key} onChange={(e) => upd((d) => { d.cases.find((x) => x.id === selCase.id).extra[i].key = e.target.checked; })} /></label>
      <button type="button" style={{ ...btn(), padding: 0, width: 26 }} onClick={() => upd((d) => { d.cases.find((x) => x.id === selCase.id).extra.splice(i, 1); })}>✕</button>
    </div>
         ))}
         <div style={{ display: "flex", gap: 6 }}>
    <button type="button" style={btn()} onClick={() => upd((d) => { const cc = d.cases.find((x) => x.id === selCase.id); cc.extra.push({ id: `x${cc.extra.length + 1}`, desc: "", weight: 1, when: [], key: false }); })}>+ {t("eval.addExtra")}</button>
    <button type="button" style={{ ...btn(), color: "#fca5a5" }} onClick={() => { upd((d) => { d.cases = d.cases.filter((x) => x.id !== selCase.id); }); setCaseId(""); }}>{t("eval.removeCase")}</button>
  </div>
       </div>
     )}
   </div>
        </div>
      )}
    </div>
  );
}

// ─── 看板 ───
// 一个看板 = 一个提示词（同一段提示词文本）。看板里：评测集按行，模型按列。
function BoardView({ ev, t, onOpenImage }) {
  const [promptId, setPromptId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [cell, setCell] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [showPrompt, setShowPrompt] = useState(false);

  const boards = useMemo(() => {
    const map = new Map();
    for (const row of ev.allEntries) {
      const key = (row.entry.promptText || "").trim() || "(空)";
      if (!map.has(key)) map.set(key, { prompt: key, rows: [], firstAt: row.entry.turn.createdAt || 0 });
      const b = map.get(key);
      b.rows.push(row);
      b.firstAt = Math.min(b.firstAt, row.entry.turn.createdAt || 0);
    }
    return [...map.values()].sort((a, b) => a.firstAt - b.firstAt).map((b, i) => ({ ...b, id: `P${i + 1}` }));
  }, [ev.allEntries]);

  useEffect(() => { if (!boards.find((b) => b.id === promptId) && boards.length) setPromptId(boards[boards.length - 1].id); }, [boards, promptId]);
  // 首次渲染时还没选看板：直接落到最新的提示词，别等 effect，否则 board 为 null 会崩。
  const board = boards.find((b) => b.id === promptId) || boards[boards.length - 1] || null;
  const rows = (board?.rows || []).filter((r) => !tagFilter || r.view?.tags?.includes(tagFilter));
  const models = [...new Set(rows.map((r) => r.entry.modelId))];
  const setIds = [...new Set(rows.map((r) => r.entry.ref.setId))].sort();
  const summaryOf = (list) => summarize(list.map((r) => ({ total: r.view?.total, status: r.view?.status })));
  const total = summaryOf(rows);
  const stale = rows.filter((r) => r.view?.stale);
  const unjudged = rows.filter((r) => r.view?.inSet && !r.view?.judged);
  const allTags = [...new Set((board?.rows || []).flatMap((r) => r.view?.tags || []))];

  const runJudge = (list, onlyStale = false) => ev.judgeMany(list.map((r) => ({
    entry: r.entry,
    onlyIds: onlyStale ? r.view.rows.filter((x) => x.stale).map((x) => x.id) : null,
  })).filter((x) => !onlyStale || x.onlyIds.length));

  if (!boards.length || !board) {
    return <div style={{ ...card, color: "#a1a1aa", fontFamily: mono, fontSize: 12, lineHeight: 1.7 }}>{t("eval.noBoards")}</div>;
  }
  const cellRows = cell ? rows.filter((r) => r.entry.ref.setId === cell.setId && r.entry.modelId === cell.modelId) : [];
  const sortedCell = [...cellRows].sort((a, b) => (a.view?.total ?? 99) - (b.view?.total ?? 99));
  const lowRows = sortedCell.filter((r) => r.view?.tone === "bad");
  const otherRows = sortedCell.filter((r) => r.view?.tone !== "bad");
  const togglePick = (k) => setPicked((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const boardModels = [...new Set(boards.flatMap((b) => b.rows.map((r) => r.entry.modelId)))];
  const dots = (list) => (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 3 }}>
      {list.map((r) => <span key={r.imageKey} title={`${r.view?.caseLabel || r.entry.ref.caseId} · ${r.view?.total ?? "—"}`} style={{ width: 8, height: 8, borderRadius: 2, background: toneBg(r.view?.tone) }} />)}
    </div>
  );
  // 一行 = 一个提示词：每个模型的平均分 + 每张图的红绿点，再是总平均和提示词首句。
  const boardRow = (b, { selected = false, onClick, expandable = false } = {}) => {
    const s = summaryOf(b.rows);
    return (
      <tr key={b.id} onClick={onClick} style={{ borderTop: `1px solid ${LINE}`, cursor: "pointer", background: selected ? GOLD_SOFT : "transparent" }}>
        <td style={{ padding: "6px 8px", color: selected ? GOLD : "#e4e4e7", fontWeight: 700, whiteSpace: "nowrap" }}>{b.id}</td>
        {boardModels.map((m) => {
          const list = b.rows.filter((r) => r.entry.modelId === m);
          const ms = summaryOf(list);
          return (
            <td key={m} style={{ padding: "6px 8px", verticalAlign: "top" }}>
              {list.length ? <><b style={{ color: "#f4f4f5" }}>{ms.avg ?? "—"}</b>{dots(list)}</> : <span style={{ color: "#52525b" }}>—</span>}
            </td>
          );
        })}
        <td style={{ padding: "6px 8px", color: "#f4f4f5", fontWeight: 700, borderLeft: `1px dashed ${LINE}` }}>{s.avg ?? "—"}<div style={{ fontSize: 10, color: "#71717a", fontWeight: 400 }}>{s.count - s.low}/{s.count}</div></td>
        <td style={{ padding: "6px 8px", color: "#a1a1aa", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.prompt}>
          {expandable ? <span style={{ color: GOLD }}>{showPrompt ? "▾ " : "▸ "}</span> : null}{promptHeadline(b.prompt)}
        </td>
      </tr>
    );
  };
  const tableHead = (
    <thead>
      <tr style={{ color: "#71717a" }}>
        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, position: "sticky", top: 0, background: "#141416" }}>#</th>
        {boardModels.map((m) => <th key={m} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, color: "#e4e4e7", position: "sticky", top: 0, background: "#141416", whiteSpace: "nowrap" }}>{modelName(m)}</th>)}
        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, position: "sticky", top: 0, background: "#141416", borderLeft: `1px dashed ${LINE}`, whiteSpace: "nowrap" }}>{t("eval.avg")} · {t("eval.passCount")}</th>
        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, position: "sticky", top: 0, background: "#141416" }}>{t("eval.prompt")}</th>
      </tr>
    </thead>
  );
  const tableStyle = { borderCollapse: "collapse", width: "100%", minWidth: 260 + boardModels.length * 110, fontFamily: mono, fontSize: 12 };
  const selectBoard = (id) => { setPromptId(id); setCell(null); setShowPrompt(false); };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 所有提示词：固定约 8 行高，超出在框里滚动。 */}
      <div style={{ ...card, padding: 0, maxHeight: 8 * 44 + 34, overflow: "auto" }}>
        <table style={tableStyle}>
          {tableHead}
          <tbody>{boards.map((b) => boardRow(b, { selected: b.id === board.id, onClick: () => selectBoard(b.id) }))}</tbody>
        </table>
      </div>

      {/* 框外：当前看板（默认最新一次），点击展开完整提示词。 */}
      <div style={{ ...card, padding: 0, overflowX: "auto", borderColor: GOLD }}>
        <table style={tableStyle}>
          {tableHead}
          <tbody>{boardRow(board, { selected: true, expandable: true, onClick: () => setShowPrompt((v) => !v) })}</tbody>
        </table>
        {showPrompt && <div style={{ borderTop: `1px solid ${LINE}`, padding: "10px 12px", fontSize: 12, color: "#d4d4d8", lineHeight: 1.6, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap" }}>{board.prompt}</div>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ flex: 1 }} />
        {allTags.length > 0 && (
          <select id="eval-tag-filter" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            <option value="">{t("eval.allTags")}</option>
            {allTags.map((tg) => <option key={tg} value={tg}>{tg}</option>)}
          </select>
        )}
        <label style={{ ...btn(lowOnly), display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input id="eval-low-only" type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />{t("eval.lowOnly")}
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
 {[
   [t("eval.avg"), total.avg ?? "—", "#f4f4f5"],
   [t("eval.low"), `${total.low} / ${total.count}`, "#fca5a5"],
          [t("eval.keyFails"), total.keyFail, "#fca5a5"],
          [t("eval.pending"), total.pending, "#a1a1aa"],
        ].map(([k, v, c]) => (
   <span key={k} style={{ ...card, padding: "6px 12px", fontFamily: mono, fontSize: 12 }}><span style={{ color: "#71717a" }}>{k} </span><b style={{ color: c }}>{v}</b></span>
        ))}
        <span style={{ flex: 1 }} />
 <select id="eval-judge-model" value={ev.judgeModel} onChange={(e) => ev.setJudgeModel(e.target.value)} style={{ ...inputStyle, width: "auto" }} title={t("eval.judgeModel")}>
   {JUDGE_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
 </select>
        {ev.progress ? (
          <button type="button" style={btn(true)} onClick={ev.stopJudging}>{t("eval.progress", ev.progress)} · {t("eval.stop")}</button>
 ) : (
   <>
     {unjudged.length > 0 && <button type="button" style={btn(true)} onClick={() => runJudge(unjudged)}>{t("eval.judgeUnjudged", { count: unjudged.length })}</button>}
     {picked.size > 0 && <button type="button" style={btn(true)} onClick={() => { runJudge(rows.filter((r) => picked.has(r.imageKey))); setPicked(new Set()); }}>{t("eval.rejudgePicked", { count: picked.size })}</button>}
   </>
        )}
      </div>

      {stale.length > 0 && !ev.progress && (
        <div style={{ ...card, borderColor: GOLD, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
   <span style={{ fontFamily: mono, fontSize: 12, color: GOLD, flex: 1 }}>{t("eval.staleBanner", { count: stale.length })}</span>
   <button type="button" style={btn(true)} onClick={() => runJudge(stale, true)}>{t("eval.rejudgeStale", { count: stale.length })}</button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
 <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 120 + models.length * 150, fontFamily: mono, fontSize: 12 }}>
          <thead>
            <tr>
       <th style={{ textAlign: "left", padding: 8, color: "#71717a", fontWeight: 500 }}>{t("eval.setByModel")}</th>
       {models.map((m) => {
         const s = summaryOf(rows.filter((r) => r.entry.modelId === m));
  return <th key={m} style={{ textAlign: "left", padding: 8, color: "#e4e4e7" }}>{modelName(m)} · {s.avg ?? "—"}</th>;
})}
     </tr>
          </thead>
          <tbody>
     {setIds.map((sid) => (
       <tr key={sid} style={{ borderTop: `1px solid ${LINE}` }}>
         <td style={{ padding: 8, color: "#d4d4d8" }}>{ev.sets.find((s) => s.id === sid)?.name || sid}</td>
         {models.map((m) => {
    const list = rows.filter((r) => r.entry.ref.setId === sid && r.entry.modelId === m);
    const shown = lowOnly ? list.filter((r) => r.view?.tone === "bad") : list;
    const s = summaryOf(list);
    const on = cell?.setId === sid && cell?.modelId === m;
    return (
      <td key={m} style={{ padding: 6 }}>
        <button type="button" onClick={() => setCell(on ? null : { setId: sid, modelId: m })}
   style={{ width: "100%", textAlign: "left", padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: "rgba(255,255,255,0.02)", border: `${on ? 2 : 1}px solid ${on ? GOLD : LINE}` }}>
          <div style={{ color: "#f4f4f5", fontWeight: 700, fontSize: 14 }}>{s.avg ?? "—"}</div>
   <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
     {shown.map((r) => <span key={r.imageKey} style={{ width: 11, height: 11, borderRadius: 2, background: toneBg(r.view?.tone) }} />)}
   </div>
        </button>
      </td>
    );
         })}
       </tr>
            ))}
   </tbody>
        </table>
      </div>

      {cell && (
 <div style={card}>
   <div style={{ fontFamily: mono, fontSize: 12, color: "#f4f4f5", marginBottom: 8 }}>
     {ev.sets.find((s) => s.id === cell.setId)?.name || cell.setId} · {modelName(cell.modelId)} · {t("eval.avg")} {summaryOf(cellRows).avg ?? "—"}
          </div>
   {[["low", lowRows], ["other", lowOnly ? [] : otherRows]].map(([k, list]) => list.length > 0 && (
     <div key={k} style={{ marginBottom: 8 }}>
       <div style={{ fontFamily: mono, fontSize: 11, color: k === "low" ? "#fca5a5" : "#a1a1aa", marginBottom: 6 }}>{k === "low" ? t("eval.lowGroup", { count: list.length }) : t("eval.otherGroup", { count: list.length })}</div>
       <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
         {list.map((r) => (
    <div key={r.imageKey} style={{ position: "relative" }}>
      <Thumb src={r.entry.image} view={r.view} onClick={() => onOpenImage(r)} />
      <input type="checkbox" checked={picked.has(r.imageKey)} onChange={() => togglePick(r.imageKey)} title={t("eval.pickForRejudge")}
        style={{ position: "absolute", right: 4, bottom: 4 }} />
      <div style={{ fontFamily: mono, fontSize: 10, color: "#a1a1aa", marginTop: 2 }}>{r.view?.caseLabel || r.entry.ref.caseId}</div>
    </div>
         ))}
       </div>
     </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 模型能力 ───
// 当前任务文件夹里：每个提示词一行，模型一列；参照模型平均分 × 70% 是这一行的可接受线。
function AbilityView({ ev, t }) {
  const [refModel, setRefModel] = useState("gemini-3.1-flash-image");
  const rowsByPrompt = useMemo(() => {
    const map = new Map();
    for (const row of ev.allEntries) {
      const key = (row.entry.promptText || "").trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].map(([prompt, list], i) => ({ id: `P${i + 1}`, prompt, list }));
  }, [ev.allEntries]);
  const models = [...new Set(ev.allEntries.map((r) => r.entry.modelId))];
  const others = models.filter((m) => m !== refModel);
  if (!models.length) return <div style={{ ...card, color: "#a1a1aa", fontFamily: mono, fontSize: 12 }}>{t("eval.noBoards")}</div>;
  const cellOf = (list, m) => { const s = summarize(list.filter((r) => r.entry.modelId === m).map((r) => ({ total: r.view?.total, status: r.view?.status }))); return { modelId: m, ...s }; };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontFamily: mono, fontSize: 11, color: "#a1a1aa" }}>{t("eval.reference")}{" "}
          <select id="eval-ref-model" value={refModel} onChange={(e) => setRefModel(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
     {[...new Set([refModel, ...models])].map((m) => <option key={m} value={m}>{modelName(m)}</option>)}
   </select>
        </label>
        <span style={{ fontFamily: mono, fontSize: 11, color: "#71717a" }}>{t("eval.abilityHint", { min: MIN_CELL_SAMPLES })}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 260 + (others.length + 2) * 110, fontFamily: mono, fontSize: 12 }}>
   <thead>
     <tr style={{ color: "#a1a1aa" }}>
       <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>{t("eval.prompt")}</th>
       {others.map((m) => <th key={m} style={{ textAlign: "center", padding: 8, color: "#e4e4e7" }}>{modelName(m)}</th>)}
       <th style={{ textAlign: "center", padding: 8, color: "#e4e4e7", borderLeft: `1px dashed ${LINE}` }}>{modelName(refModel)}<div style={{ fontSize: 10, color: "#71717a", fontWeight: 400 }}>{t("eval.referenceCol")}</div></th>
       <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>{t("eval.acceptLine")}</th>
       <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>{t("eval.recommend")}</th>
     </tr>
          </thead>
   <tbody>
     {rowsByPrompt.map(({ id, prompt, list }) => {
       const ref = cellOf(list, refModel);
       const line = acceptanceLine(ref.avg);
const cells = others.map((m) => cellOf(list, m));
       const rec = pickRecommended(cells, line);
       return (
  <tr key={id} style={{ borderTop: `1px solid ${LINE}` }}>
    <td style={{ padding: 8, color: "#d4d4d8", maxWidth: 260 }} title={prompt}>
      <b>{id}</b> <span style={{ color: "#71717a" }}>{prompt.slice(0, 36)}{prompt.length > 36 ? "…" : ""}</span>
    </td>
    {cells.map((c) => {
      const few = c.count < MIN_CELL_SAMPLES;
      const ok = line !== null && c.avg !== null && c.avg >= line;
      return (
        <td key={c.modelId} style={{ textAlign: "center", padding: 8 }}>
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, border: c.modelId === rec ? `1px solid ${GOLD}` : "1px solid transparent", color: c.avg === null ? "#52525b" : few ? "#a1a1aa" : ok ? "#86efac" : "#fca5a5", fontWeight: 700 }}>
     {c.avg ?? "—"}
          </span>
   <div style={{ fontSize: 10, color: few ? "#fde047" : "#52525b" }}>{few ? t("eval.fewSamples", { count: c.count }) : `n=${c.count}`}{c.keyFail ? ` · ✕${c.keyFail}` : ""}</div>
        </td>
      );
           })}
    <td style={{ textAlign: "center", padding: 8, borderLeft: `1px dashed ${LINE}`, color: "#f4f4f5", fontWeight: 700 }}>{ref.avg ?? "—"}<div style={{ fontSize: 10, color: "#52525b", fontWeight: 400 }}>n={ref.count}</div></td>
           <td style={{ textAlign: "center", padding: 8, color: ref.avg !== null && ref.avg < 6 ? "#fde047" : "#d4d4d8" }}>{line ?? "—"}{ref.avg !== null && ref.avg < 6 ? " ⚠" : ""}</td>
    <td style={{ padding: 8, color: rec ? GOLD : "#71717a" }}>{rec ? modelName(rec) : t("eval.noneAcceptable")}</td>
         </tr>
       );
            })}
   </tbody>
        </table>
      </div>
      <p style={{ ...S.hint, fontFamily: mono, fontSize: 11 }}>{t("eval.refWarnHint")}</p>
    </div>
  );
}

// ─── 开始一轮 ───
function RunBar({ ev, t, selectedModels, comparePrompts, singlePrompt, onStartRun, folderName }) {
  const [setIds, setSetIds] = useState([]);
  const [useCompare, setUseCompare] = useState(true);
  const variants = useCompare
    ? comparePrompts.map((p, i) => ({ key: String.fromCharCode(97 + i), label: `PROMPT ${String.fromCharCode(65 + i)}`, prompt: p || "" })).filter((v) => v.prompt.trim())
    : singlePrompt.trim() ? [{ key: "single", label: "PROMPT", prompt: singlePrompt }] : [];
  const cases = ev.sets.filter((s) => setIds.includes(s.id)).flatMap((s) => s.cases.map((c) => ({ setId: s.id, caseId: c.id, image: c.image })));
  const genCount = cases.length * variants.length * selectedModels.length;
  return (
    <div style={{ ...card, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...S.label, marginBottom: 0 }}>{t("eval.startRun")}</span>
        {ev.sets.map((s) => (
          <button key={s.id} type="button" style={btn(setIds.includes(s.id))} onClick={() => setSetIds((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}>
     {s.name} · {s.cases.length}
   </button>
 ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontFamily: mono, fontSize: 11, color: "#a1a1aa" }}>
        <button type="button" style={btn(useCompare)} onClick={() => setUseCompare(true)}>{t("eval.useCompare", { count: comparePrompts.filter((p) => (p || "").trim()).length })}</button>
        <button type="button" style={btn(!useCompare)} onClick={() => setUseCompare(false)}>{t("eval.useSingle")}</button>
 <span>{t("eval.runModels", { models: selectedModels.map(modelName).join(", ") || "—" })}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: GOLD }}>{t("eval.runEstimate", { gen: genCount, judge: genCount })}</span>
        <button type="button" disabled={!genCount} onClick={() => onStartRun({ cases, variants })} style={{ ...S.genBtn, padding: "8px 18px", fontSize: 12, opacity: genCount ? 1 : 0.5 }}>{t("eval.enqueue")}</button>
      </div>
      <p style={{ ...S.hint, fontFamily: mono, fontSize: 11, margin: 0 }}>{t("eval.runHint", { folder: folderName })}</p>
    </div>
  );
}

export function EvalPage({ ev, folderName, onPickFolder, selectedModels, comparePrompts, singlePrompt, onStartRun, onOpenImage }) {
  const { t } = useI18n();
  const [view, setView] = useState("sets");
  useEffect(() => { if (ev.criteriaEditorSetId) setView("sets"); }, [ev.criteriaEditorSetId]);
  if (!ev.rootHandle) {
    return (
      <div style={{ ...card, display: "grid", gap: 10, justifyItems: "start" }}>
        <div style={{ fontFamily: mono, fontSize: 13, color: "#e4e4e7" }}>{t("eval.needFolder")}</div>
        <button type="button" style={btn(true)} onClick={onPickFolder}>{t("eval.pickFolder")}</button>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {[["sets", t("eval.viewSets")], ["board", t("eval.viewBoard")], ["ability", t("eval.viewAbility")]].map(([k, label]) => (
   <button key={k} type="button" style={btn(view === k)} onClick={() => setView(k)}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
 <span style={{ fontFamily: mono, fontSize: 11, color: "#71717a" }}>{t("eval.folder")}: {folderName}</span>
 <button type="button" style={btn()} onClick={ev.reload}>{ev.loading ? "…" : t("eval.reload")}</button>
      </div>
      {!!ev.message && <div style={{ fontFamily: mono, fontSize: 11, color: GOLD }}>{ev.message}</div>}
      {view === "sets" && (
        <>
   <SetsView ev={ev} t={t} />
          {ev.sets.length > 0 && <RunBar ev={ev} t={t} selectedModels={selectedModels} comparePrompts={comparePrompts} singlePrompt={singlePrompt} onStartRun={onStartRun} folderName={folderName} />}
 </>
      )}
      {view === "board" && <BoardView ev={ev} t={t} onOpenImage={onOpenImage} />}
      {view === "ability" && <AbilityView ev={ev} t={t} />}
    </div>
  );
}
