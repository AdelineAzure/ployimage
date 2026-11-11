// ─── 评测打分（Eval）纯逻辑 ───
// 方案见 docs/eval-plan.html。这里只放不依赖 React / DOM 的计算，方便单测：
// 标准归一化、哪些条目对一张图生效、加权总分、关键项、裁判提示词与解析。
// 文件读写在 evalStore.js，界面在 features/eval/。

export const SCORE_LEVELS = [0, 1, 2, 3];
export const MAX_LEVEL = 3;
export const DEFAULT_PASS_SCORE = 6;
// 参照模型平均分 × 这个比例 = 其它模型的可接受线（模型能力版面用）。
export const REFERENCE_ACCEPT_RATIO = 0.7;
// 模型能力每格至少这么多张图才参与比较。
export const MIN_CELL_SAMPLES = 10;
// 关键项得分 ≤ 这个值，整张图不及格。
// 关键项只有 0 分才算不可用：1 分 = 勉强可用，不直接判死。
export const KEY_FAIL_MAX = 0;
export const MAX_EVAL_SETS = 10;
export const MAX_CASES_PER_SET = 10;
export const DEFAULT_JUDGE_MODEL = "gpt-5.6-sol";
export const ALT_JUDGE_MODEL = "gpt-6.1-terra";
export const JUDGE_MODELS = [DEFAULT_JUDGE_MODEL, ALT_JUDGE_MODEL];
export const EVAL_DIR = "eval";
export const EVAL_SETS_DIR = "sets";
export const EVAL_SCORES_FILE = "scores.json";
export const EVAL_TAGGING_FILE = "tagging.json";

const clampLevel = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_LEVEL, Math.max(0, n));
};

const safeId = (value, fallback) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
};

export function normalizeCriterion(raw, index = 0) {
  const src = raw && typeof raw === "object" ? raw : {};
  const weight = Number(src.weight);
  const when = Array.isArray(src.when)
    ? src.when.map((t) => String(t).trim()).filter(Boolean)
    : typeof src.when === "string" && src.when.trim()
    ? [src.when.trim()]
    : [];
  return {
    id: safeId(src.id, `c${index + 1}`),
    desc: typeof src.desc === "string" ? src.desc : "",
    weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
    // when：用例带其中任一标签时才生效；空 = 对所有图生效。
    when,
    key: src.key === true,
    // levels：每一档长什么样，{ "0": "…", "1": "…", "2": "…", "3": "…" }；没写的档用通用含义。
    levels: normalizeLevels(src.levels),
  };
}

function normalizeLevels(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const k of ["0", "1", "2", "3"]) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function normalizeCase(raw, index = 0) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    id: safeId(src.id, `case-${index + 1}`),
    image: typeof src.image === "string" ? src.image : "",
    tags: Array.isArray(src.tags) ? Array.from(new Set(src.tags.map((t) => String(t).trim()).filter(Boolean))) : [],
    extra: Array.isArray(src.extra) ? src.extra.map((c, i) => normalizeCriterion(c, i)) : [],
    skip: Array.isArray(src.skip) ? src.skip.map((s) => String(s)) : [],
    note: typeof src.note === "string" ? src.note : "",
    // 你手改过标签就锁住，重新 GPT 打标不覆盖。
    tagsLocked: src.tagsLocked === true,
    // GPT 打标置信度低的维度，等你确认。
    unsure: Array.isArray(src.unsure) ? src.unsure.map((x) => String(x)) : [],
  };
}

export function normalizeEvalSet(raw, fallbackId = "set-01") {
  const src = raw && typeof raw === "object" ? raw : {};
  const pass = Number(src.passScore);
  const version = Number(src.version);
  return {
    id: safeId(src.id, fallbackId),
    name: typeof src.name === "string" ? src.name : fallbackId,
    passScore: Number.isFinite(pass) ? pass : DEFAULT_PASS_SCORE,
    version: Number.isFinite(version) && version > 0 ? Math.floor(version) : 1,
    criteria: (Array.isArray(src.criteria) ? src.criteria : []).map((c, i) => normalizeCriterion(c, i)),
    // 每条标准各自的版本号：描述改写或新增时 +1，GPT 分数按旧版本判的就算过期。
    criteriaVersions: src.criteriaVersions && typeof src.criteriaVersions === "object" ? { ...src.criteriaVersions } : {},
    cases: (Array.isArray(src.cases) ? src.cases : []).slice(0, MAX_CASES_PER_SET).map((c, i) => normalizeCase(c, i)),
  };
}

