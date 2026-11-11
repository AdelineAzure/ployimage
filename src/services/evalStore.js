// ─── 评测数据读写（任务文件夹 / eval/）───
// 目录：
//   eval/sets/set-01/set.json   标准 + 用例（含标签）
//   eval/sets/set-01/c01.jpg    评测集参考图
//   eval/scores.json            所有分数；键是「turn 目录名/图片文件名」，不复制图片
//   eval/tagging.json           打标提示词
// 分数文件只记引用：turn 文件夹被删时分数和提示词还在，只是图找不到。
import { fileToDataUrlFromFile, writeTextFile } from "./appCore";
import {
  EVAL_DIR,
  EVAL_SCORES_FILE,
  EVAL_SETS_DIR,
  EVAL_TAGGING_FILE,
  MAX_EVAL_SETS,
  normalizeEvalSet,
  normalizeTagging,
} from "./evalCore";

async function getDir(root, name, create) {
  try {
    return await root.getDirectoryHandle(name, { create });
  } catch {
    return null;
  }
}

async function readJson(dir, name) {
  try {
    const fh = await dir.getFileHandle(name);
    const f = await fh.getFile();
    return JSON.parse(await f.text());
  } catch {
    return null;
  }
}

export async function getEvalDir(rootHandle, create = false) {
  if (!rootHandle) return null;
  return getDir(rootHandle, EVAL_DIR, create);
}

// 读所有评测集（不读图片本身，图片按需用 readSetImage 读）。
export async function loadEvalSets(rootHandle) {
  const evalDir = await getEvalDir(rootHandle, false);
  if (!evalDir) return [];
  const setsDir = await getDir(evalDir, EVAL_SETS_DIR, false);
  if (!setsDir) return [];
  const sets = [];
  for await (const [name, handle] of setsDir.entries()) {
    if (handle.kind !== "directory") continue;
    const raw = await readJson(handle, "set.json");
    // 没写 set.json 的文件夹也认：用文件夹里的图片当用例，标准留空等你填。
    const images = [];
    for await (const [fn, fh] of handle.entries()) {
      if (fh.kind === "file" && /\.(png|jpe?g|webp)$/i.test(fn)) images.push(fn);
    }
    images.sort();
    const base = raw || { name, criteria: [], cases: images.map((fn) => ({ id: fn.replace(/\.[^.]+$/, ""), image: fn })) };
    const set = normalizeEvalSet({ ...base, id: name }, name);
    // set.json 里漏写的图片补成用例，方便直接往文件夹里丢图。
    const known = new Set(set.cases.map((c) => c.image));
    const extra = images.filter((fn) => !known.has(fn)).map((fn) => ({ id: fn.replace(/\.[^.]+$/, ""), image: fn, tags: [], extra: [], skip: [], note: "" }));
    set.cases = [...set.cases, ...extra].slice(0, 10);
    set.hasFile = !!raw;
    sets.push(set);
  }
  return sets.sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_EVAL_SETS);
}

export async function saveEvalSet(rootHandle, set) {
  const evalDir = await getEvalDir(rootHandle, true);
  const setsDir = await getDir(evalDir, EVAL_SETS_DIR, true);
  const dir = await getDir(setsDir, set.id, true);
  const { hasFile, ...plain } = set;
  await writeTextFile(dir, "set.json", JSON.stringify(plain, null, 2));
}

export async function readSetImage(rootHandle, setId, fileName) {
  try {
    const evalDir = await getEvalDir(rootHandle, false);
    const setsDir = await getDir(evalDir, EVAL_SETS_DIR, false);
    const dir = await getDir(setsDir, setId, false);
    const fh = await dir.getFileHandle(fileName);
    return await fileToDataUrlFromFile(await fh.getFile());
  } catch {
    return "";
  }
}

export async function writeSetImage(rootHandle, setId, file) {
  const evalDir = await getEvalDir(rootHandle, true);
  const setsDir = await getDir(evalDir, EVAL_SETS_DIR, true);
  const dir = await getDir(setsDir, setId, true);
  const name = file.name.replace(/[^\w.\-一-鿿]/g, "_");
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
  return name;
}

// scores.json 结构：
// { version: 1, entries: { "<turnDir>/<file>": { setId, caseId, modelId, promptKey, prompt, judge,
//     items: { [critId]: { v, gpt: {score, reason}, human?: {score, note, at} } }, at } } }
export async function loadScores(rootHandle) {
  const evalDir = await getEvalDir(rootHandle, false);
  if (!evalDir) return {};
  const raw = await readJson(evalDir, EVAL_SCORES_FILE);
  return raw?.entries && typeof raw.entries === "object" ? raw.entries : {};
}

export async function saveScores(rootHandle, entries) {
  const evalDir = await getEvalDir(rootHandle, true);
  await writeTextFile(evalDir, EVAL_SCORES_FILE, JSON.stringify({ version: 1, entries }, null, 2));
}

export async function loadTagging(rootHandle) {
  const evalDir = await getEvalDir(rootHandle, false);
  if (!evalDir) return normalizeTagging(null);
  return normalizeTagging(await readJson(evalDir, EVAL_TAGGING_FILE));
}

export async function saveTagging(rootHandle, tagging) {
  const evalDir = await getEvalDir(rootHandle, true);
  await writeTextFile(evalDir, EVAL_TAGGING_FILE, JSON.stringify(tagging, null, 2));
}
