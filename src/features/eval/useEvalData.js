// 评测状态：从当前任务文件夹读评测集和分数，给卡片 / 详情 / Eval tab 提供同一份视图。
// 写入一律落到 eval/ 下；分数按「turn 目录名/文件名」存，不复制图片。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_JUDGE_MODEL,
  buildScoreKey,
  caseLabel,
  bumpCriteriaVersions,
  computeImageScore,
  normalizeEvalSet,
  resolveCaseCriteria,
  scoreTone,
  listScorableImages,
} from "../../services/evalCore";
import { loadEvalSets, loadScores, loadTagging, readSetImage, saveEvalSet, saveScores, saveTagging } from "../../services/evalStore";
import { judgeImage, tagImage } from "../../services/evalJudge";
import { buildTurnImageKey, ensureDirectoryPermission } from "../../services/appCore";

const JUDGE_CONCURRENCY = 3;

export function useEvalData({ rootHandle, turns, apiKeys, proxyUrl, t }) {
  const [sets, setSets] = useState([]);
  const [scores, setScores] = useState({});
  const [tagging, setTagging] = useState(null);
  const [judgeModel, setJudgeModel] = useState(DEFAULT_JUDGE_MODEL);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(null);
  const [criteriaEditorSetId, setCriteriaEditorSetId] = useState(null);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;
  const saveTimer = useRef(null);
  const abortRef = useRef(null);

  const reload = useCallback(async () => {
    if (!rootHandle) { setSets([]); setScores({}); setTagging(null); return; }
    setLoading(true);
    try {
      const [nextSets, nextScores, nextTagging] = await Promise.all([loadEvalSets(rootHandle), loadScores(rootHandle), loadTagging(rootHandle)]);
      setSets(nextSets);
      setScores(nextScores);
      setTagging(nextTagging);
    } finally {
      setLoading(false);
    }
  }, [rootHandle]);

  useEffect(() => { reload(); }, [reload]);

  // 分数改动后延迟写盘，连续点改分不会每下都写一次。
  const persistScores = useCallback((next) => {
    if (!rootHandle) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (!(await ensureDirectoryPermission(rootHandle, true))) { setMessage(t("eval.writeDenied")); return; }
        await saveScores(rootHandle, next);
      } catch (err) {
        setMessage(t("eval.saveFailed", { error: err?.message || "" }));
      }
    }, 400);
  }, [rootHandle, t]);

  const updateScores = useCallback((fn) => {
    setScores((prev) => {
      const next = fn(prev);
      persistScores(next);
      return next;
    });
  }, [persistScores]);

  const setById = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);

  // imageKey → { scoreKey, turn, img, set, evalCase }。只收录带 evalRef 且已落盘的 turn。
  const imageIndex = useMemo(() => {
    const map = new Map();
    for (const turn of turns || []) {
      const ref = turn?.evalRef;
      if (!ref) continue;
      const set = setById.get(ref.setId) || null;
      const evalCase = set?.cases.find((c) => c.id === ref.caseId) || null;
      for (const img of listScorableImages(turn)) {
        map.set(buildTurnImageKey(turn.id, img.modelId, img.promptKey, img.index), { ...img, turn, set, evalCase, ref });
      }
    }
    return map;
  }, [turns, setById]);

  const buildView = useCallback((entry) => {
    if (!entry) return null;
    const { set, evalCase, scoreKey } = entry;
    if (!set || !evalCase) {
      return { inSet: false, tone: "none", status: "noCriteria", total: null, label: "?", title: t("eval.notInSet"), rows: [], tags: [] };
    }
    const { active, inactive } = resolveCaseCriteria(set, evalCase);
    const stored = scores[scoreKey] || {};
    const items = stored.items || {};
    const result = computeImageScore(active, items, set.passScore);
    const gptOnly = computeImageScore(active, Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { gpt: v.gpt }])), set.passScore);
    const versions = set.criteriaVersions || {};
    const rows = active.map((c) => {
      const it = items[c.id] || {};
      const human = typeof it.human?.score === "number" ? it.human.score : null;
      const gpt = typeof it.gpt?.score === "number" ? it.gpt.score : null;
      const want = Number(versions[c.id]) || 1;
      const v = Number(it.v) || 1;
      return {
        id: c.id, desc: c.desc, weight: c.weight, key: c.key,
        score: human ?? gpt, human, gpt,
        reason: it.human?.note || it.gpt?.reason || "",
        stale: gpt !== null && v < want,
        staleHuman: human !== null && v < want,
      };
    });
    const statusText = {
      pass: t("eval.statusPass"),
      fail: t("eval.statusFail"),
      keyFail: t("eval.statusKeyFail", { items: result.keyFailed.map((id) => active.find((c) => c.id === id)?.desc || id).join("、") }),
      partial: t("eval.statusPartial", { count: result.missing.length }),
      unjudged: t("eval.statusUnjudged"),
      noCriteria: t("eval.statusNoCriteria"),
    }[result.status];
    const label = result.status === "unjudged" ? t("eval.badgeUnjudged") : result.status === "partial" ? t("eval.badgePartial") : "";
    return {
      inSet: true,
      scoreKey,
      setId: set.id,
      setName: set.name,
      caseId: evalCase.id,
      caseLabel: caseLabel(set, evalCase.id),
      tags: evalCase.tags,
      passScore: set.passScore,
      total: result.total,
      gptTotal: gptOnly.complete ? gptOnly.total : null,
      status: result.status,
      statusText,
      tone: scoreTone(result),
      label,
      judged: result.judged > 0,
      judgeModel: stored.judge || "",
      rows,
      inactiveCount: inactive.length,
      inactiveTitle: inactive.map((c) => c.desc || c.id).join("\n"),
      stale: rows.some((r) => r.stale),
      error: errors[scoreKey] || "",
      title: `${statusText}${result.total !== null ? ` · ${result.total}` : ""}`,
    };
  }, [scores, errors, t]);

  const viewForImageKey = useCallback((imageKey) => (imageKey ? buildView(imageIndex.get(imageKey)) : null), [imageIndex, buildView]);

  const setHumanScore = useCallback((imageKey, critId, level) => {
    const entry = imageIndex.get(imageKey);
    if (!entry?.set) return;
    const want = Number(entry.set.criteriaVersions?.[critId]) || 1;
    updateScores((prev) => {
      const cur = prev[entry.scoreKey] || { setId: entry.set.id, caseId: entry.evalCase?.id, modelId: entry.modelId, promptKey: entry.promptKey, prompt: entry.promptText, items: {} };
      const item = { ...(cur.items?.[critId] || {}) };
      if (level === null) delete item.human;
      else item.human = { score: level, at: new Date().toISOString() };
      // 人工分记下它是按哪个版本标准给的。
      if (level !== null) item.v = Math.max(Number(item.v) || 1, want);
      return { ...prev, [entry.scoreKey]: { ...cur, items: { ...cur.items, [critId]: item } } };
    });
  }, [imageIndex, updateScores]);

  // 判一张图。onlyIds 给了就只判这些条目（改写标准后的重判）；keepHuman 时人工分不动。
  const judgeEntry = useCallback(async (entry, { onlyIds = null, signal } = {}) => {
    const { set, evalCase, scoreKey } = entry;
    if (!set || !evalCase) return;
    const { active } = resolveCaseCriteria(set, evalCase);
    const targets = onlyIds ? active.filter((c) => onlyIds.includes(c.id)) : active;
    if (!targets.length) return;
    const referenceImage = await readSetImage(rootHandle, set.id, evalCase.image);
    if (!referenceImage) throw new Error(t("eval.refMissing", { file: evalCase.image }));
    const res = await judgeImage(proxyUrl, {
      model: judgeModel, activeCriteria: targets, promptText: entry.promptText,
      referenceImage, outputImage: entry.image, apiKeys, signal,
    });
    const versions = set.criteriaVersions || {};
    setErrors((prev) => { const n = { ...prev }; if (res.ok) delete n[scoreKey]; else n[scoreKey] = t("eval.judgeIncomplete", { items: res.missing.join(", ") }); return n; });
    updateScores((prev) => {
      const cur = prev[scoreKey] || { setId: set.id, caseId: evalCase.id, modelId: entry.modelId, promptKey: entry.promptKey, prompt: entry.promptText, items: {} };
      const items = { ...cur.items };
      for (const [id, val] of Object.entries(res.items)) {
        items[id] = { ...(items[id] || {}), gpt: val, v: Number(versions[id]) || 1 };
      }
      return { ...prev, [scoreKey]: { ...cur, judge: judgeModel, at: new Date().toISOString(), items } };
    });
  }, [rootHandle, proxyUrl, judgeModel, apiKeys, updateScores, t]);

  const judgeImageKey = useCallback(async (imageKey) => {
    const entry = imageIndex.get(imageKey);
    if (!entry) return;
    try { await judgeEntry(entry); } catch (err) {
      setErrors((prev) => ({ ...prev, [entry.scoreKey]: err?.message || t("eval.judgeFailed") }));
    }
  }, [imageIndex, judgeEntry, t]);

  // 批量判：targets = [{ entry, onlyIds }]
  const judgeMany = useCallback(async (targets) => {
    if (!targets.length) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let done = 0; let failed = 0;
    setProgress({ done, total: targets.length, failed });
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length && !controller.signal.aborted) {
        const target = targets[cursor]; cursor += 1;
        try { await judgeEntry(target.entry, { onlyIds: target.onlyIds, signal: controller.signal }); }
        catch (err) {
          if (err?.name === "AbortError") return;
          failed += 1;
          setErrors((prev) => ({ ...prev, [target.entry.scoreKey]: err?.message || t("eval.judgeFailed") }));
        }
        done += 1;
        setProgress({ done, total: targets.length, failed });
      }
    };
    await Promise.all(Array.from({ length: Math.min(JUDGE_CONCURRENCY, targets.length) }, worker));
    setProgress(null);
    setMessage(controller.signal.aborted ? t("eval.judgeStopped") : t("eval.judgeDone", { count: done - failed, failed }));
  }, [judgeEntry, t]);

  const stopJudging = useCallback(() => abortRef.current?.abort(), []);

  // 所有已登记的评测图，带上当前评分视图，供看板和重判对话框筛选。
  const allEntries = useMemo(() => [...imageIndex.entries()].map(([imageKey, entry]) => ({ imageKey, entry, view: buildView(entry) })), [imageIndex, buildView]);

  const saveSet = useCallback(async (nextSet) => {
    if (!rootHandle) return null;
    if (!(await ensureDirectoryPermission(rootHandle, true))) { setMessage(t("eval.writeDenied")); return null; }
    const prev = setById.get(nextSet.id) || normalizeEvalSet({ id: nextSet.id });
    const { set, diff } = bumpCriteriaVersions(prev, nextSet);
    const merged = { ...set, cases: normalizeEvalSet(nextSet).cases, id: nextSet.id, name: nextSet.name };
    await saveEvalSet(rootHandle, merged);
    setSets((cur) => {
      const others = cur.filter((s) => s.id !== merged.id);
      return [...others, { ...merged, hasFile: true }].sort((a, b) => a.id.localeCompare(b.id));
    });
    return diff;
  }, [rootHandle, setById, t]);

  const tagCases = useCallback(async (setId, caseIds) => {
    const set = setById.get(setId);
    if (!set || !tagging?.dimensions?.length) return;
    const next = { ...set, cases: [...set.cases] };
    let done = 0;
    setProgress({ done, total: caseIds.length, failed: 0 });
    for (const caseId of caseIds) {
      const idx = next.cases.findIndex((c) => c.id === caseId);
      const c = next.cases[idx];
      if (!c || c.tagsLocked) { done += 1; continue; }
      try {
        const ref = await readSetImage(rootHandle, setId, c.image);
        const res = await tagImage(proxyUrl, { tagging, referenceImage: ref, apiKeys });
        next.cases[idx] = { ...c, tags: res.tags, unsure: res.unsure };
      } catch (err) {
        setMessage(t("eval.tagFailed", { error: err?.message || "" }));
      }
      done += 1;
      setProgress({ done, total: caseIds.length, failed: 0 });
    }
    setProgress(null);
    await saveSet(next);
  }, [setById, tagging, rootHandle, proxyUrl, apiKeys, saveSet, t]);

  const saveTaggingConfig = useCallback(async (next) => {
    if (!rootHandle) return;
    if (!(await ensureDirectoryPermission(rootHandle, true))) { setMessage(t("eval.writeDenied")); return; }
    await saveTagging(rootHandle, next);
    setTagging(next);
  }, [rootHandle, t]);

  return {
    sets, scores, tagging, judgeModel, setJudgeModel, loading, message, setMessage, progress,
    reload, viewForImageKey, setHumanScore, judgeImageKey, judgeMany, stopJudging, allEntries,
    saveSet, tagCases, saveTaggingConfig, criteriaEditorSetId, setCriteriaEditorSetId,
    openCriteriaEditor: (setId) => setCriteriaEditorSetId(setId),
    readSetImage: (setId, file) => readSetImage(rootHandle, setId, file),
    rootHandle, buildScoreKey,
  };
}