// 一张图生效的标准：共用标准 + 本图额外项 − 跳过项 − 条件不满足的。
// 返回 { active, inactive }，inactive 用来在评分面板里显示「N 条不适用」。
export function resolveCaseCriteria(evalSet, evalCase) {
  const set = normalizeEvalSet(evalSet);
  const c = normalizeCase(evalCase);
  const skip = new Set(c.skip);
  const tags = new Set(c.tags);
  const all = [...set.criteria, ...c.extra];
  const active = [];
  const inactive = [];
  const seen = new Set();
  for (const crit of all) {
    if (seen.has(crit.id)) continue;
    seen.add(crit.id);
    if (skip.has(crit.id)) { inactive.push({ ...crit, reason: "skip" }); continue; }
    if (crit.when.length && !crit.when.some((t) => tags.has(t))) { inactive.push({ ...crit, reason: "when" }); continue; }
    active.push(crit);
  }
  return { active, inactive };
}

// 人工分优先于 GPT 分。返回这一条最终用的分数（null = 还没判）。
export function effectiveItemScore(item) {
  if (!item || typeof item !== "object") return null;
  const human = clampLevel(item?.human?.score);
  if (human !== null && item?.human?.score !== undefined && item?.human?.score !== null) return human;
  const gpt = item?.gpt?.score;
  if (gpt === undefined || gpt === null) return null;
  return clampLevel(gpt);
}

// 加权总分（10 分制）。不适用的条目已经被 resolveCaseCriteria 剔掉，不进分母，
// 所以剩下条目的权重按比例放大。
// items: { [criterionId]: { gpt?: {score}, human?: {score}, v? } }
export function computeImageScore(activeCriteria, items = {}, passScore = DEFAULT_PASS_SCORE) {
  const criteria = Array.isArray(activeCriteria) ? activeCriteria : [];
  let got = 0;
  let max = 0;
  let judged = 0;
  const keyFailed = [];
  const missing = [];
  for (const crit of criteria) {
    const score = effectiveItemScore(items?.[crit.id]);
    if (score === null) { missing.push(crit.id); continue; }
    judged += 1;
    got += score * crit.weight;
    max += MAX_LEVEL * crit.weight;
    if (crit.key && score <= KEY_FAIL_MAX) keyFailed.push(crit.id);
  }
  const complete = criteria.length > 0 && missing.length === 0;
  const total = max > 0 ? Math.round((got / max) * 100) / 10 : null;
  let status;
  if (!criteria.length) status = "noCriteria";
  else if (judged === 0) status = "unjudged";
  else if (!complete) status = "partial";
  else if (keyFailed.length) status = "keyFail";
  else status = total >= passScore ? "pass" : "fail";
  return { total, got, max, judged, missing, keyFailed, complete, status, passed: status === "pass" };
}

export function scoreTone(result) {
  if (!result) return "none";
  if (result.status === "pass") return result.total >= 7.5 ? "good" : "ok";
  if (result.status === "fail" || result.status === "keyFail") return "bad";
  if (result.status === "partial" || result.status === "unjudged") return "pending";
  return "none";
}

// 一张生成图在分数文件里的唯一键。turn 目录名 + 文件名足以唯一定位，
// 删掉 turn 文件夹后分数还在，只是找不到图。
export function buildScoreKey(turnDirName, fileName) {
  return `${turnDirName}/${fileName}`;
}

