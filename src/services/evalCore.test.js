import { describe, expect, it } from "vitest";
import {
  acceptanceLine,
  buildEvalRunTurns,
  bumpCriteriaVersions,
  buildJudgeMessages,
  computeImageScore,
  diffCriteria,
  effectiveItemScore,
  listScorableImages,
  normalizeEvalSet,
  parseJudgeOutput,
  parseTaggingOutput,
  pickRecommended,
  resolveCaseCriteria,
  staleItemIds,
  summarize,
} from "./evalCore";

// 拆头评测集：方案里「条件标准」一节的例子，数字要和 docs/eval-plan.html 对得上。
const headSet = normalizeEvalSet({
  name: "拆头 · 发型",
  criteria: [
    { id: "angle", desc: "头部角度、姿势与原图一致", weight: 3, key: true },
    { id: "complete", desc: "头顶到颈部完整清晰", weight: 2 },
    { id: "bg", desc: "纯灰平底，颈部平滑裁切", weight: 1 },
    { id: "longHair", desc: "长发完整，不被截断", weight: 2, when: "长发", key: true },
    { id: "noHair", desc: "不补出头发", weight: 2, when: "光头", key: true },
    { id: "monster", desc: "怪物特征原样保留", weight: 3, when: "非人类" },
  ],
  cases: [
    { id: "c01", tags: ["长发"] },
    { id: "c04", tags: ["光头", "非人类"] },
  ],
});
const gpt = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { gpt: { score: v } }]));

describe("conditional criteria", () => {
  it("drops criteria whose tag the case lacks, and keeps them out of the denominator", () => {
    const { active, inactive } = resolveCaseCriteria(headSet, headSet.cases[0]);
    expect(active.map((c) => c.id)).toEqual(["angle", "complete", "bg", "longHair"]);
    expect(inactive.map((c) => c.id)).toEqual(["noHair", "monster"]);
    const r = computeImageScore(active, gpt({ angle: 3, complete: 3, bg: 2, longHair: 1 }));
    // 19 / 24 × 10
    expect(r.got).toBe(19);
    expect(r.max).toBe(24);
    expect(r.total).toBe(7.9);
  });

  it("scores a multi-tag case against every criterion any of its tags unlocks", () => {
    const { active } = resolveCaseCriteria(headSet, headSet.cases[1]);
    expect(active.map((c) => c.id)).toEqual(["angle", "complete", "bg", "noHair", "monster"]);
    const r = computeImageScore(active, gpt({ angle: 2, complete: 3, bg: 3, noHair: 0, monster: 3 }));
    // 24 / 33 × 10
    expect(r.total).toBe(7.3);
  });

  it("fails an image outright when a key criterion scores 0 or 1, even above the pass mark", () => {
    const { active } = resolveCaseCriteria(headSet, headSet.cases[0]);
    const r = computeImageScore(active, gpt({ angle: 3, complete: 3, bg: 2, longHair: 1 }));
    expect(r.total).toBeGreaterThan(6);
    expect(r.status).toBe("keyFail");
    expect(r.keyFailed).toEqual(["longHair"]);
    expect(r.passed).toBe(false);
  });

  it("honours per-case skip and extra criteria", () => {
    const set = normalizeEvalSet({ criteria: [{ id: "a", desc: "A", weight: 1 }, { id: "b", desc: "B", weight: 1 }] });
    const { active } = resolveCaseCriteria(set, { id: "x", skip: ["b"], extra: [{ id: "seam", desc: "S", weight: 1 }] });
    expect(active.map((c) => c.id)).toEqual(["a", "seam"]);
  });
});

describe("human overrides", () => {
  it("prefers the human score over GPT, matching the 7.9 → 7.1 example", () => {
    const set = normalizeEvalSet({
      criteria: [
        { id: "thickness", desc: "", weight: 3 },
        { id: "material", desc: "", weight: 2 },
        { id: "shape", desc: "", weight: 2 },
        { id: "seam", desc: "", weight: 1 },
      ],
    });
    const items = gpt({ thickness: 3, material: 2, shape: 3, seam: 0 });
    expect(computeImageScore(set.criteria, items).total).toBe(7.9);
    items.shape.human = { score: 2 };
    expect(effectiveItemScore(items.shape)).toBe(2);
    expect(computeImageScore(set.criteria, items).total).toBe(7.1);
  });

  it("reports an image as partial until every active criterion has a score", () => {
    const set = normalizeEvalSet({ criteria: [{ id: "a", weight: 1 }, { id: "b", weight: 1 }] });
    const r = computeImageScore(set.criteria, gpt({ a: 3 }));
    expect(r.status).toBe("partial");
    expect(r.missing).toEqual(["b"]);
  });
});

describe("judge output", () => {
  const crit = [{ id: "a", desc: "A", weight: 1 }, { id: "b", desc: "B", weight: 1 }];

  it("keeps only requested ids and clamps scores to 0..3", () => {
    const out = parseJudgeOutput({ items: [{ id: "a", score: 7, reason: "x" }, { id: "zzz", score: 2 }, { id: "b", score: -1 }] }, crit);
    expect(out.items).toEqual({ a: { score: 3, reason: "x" }, b: { score: 0, reason: "" } });
    expect(out.ok).toBe(true);
  });

  it("flags missing criteria instead of inventing a score", () => {
    const out = parseJudgeOutput({ items: [{ id: "a", score: 2 }] }, crit);
    expect(out.ok).toBe(false);
    expect(out.missing).toEqual(["b"]);
  });

  it("sends the reference image before the output image, both as image parts", () => {
    const msgs = buildJudgeMessages(crit, { referenceImage: "data:ref", outputImage: "data:out" });
    const parts = msgs[1].content.filter((p) => p.type === "image_url").map((p) => p.image_url.url);
    expect(parts).toEqual(["data:ref", "data:out"]);
  });
});

