// 探针：判断 Lumina 网关到底认哪个比例参数（ratio 还是 size），
// 通过对比不同请求返回图片的真实像素尺寸来确定。只读，不改任何代码。
//
// 用法：
//   LUMINA_KEY=sk-你的key node scripts/probe-lumina-ratio.mjs
//   可选：MODEL=gemini-2.5-flash-image-preview（默认）

const KEY = process.env.LUMINA_KEY;
if (!KEY) {
  console.error("缺少 LUMINA_KEY 环境变量。用法: LUMINA_KEY=sk-xxx node scripts/probe-lumina-ratio.mjs");
  process.exit(1);
}

const BASE = "https://lumina.tripo3d.com";
const MODEL = process.env.MODEL || "gemini-2.5-flash-image-preview";
const PROMPT = "a single red apple on a plain white table, centered";

// 读 PNG/JPEG 头部拿真实尺寸
function pngSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: 扫 SOF 段
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
  }
  return { w: "?", h: "?" };
}

async function gen(label, extraBody) {
  const body = { model: MODEL, prompt: PROMPT, n: 1, ...extraBody };
  const res = await fetch(`${BASE}/v1/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log(`\n[${label}] HTTP ${res.status}  body=${JSON.stringify(extraBody)}`);
    console.log("  ->", text.slice(0, 300));
    return;
  }
  let data;
  try { data = JSON.parse(text); } catch { console.log(`[${label}] 非 JSON 响应:`, text.slice(0, 200)); return; }
  const item = data?.data?.[0];
  let buf;
  if (item?.b64_json) buf = Buffer.from(item.b64_json, "base64");
  else if (item?.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
  else { console.log(`[${label}] 无图片数据:`, JSON.stringify(data).slice(0, 200)); return; }
  const { w, h } = pngSize(buf);
  console.log(`[${label}]  请求=${JSON.stringify(extraBody).padEnd(28)}  ->  ${w} x ${h}  (${w > h ? "横" : w < h ? "竖" : "方"})`);
}

console.log(`模型: ${MODEL}\n对比不同比例参数对输出尺寸的影响：`);
await gen("baseline ", {});
await gen("ratio16:9", { ratio: "16:9" });
await gen("ratio9:16", { ratio: "9:16" });
await gen("size 横  ", { size: "1536x1024" });
await gen("size 竖  ", { size: "1024x1536" });
await gen("aspect_ratio", { aspect_ratio: "16:9" });
console.log("\n解读：哪一组请求让尺寸随参数变化，就是 Lumina 认的字段。");