// 标准改写后，哪些条目要重判：desc 变了或新增的条目。只改权重、删条目、改及格线都不用。
export function diffCriteria(prevCriteria = [], nextCriteria = []) {
  const prev = new Map(prevCriteria.map((c) => [c.id, c]));
  const changed = [];
  const reweighted = [];
  const added = [];
  for (const c of nextCriteria) {
    const old = prev.get(c.id);
    if (!old) { added.push(c.id); continue; }
    if ((old.desc || "") !== (c.desc || "") || JSON.stringify(old.when || []) !== JSON.stringify(c.when || []) || JSON.stringify(old.levels || {}) !== JSON.stringify(c.levels || {})) changed.push(c.id);
    else if (old.weight !== c.weight || old.key !== c.key) reweighted.push(c.id);
  }
  const nextIds = new Set(nextCriteria.map((c) => c.id));
  const removed = prevCriteria.filter((c) => !nextIds.has(c.id)).map((c) => c.id);
  return { changed, added, reweighted, removed, needsJudge: [...changed, ...added] };
}

// 对一张图：哪些生效条目的 GPT 分是按旧版本标准判的（需要重判）。
// 人工分不算过期 —— 用户的判断按决定保留。
export function staleItemIds(activeCriteria, items = {}, criteriaVersions = {}) {
  const out = [];
  for (const crit of activeCriteria) {
    const item = items?.[crit.id];
    if (!item?.gpt) continue;
    const want = criteriaVersions?.[crit.id];
    if (want !== undefined && Number(item.v || 0) < Number(want)) out.push(crit.id);
  }
  return out;
}

// ─── 裁判 ───

export function buildJudgeMessages(activeCriteria, { promptText = "", referenceImage = "", outputImage = "" } = {}) {
  const lines = activeCriteria.map((c) => {
    const lv = ["0", "1", "2", "3"].filter((k) => c.levels?.[k]).map((k) => `    ${k} 分：${c.levels[k]}`);
    return [`- ${c.id}: ${c.desc}`, ...lv].join("\n");
  }).join("\n");
  const system = [
    "你是生图结果的评分员。用户给你一张参考图（输入图）和一张生成图，以及一组评分标准。",
    "逐条判断生成图是否满足标准。每条只给 0、1、2、3 四档之一：",
    "通用含义：0 = 不可用或缺失；1 = 勉强可用；2 = 有小偏差但能用；3 = 几乎看不出差别（少给）。",
    "某条标准写了各档说明时，以该条的说明为准。",
    "先写理由再给分，理由要具体指出图中哪里做到或没做到，一句话即可。",
    "需要和输入图比较的标准（如保持原图角度、材质、比例），必须对照参考图判断。",
    "只输出 JSON，不要任何其它文字：{\"items\":[{\"id\":\"…\",\"reason\":\"…\",\"score\":0}]}，",
    "items 必须覆盖下面列出的每一个 id，不要增加别的 id。",
  ].join("\n");
  const text = [
    promptText ? `生成时使用的提示词：\n${promptText}\n` : "",
    `评分标准（id: 描述，以及各档说明）：\n${lines}`,
    "",
    "第一张图是参考图（输入），第二张图是生成图（输出）。",
  ].join("\n");
  const content = [{ type: "text", text }];
  if (referenceImage) content.push({ type: "image_url", image_url: { url: referenceImage } });
  if (outputImage) content.push({ type: "image_url", image_url: { url: outputImage } });
  return [
    { role: "system", content: system },
    { role: "user", content },
  ];
}

// 解析裁判输出。只接受请求里的 id，分数夹到 0–3；缺项和非法项单独返回。
export function parseJudgeOutput(parsed, activeCriteria) {
  const wanted = new Set(activeCriteria.map((c) => c.id));
  const list = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
  const items = {};
  for (const entry of list) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    if (!wanted.has(id) || items[id]) continue;
    const score = clampLevel(entry?.score);
    if (score === null) continue;
    items[id] = { score, reason: typeof entry?.reason === "string" ? entry.reason.trim() : "" };
  }
  const missing = [...wanted].filter((id) => !items[id]);
  return { items, missing, ok: missing.length === 0 };
}

// ─── 打标 ───

export function normalizeTagging(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const version = Number(src.version);
  return {
    version: Number.isFinite(version) && version > 0 ? Math.floor(version) : 1,
    model: typeof src.model === "string" && src.model ? src.model : DEFAULT_JUDGE_MODEL,
    dimensions: (Array.isArray(src.dimensions) ? src.dimensions : [])
      .map((d, i) => ({
        id: safeId(d?.id, `dim${i + 1}`),
        label: typeof d?.label === "string" ? d.label : safeId(d?.id, `dim${i + 1}`),
        values: Array.isArray(d?.values) ? d.values.map((v) => String(v).trim()).filter(Boolean) : [],
        multi: d?.multi === true,
      }))
      .filter((d) => d.values.length),
  };
}

