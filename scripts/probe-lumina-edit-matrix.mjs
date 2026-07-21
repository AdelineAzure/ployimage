// 探针矩阵：找出 Lumina 编辑(带输入图)时到底怎么写才能遵守比例。
// 生成一张方图当输入，然后用多种端点/参数组合请求编辑，对比输出尺寸。只读。
// 用法: LUMINA_KEY=sk-xxx node scripts/probe-lumina-edit-matrix.mjs
//   MODEL 默认 gemini-2.5-flash-image-preview
const KEY = process.env.LUMINA_KEY;
if (!KEY) { console.error("缺少 LUMINA_KEY"); process.exit(1); }
const BASE = "https://lumina.tripo3d.com";
const MODEL = process.env.MODEL || "gemini-2.5-flash-image-preview";

function imgSize(buf) {
  if (!buf) return { w: "?", h: "?" };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { w: "?", h: "?" };
}
async function toBuf(item) {
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
  return null;
}
function fmt(sz) { return `${sz.w} x ${sz.h} (${sz.w > sz.h ? "横" : sz.w < sz.h ? "竖" : "方"})`; }

// 输入方图
console.log(`模型: ${MODEL}\n准备 1:1 输入图...`);
const g = await fetch(`${BASE}/v1/images/generations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ model: MODEL, prompt: "a plain blue circle on white", n: 1, ratio: "1:1" }),
});
const inputBuf = await toBuf((await g.json())?.data?.[0]);
console.log(`  输入: ${fmt(imgSize(inputBuf))}\n目标: 让编辑输出变成 16:9 横图\n`);

const inputB64 = inputBuf.toString("base64");
const inputDataUrl = `data:image/png;base64,${inputB64}`;

// multipart /edits 变体
async function editMultipart(label, fields) {
  const fd = new FormData();
  fd.append("image", new Blob([inputBuf], { type: "image/png" }), "input.png");
  fd.append("model", MODEL);
  fd.append("prompt", "add a small yellow star");
  fd.append("n", "1");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${BASE}/v1/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: fd });
  const txt = await res.text();
  if (!res.ok) { console.log(`[${label}] HTTP ${res.status}: ${txt.slice(0, 160)}`); return; }
  console.log(`[${label}] ${JSON.stringify(fields).padEnd(30)} -> ${fmt(imgSize(await toBuf(JSON.parse(txt)?.data?.[0])))}`);
}
// JSON /generations 带 image 字段的变体
async function genJson(label, extra) {
  const res = await fetch(`${BASE}/v1/images/generations`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, prompt: "add a small yellow star", n: 1, image: inputDataUrl, ...extra }),
  });
  const txt = await res.text();
  if (!res.ok) { console.log(`[${label}] HTTP ${res.status}: ${txt.slice(0, 160)}`); return; }
  console.log(`[${label}] ${JSON.stringify(extra).padEnd(30)} -> ${fmt(imgSize(await toBuf(JSON.parse(txt)?.data?.[0])))}`);
}

console.log("== /v1/images/edits (multipart) ==");
await editMultipart("edit ratio    ", { ratio: "16:9" });
await editMultipart("edit size     ", { size: "1536x1024" });
await editMultipart("edit aspect   ", { aspect_ratio: "16:9" });
console.log("\n== /v1/images/generations (JSON + image) ==");
await genJson("gen+img ratio ", { ratio: "16:9" });
await genJson("gen+img size  ", { size: "1536x1024" });
console.log("\n任何一行出现横图，就是可用写法。");
