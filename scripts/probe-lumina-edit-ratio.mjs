// 探针：判断 Lumina 图像"编辑"(/v1/images/edits) 是否遵守 ratio，
// 还是跟随输入图尺寸而忽略 ratio。只读，不改代码。
//
// 用法: LUMINA_KEY=sk-xxx node scripts/probe-lumina-edit-ratio.mjs
//   可选 MODEL=gemini-3-pro-image-preview（默认用 NanoBanana）

const KEY = process.env.LUMINA_KEY;
if (!KEY) { console.error("缺少 LUMINA_KEY"); process.exit(1); }

const BASE = "https://lumina.tripo3d.com";
const MODEL = process.env.MODEL || "gemini-2.5-flash-image-preview";

function imgSize(buf) {
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

// 1) 先生成一张方图当输入
console.log(`模型: ${MODEL}\n步骤1: 生成一张 1:1 输入图...`);
const genRes = await fetch(`${BASE}/v1/images/generations`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ model: MODEL, prompt: "a plain blue circle on white", n: 1, ratio: "1:1" }),
});
if (!genRes.ok) { console.log("生成失败:", genRes.status, (await genRes.text()).slice(0, 300)); process.exit(1); }
const inputBuf = await toBuf((await genRes.json())?.data?.[0]);
if (!inputBuf) { console.log("无输入图数据"); process.exit(1); }
const inSz = imgSize(inputBuf);
console.log(`  输入图: ${inSz.w} x ${inSz.h}`);

// 2) 用它做编辑，带 ratio:16:9，看输出是横图还是仍是方图
console.log("步骤2: 以该方图为输入，请求编辑 + ratio:16:9 ...");
const fd = new FormData();
fd.append("image", new Blob([inputBuf], { type: "image/png" }), "input.png");
fd.append("model", MODEL);
fd.append("prompt", "add a small yellow star in the corner");
fd.append("n", "1");
fd.append("ratio", "16:9");
const editRes = await fetch(`${BASE}/v1/images/edits`, {
  method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: fd,
});
if (!editRes.ok) { console.log("编辑失败:", editRes.status, (await editRes.text()).slice(0, 300)); process.exit(1); }
const outBuf = await toBuf((await editRes.json())?.data?.[0]);
const outSz = imgSize(outBuf);
console.log(`  编辑输出: ${outSz.w} x ${outSz.h}  (${outSz.w > outSz.h ? "横" : outSz.w < outSz.h ? "竖" : "方"})`);
console.log("\n解读：");
console.log("  输出=横图  -> 编辑遵守 ratio，问题在别处");
console.log("  输出=方图  -> 编辑忽略 ratio、跟随输入图，这就是根因");