export function buildTaggingMessages(tagging, referenceImage) {
  const t = normalizeTagging(tagging);
  const dims = t.dimensions
    .map((d) => `- ${d.id}（${d.label}，${d.multi ? "可多选" : "只选一个"}）：${d.values.join(" / ")}`)
    .join("\n");
  const system = [
    "你给参考图打标签，供后续按标签筛选评分标准。",
    "每个维度只能从给定选项里选，不要自己造词。看不清或不适用时，单选维度填 null，多选维度填 []。",
    "每个维度给一个 0 到 1 的置信度。",
    "只输出 JSON：{\"tags\":{\"维度id\":\"选项\" 或 [\"选项\"]},\"confidence\":{\"维度id\":0.9}}",
  ].join("\n");
  const content = [{ type: "text", text: `维度：\n${dims}` }];
  if (referenceImage) content.push({ type: "image_url", image_url: { url: referenceImage } });
  return [{ role: "system", content: system }, { role: "user", content }];
}

// 把打标结果展平成用例的 tags 数组，并标出低置信度维度。
export function parseTaggingOutput(parsed, tagging, lowConfidence = 0.8) {
  const t = normalizeTagging(tagging);
  const tags = [];
  const unsure = [];
  const raw = parsed?.tags && typeof parsed.tags === "object" ? parsed.tags : {};
  const conf = parsed?.confidence && typeof parsed.confidence === "object" ? parsed.confidence : {};
  for (const d of t.dimensions) {
    const allowed = new Set(d.values);
    const value = raw[d.id];
    const picked = (Array.isArray(value) ? value : value === null || value === undefined ? [] : [value])
      .map((v) => String(v).trim())
      .filter((v) => allowed.has(v));
    const kept = d.multi ? picked : picked.slice(0, 1);
    tags.push(...kept);
    const c = Number(conf[d.id]);
    if (!Number.isFinite(c) || c < lowConfidence) unsure.push(d.id);
  }
  return { tags: Array.from(new Set(tags)), unsure };
}

// ─── 汇总 ───

// rows: [{ modelId, total, status, setId, tags }]。只统计已判完的图（partial / unjudged 不进平均），
// 生成失败的图根本没有分数行，自然不计入。
export function summarize(rows = []) {
  const done = rows.filter((r) => r && typeof r.total === "number" && r.status !== "partial" && r.status !== "unjudged");
  const sum = done.reduce((a, r) => a + r.total, 0);
  return {
    count: done.length,
    pending: rows.length - done.length,
    avg: done.length ? Math.round((sum / done.length) * 10) / 10 : null,
    low: done.filter((r) => r.status === "fail" || r.status === "keyFail").length,
    keyFail: done.filter((r) => r.status === "keyFail").length,
  };
}

// 模型能力版面：参照模型平均分 × 70% 是可接受线；样本不够的格子不参与。
export function acceptanceLine(referenceAvg) {
  if (typeof referenceAvg !== "number") return null;
  return Math.round(referenceAvg * REFERENCE_ACCEPT_RATIO * 10) / 10;
}

export function pickRecommended(cells = [], line, minSamples = MIN_CELL_SAMPLES) {
  const ok = cells.filter((c) => c && typeof c.avg === "number" && c.count >= minSamples && (line === null || c.avg >= line));
  if (!ok.length) return null;
  return ok.reduce((best, c) => (c.avg > best.avg ? c : best)).modelId;
}