describe("criteria changes", () => {
  it("only rewording or adding needs a GPT call; reweighting just recomputes", () => {
    const prev = [{ id: "a", desc: "A", weight: 1, when: [] }, { id: "b", desc: "B", weight: 1, when: [] }, { id: "c", desc: "C", weight: 1, when: [] }];
    const next = [{ id: "a", desc: "A2", weight: 1, when: [] }, { id: "b", desc: "B", weight: 3, when: [] }, { id: "d", desc: "D", weight: 1, when: [] }];
    const d = diffCriteria(prev, next);
    expect(d.needsJudge).toEqual(["a", "d"]);
    expect(d.reweighted).toEqual(["b"]);
    expect(d.removed).toEqual(["c"]);
  });

  it("treats an old GPT score as stale but never a human score", () => {
    const crit = [{ id: "a" }, { id: "b" }];
    const items = { a: { v: 1, gpt: { score: 2 } }, b: { v: 1, human: { score: 1 } } };
    expect(staleItemIds(crit, items, { a: 2, b: 2 })).toEqual(["a"]);
  });
});

describe("tagging", () => {
  const tagging = {
    dimensions: [
      { id: "hair", values: ["长发", "短发", "光头"] },
      { id: "extra", multi: true, values: ["帽子", "角"] },
    ],
  };
  it("keeps only allowed values and flags low confidence", () => {
    const r = parseTaggingOutput({ tags: { hair: "长发", extra: ["角", "翅膀"] }, confidence: { hair: 0.95, extra: 0.5 } }, tagging);
    expect(r.tags).toEqual(["长发", "角"]);
    expect(r.unsure).toEqual(["extra"]);
  });
});

describe("summaries", () => {
  it("leaves unjudged images out of the average", () => {
    const s = summarize([{ total: 8, status: "pass" }, { total: 4, status: "fail" }, { total: null, status: "unjudged" }]);
    expect(s).toMatchObject({ count: 2, pending: 1, avg: 6, low: 1 });
  });

  it("uses 70% of the reference average as the acceptance line", () => {
    expect(acceptanceLine(8.8)).toBe(6.2);
    const cells = [{ modelId: "wan", avg: 6.1, count: 10 }, { modelId: "wanpro", avg: 8.3, count: 10 }, { modelId: "seed", avg: 9, count: 3 }];
    expect(pickRecommended(cells, 6.2)).toBe("wanpro");
  });
});

describe("starting a round", () => {
  it("builds one queued turn per case, each crossing every prompt with every model", () => {
    const turns = buildEvalRunTurns({
      cases: [{ setId: "set-01", caseId: "c01", referenceImage: "data:a" }, { setId: "set-01", caseId: "c02", referenceImage: "data:b" }],
      promptVariants: [{ key: "a", label: "PROMPT A", prompt: "p1" }, { key: "b", label: "PROMPT B", prompt: "p2" }, { key: "c", label: "PROMPT C", prompt: "  " }],
      modelIds: ["m1", "m2"],
      startSeq: 5,
      now: 1000,
      runId: "r1",
    });
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ seq: 5, mode: "compare", status: "queued", referenceImage: "data:a", evalRef: { runId: "r1", setId: "set-01", caseId: "c01" } });
    // 空提示词位不跑：2 个有效提示词 × 2 个模型
    expect(turns[0].results.map((r) => `${r.promptKey}:${r.modelId}`)).toEqual(["a:m1", "a:m2", "b:m1", "b:m2"]);
    expect(turns[1].seq).toBe(6);
  });

  it("lists only saved, successful images, keyed by turn dir and file name", () => {
    const turn = {
      id: 1, dirName: "turn-0005-1",
      resultFiles: [["a_x_1.png"], [], ["b_y_1.txt"]],
      results: [
        { status: "success", modelId: "m1", promptKey: "a", images: ["data:1"] },
        { status: "error", modelId: "m2", promptKey: "a", images: [] },
        { status: "success", modelId: "m1", promptKey: "b", images: ["https://remote"] },
      ],
    };
    expect(listScorableImages(turn).map((i) => i.scoreKey)).toEqual(["turn-0005-1/a_x_1.png"]);
    expect(listScorableImages({ ...turn, dirName: undefined })).toEqual([]);
  });
});

describe("saving criteria", () => {
  it("bumps only reworded or added criteria, so old GPT scores on them go stale", () => {
    const prev = { criteria: [{ id: "a", desc: "A" }, { id: "b", desc: "B", weight: 1 }], criteriaVersions: { a: 1 } };
    const next = { criteria: [{ id: "a", desc: "A, reworded" }, { id: "b", desc: "B", weight: 3 }, { id: "c", desc: "C" }] };
    const { set, diff } = bumpCriteriaVersions(prev, next);
    expect(set.criteriaVersions).toEqual({ a: 2, c: 2 });
    expect(set.version).toBe(2);
    expect(diff.reweighted).toEqual(["b"]);
  });
});

import { caseLabel, promptHeadline } from "./evalCore";
describe("caseLabel / promptHeadline", () => {
  it("numbers cases by set and order", () => {
    const set = { id: "set-01", cases: [{ id: "a" }, { id: "b" }] };
    expect(caseLabel(set, "b")).toBe("set1-2");
    expect(caseLabel({ id: "set-12", cases: [{ id: "x" }] }, "x")).toBe("set12-1");
    expect(caseLabel(set, "zz")).toBe("set1-?");
  });
  it("takes the first sentence and truncates", () => {
    expect(promptHeadline("把人物拆成部件。保持姿势")).toBe("把人物拆成部件");
    expect(promptHeadline("a".repeat(50), 10)).toBe("aaaaaaaaaa…");
  });
});