// 新提示词判定：内容变了就是新提示词（新看板），除非用户确认只是改错字。
export function promptFingerprint(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// ─── 开始一轮 ───
// 把「评测集用例 × 提示词 × 模型」展开成和 handleGenerate 一样形状的排队 turn：
// 每张评测集参考图一个 turn，turn 里每个提示词位 × 每个模型一条结果。
// evalRef 写进 turn 和 prompt.json，打分时靠它找回对应的用例和标准。
export function buildEvalRunTurns({
  cases = [],
  promptVariants = [],
  modelIds = [],
  modelCounts = {},
  baseTurn = {},
  startSeq = 1,
  now = Date.now(),
  modelName = (id) => id,
  runId = `run-${now}`,
}) {
  const variants = promptVariants.filter((v) => v && typeof v.prompt === "string" && v.prompt.trim());
  if (!variants.length || !modelIds.length) return [];
  const mode = variants.length > 1 ? "compare" : "single";
  return cases.map((c, index) => ({
    ...baseTurn,
    id: now + index * 1000 + Math.floor(Math.random() * 1000),
    seq: startSeq + index,
    createdAt: now + index,
    mode,
    prompt: mode === "single" ? variants[0].prompt : "",
    styleBasePrompt: "",
    styleThemes: [],
    promptVariants: variants,
    referenceImage: c.referenceImage,
    styleReferenceImages: [],
    selectedModelIds: [...modelIds],
    modelCounts: Object.fromEntries(modelIds.map((m) => [m, Math.max(1, Math.min(8, Number(modelCounts[m]) || 1))])),
    status: "queued",
    evalRef: { runId, setId: c.setId, caseId: c.caseId },
    results: variants.flatMap((v) =>
      modelIds.map((mid) => ({
        modelId: mid,
        modelName: modelName(mid),
        promptKey: v.key,
        promptLabel: v.label,
        promptText: v.prompt,
        requestedCount: Math.max(1, Math.min(8, Number(modelCounts[mid]) || 1)),
        status: "loading",
        images: [],
        error: null,
      }))
    ),
  }));
}

// 一个 turn 里所有可打分的图：[{ scoreKey, modelId, promptKey, promptText, fileName, image }]。
// 只有落盘后（有 dirName + resultFiles）才能打分，否则没法稳定定位图片。
export function listScorableImages(turn) {
  if (!turn?.dirName || !Array.isArray(turn?.resultFiles)) return [];
  const out = [];
  (turn.results || []).forEach((r, ri) => {
    if (r?.status !== "success") return;
    const files = turn.resultFiles[ri] || [];
    (r.images || []).forEach((img, ii) => {
      const fileName = files[ii];
      if (!fileName || /\.txt$/i.test(fileName)) return;
      out.push({
        scoreKey: buildScoreKey(turn.dirName, fileName),
        modelId: r.modelId,
        modelName: r.modelName,
        promptKey: r.promptKey || "single",
        promptLabel: r.promptLabel || "",
        promptText: r.promptText || "",
        fileName,
        image: img,
        turnId: turn.id,
        index: ii + 1,
      });
    });
  });
  return out;
}

// 保存评测集时：改写 / 新增的条目版本号 +1，整组版本号 +1（有任何改动时）。
export function bumpCriteriaVersions(prevSet, nextSet) {
  const prev = normalizeEvalSet(prevSet);
  const next = normalizeEvalSet(nextSet);
  const diff = diffCriteria(prev.criteria, next.criteria);
  const versions = { ...prev.criteriaVersions };
  for (const id of diff.needsJudge) versions[id] = (Number(versions[id]) || 1) + 1;
  const changed = diff.needsJudge.length + diff.reweighted.length + diff.removed.length > 0 || prev.passScore !== next.passScore;
  return { set: { ...next, criteriaVersions: versions, version: changed ? prev.version + 1 : prev.version }, diff };
}

// 沟通用编号：set-01 的第 1 张 → "set1-1"。按评测集里用例的顺序编号，不显示文件名。
export function caseLabel(set, caseId) {
  if (!set) return caseId || "";
  const m = String(set.id || "").match(/(\d+)\s*$/);
  const setNo = m ? String(Number(m[1])) : String(set.id || "");
  const idx = (set.cases || []).findIndex((c) => c.id === caseId);
  return idx < 0 ? `set${setNo}-?` : `set${setNo}-${idx + 1}`;
}

// 提示词首句（看板列表里展示）：取到第一个句号/换行为止，再截断。
export function promptHeadline(text = "", max = 40) {
  const s = String(text || "").trim();
  const first = s.split(/[\n。！？!?]|\.\s/)[0].trim() || s;
  return first.length > max ? `${first.slice(0, max)}…` : first;
}
